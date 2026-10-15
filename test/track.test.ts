import { after, before, test } from "node:test"
import assert from "node:assert/strict"
import { promises as fs } from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import track from "../tool/track.ts"

let dataHome: string
const dir = () => path.join(dataHome, "opencode", "agent-todos")

const run = (action: string, extra: Record<string, unknown> = {}, sessionID = "ses_test") =>
  track.execute({ action, ...extra } as never, { sessionID } as never)

before(async () => {
  dataHome = await fs.mkdtemp(path.join(os.tmpdir(), "opencode-todo-"))
  process.env.XDG_DATA_HOME = dataHome
})

after(async () => {
  await fs.rm(dataHome, { recursive: true, force: true })
})

test("add/list/start/done flow emits only changed lines", async () => {
  assert.match(await run("add", { items: ["a", "b", "c"] }, "ses_flow"), /added #1-3 \(0\/3 done\)/)
  assert.equal(await run("list", {}, "ses_flow"), "#1 [ ] a\n#2 [ ] b\n#3 [ ] c")
  assert.equal(await run("done", { id: 2 }, "ses_flow"), "#2 [x] b (1/3 done)")
  assert.equal(await run("start", { id: 3 }, "ses_flow"), "#3 [.] c (1/3 done, 1 doing)")
})

test("serializes concurrent mutations (no lost updates)", async () => {
  await run("add", { items: ["a", "b", "c"] }, "ses_race")
  await Promise.all([
    run("done", { id: 1 }, "ses_race"),
    run("done", { id: 2 }, "ses_race"),
    run("done", { id: 3 }, "ses_race"),
  ])
  assert.equal(await run("list", {}, "ses_race"), "#1 [x] a\n#2 [x] b\n#3 [x] c")
})

test("serializes concurrent adds in call order", async () => {
  await Promise.all([
    run("add", { text: "p" }, "ses_race_add"),
    run("add", { text: "q" }, "ses_race_add"),
    run("add", { text: "r" }, "ses_race_add"),
  ])
  assert.equal(await run("list", {}, "ses_race_add"), "#1 [ ] p\n#2 [ ] q\n#3 [ ] r")
})

test("state is isolated per session", async () => {
  await run("add", { text: "only-a" }, "ses_a")
  assert.equal(await run("list", {}, "ses_b"), "(empty)")
})

test("clear resets the session", async () => {
  await run("add", { text: "x" }, "ses_clear")
  assert.equal(await run("clear", {}, "ses_clear"), "cleared")
  assert.equal(await run("list", {}, "ses_clear"), "(empty)")
})

 test("throws on unknown id and missing add text", async () => {
   await assert.rejects(run("done", { id: 99 }, "ses_err"), /no item #99/)
   await assert.rejects(run("add", {}, "ses_err"), /is required for 'add'/)
 })

 test("remove renumbers and returns the full list", async () => {
   await run("add", { items: ["a", "b", "c"] }, "ses_remove")
   const res = await run("remove", { id: 2 }, "ses_remove")
   assert.equal(res, "removed #2 (0/2 done)\n#1 [ ] a\n#2 [ ] c")
 })

 test("remove of unknown id throws", async () => {
   await run("add", { text: "x" }, "ses_remove_err")
   await assert.rejects(run("remove", { id: 2 }, "ses_remove_err"), /no item #2/)
 })

 test("edit changes text and preserves id and current status (todo/doing/done)", async () => {
   await run("add", { items: ["a", "b", "c"] }, "ses_edit")
   await run("done", { id: 2 }, "ses_edit")
   await run("start", { id: 3 }, "ses_edit")
   const t = await run("edit", { id: 1, text: "new a" }, "ses_edit")
   assert.equal(t, "#1 [ ] new a (1/3 done, 1 doing)")
   const d = await run("edit", { id: 2, text: "new b" }, "ses_edit")
   assert.equal(d, "#2 [x] new b (1/3 done, 1 doing)")
   const s = await run("edit", { id: 3, text: "new c" }, "ses_edit")
   assert.equal(s, "#3 [.] new c (1/3 done, 1 doing)")
   assert.equal(await run("list", {}, "ses_edit"), "#1 [ ] new a\n#2 [x] new b\n#3 [.] new c")
 })

 test("edit of unknown id throws", async () => {
   await run("add", { text: "x" }, "ses_edit_err")
   await assert.rejects(run("edit", { id: 2, text: "y" }, "ses_edit_err"), /no item #2/)
 })

 test("edit without text throws", async () => {
   await run("add", { text: "x" }, "ses_edit_err2")
   await assert.rejects(run("edit", { id: 1 }, "ses_edit_err2"), /'text' is required for 'edit'/)
 })

test("sanitizes session id to keep writes inside the store dir", async () => {
  await run("add", { text: "safe" }, "../../evil")
  const names = await fs.readdir(dir())
  assert.ok(names.includes(".._.._evil.json"))
})

test("moves an unreadable store aside instead of wiping it", async () => {
  await fs.mkdir(dir(), { recursive: true })
  await fs.writeFile(path.join(dir(), "ses_corrupt.json"), "{ not json")
  assert.equal(await run("list", {}, "ses_corrupt"), "(empty)")
  const names = await fs.readdir(dir())
  assert.ok(names.some((n) => n.startsWith("ses_corrupt.json.corrupt-")))
})

test("prunes session files older than the TTL", async () => {
  await fs.mkdir(dir(), { recursive: true })
  const stale = path.join(dir(), "ses_stale.json")
  await fs.writeFile(stale, JSON.stringify({ items: [] }))
  const past = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  await fs.utimes(stale, past, past)
  await run("add", { text: "trigger prune" }, "ses_fresh")
  assert.ok(!(await fs.readdir(dir())).includes("ses_stale.json"))
})

test("start resets any other doing item to todo and reports reset", async () => {
  await run("add", { items: ["a", "b"] }, "ses_single_doing")
  await run("start", { id: 1 }, "ses_single_doing")
  const res = await run("start", { id: 2 }, "ses_single_doing")
  assert.equal(res, "#2 [.] b (0/2 done, 1 doing; reset #1 to todo)")
  assert.equal(await run("list", {}, "ses_single_doing"), "#1 [ ] a\n#2 [.] b")
})

test("only one item remains doing after reset", async () => {
  await run("add", { items: ["a", "b", "c"] }, "ses_single_remains")
  await run("start", { id: 1 }, "ses_single_remains")
  await run("start", { id: 2 }, "ses_single_remains")
  const list = await run("list", {}, "ses_single_remains")
  const doingCount = (list.match(/\[\.\]/g) || []).length
  assert.equal(doingCount, 1)
})

test("starting the same item twice is idempotent (no reset note)", async () => {
  await run("add", { items: ["a", "b"] }, "ses_idem")
  await run("start", { id: 1 }, "ses_idem")
  const res1 = await run("start", { id: 1 }, "ses_idem")
  assert.equal(res1, "#1 [.] a (0/2 done, 1 doing)")
})
