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
