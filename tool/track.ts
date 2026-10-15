import { tool } from "@opencode-ai/plugin"
import { promises as fs } from "node:fs"
import * as os from "node:os"
import * as path from "node:path"

type Item = { text: string; status: "todo" | "doing" | "done" }
type Store = { items: Item[] }

const TTL_MS = 7 * 24 * 60 * 60 * 1000

function storeDir(): string {
  const dataHome = process.env.XDG_DATA_HOME ?? path.join(os.homedir(), ".local", "share")
  return path.join(dataHome, "opencode", "agent-todos")
}

function safeId(sessionID: string): string {
  const safe = sessionID.replace(/[^A-Za-z0-9._-]/g, "_")
  if (safe === "" || safe === "." || safe === "..") return "session"
  return safe
}

function storeFile(sessionID: string): string {
  return path.join(storeDir(), `${safeId(sessionID)}.json`)
}

// opencode issues independent tool calls in parallel, so two `track` mutations can
// read-modify-write the same session file at once and clobber each other. Serialize
// every operation on a given store file through a per-key promise chain.
const locks = new Map<string, Promise<unknown>>()

function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prior = locks.get(key) ?? Promise.resolve()
  const run = prior.then(fn)
  const tail = run.then(
    () => {},
    () => {},
  )
  locks.set(key, tail)
  void tail.then(() => {
    if (locks.get(key) === tail) locks.delete(key)
  })
  return run
}

function migrateItem(item: any): Item {
  if (!item || typeof item !== "object") return { text: String(item ?? ""), status: "todo" }
  if (item.status === "todo" || item.status === "doing" || item.status === "done") {
    return { text: String(item.text ?? ""), status: item.status }
  }
  if (typeof item.done === "boolean") {
    return { text: String(item.text ?? ""), status: item.done ? "done" : "todo" }
  }
  return { text: String(item.text ?? ""), status: "todo" }
}

async function readStore(sessionID: string): Promise<Store> {
  const file = storeFile(sessionID)
  let raw: string
  try {
    raw = await fs.readFile(file, "utf8")
  } catch (error: any) {
    if (error?.code === "ENOENT") return { items: [] }
    throw new Error(`track: cannot read ${file}: ${error?.message ?? error}`)
  }
  try {
    const parsed = JSON.parse(raw)
    if (parsed && Array.isArray(parsed.items)) {
      return { items: parsed.items.map(migrateItem) }
    }
    throw new Error("unexpected store shape")
  } catch (error: any) {
    // Preserve the unreadable file instead of silently overwriting it on the next write.
    await fs.rename(file, `${file}.corrupt-${Date.now()}`).catch(() => {})
    return { items: [] }
  }
}

async function prune(now = Date.now()): Promise<void> {
  const dir = storeDir()
  let entries: string[]
  try {
    entries = await fs.readdir(dir)
  } catch {
    return
  }
  await Promise.all(
    entries.map(async (name) => {
      if (!name.endsWith(".json") && !name.endsWith(".tmp") && !name.includes(".corrupt-")) return
      const full = path.join(dir, name)
      try {
        const stat = await fs.stat(full)
        if (now - stat.mtimeMs > TTL_MS) await fs.rm(full, { force: true })
      } catch {}
    }),
  )
}

async function writeStore(sessionID: string, store: Store): Promise<void> {
  await fs.mkdir(storeDir(), { recursive: true })
  const file = storeFile(sessionID)
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`
  await fs.writeFile(tmp, JSON.stringify(store, null, 2), "utf8")
  await fs.rename(tmp, file)
  await prune()
}

function render(items: Item[]): string {
  if (items.length === 0) return "(empty)"
  return items
    .map((item, index) => {
      const marker = item.status === "done" ? "[x]" : item.status === "doing" ? "[.]" : "[ ]"
      return `#${index + 1} ${marker} ${item.text}`
    })
    .join("\n")
}

function counts(items: Item[]): string {
  const done = items.filter((entry) => entry.status === "done").length
  const doing = items.filter((entry) => entry.status === "doing").length
  return `${done}/${items.length} done${doing ? `, ${doing} doing` : ""}`
}

export default tool({
  description:
    "Use proactively for multi-step work (3+ steps) - a per-session checklist that keeps your plan out of the chat context; " +
    "skip trivial/one-step tasks. `add` steps (`text` or `items[]`), mark `start`/`doing` as you begin a step and `done` the moment it is " +
    "actually finished or verified - keep at most one `doing`, update immediately, never batch (by 1-based `id`). " +
    "`list` to reorient (e.g. after compaction), `clear` to reset. " +
    "Mutations return only the changed line(s); `list` returns the full checklist. " +
    "Markers: `[ ]` todo, `[.]` doing, `[x]` done. State is per session.",
  args: {
    action: tool.schema
      .enum(["add", "start", "doing", "done", "list", "clear"])
      .describe("add | start/doing | done | list | clear"),
    text: tool.schema.string().optional().describe("One step to add; provide `text` or `items`."),
    items: tool.schema
      .array(tool.schema.string())
      .optional()
      .describe("Several steps in one call (batch add)."),
    id: tool.schema
      .number()
      .int()
      .positive()
      .optional()
      .describe("1-based item id from `list`/`add` output (required for start/doing/done)."),
  },
  execute({ action, text, items, id }, context) {
    return withLock(storeFile(context.sessionID), async () => {
      if (action === "add") {
        const toAdd = items && items.length > 0 ? items : text ? [text] : []
        if (toAdd.length === 0) throw new Error("track: 'text' or 'items' is required for 'add'")
        const store = await readStore(context.sessionID)
        const first = store.items.length + 1
        for (const entry of toAdd) store.items.push({ text: entry, status: "todo" })
        await writeStore(context.sessionID, store)
        if (toAdd.length === 1) return `added #${first} [ ] ${toAdd[0]} (${counts(store.items)})`
        const lines = toAdd.map((entry, i) => `#${first + i} [ ] ${entry}`).join("\n")
        return `added #${first}-${store.items.length} (${counts(store.items)})\n${lines}`
      }

      if (action === "start" || action === "doing") {
        if (typeof id !== "number") throw new Error("track: numeric id is required for 'start'/'doing'")
        const store = await readStore(context.sessionID)
        const item = store.items[id - 1]
        if (!item) throw new Error(`track: no item #${id}`)
        item.status = "doing"
        await writeStore(context.sessionID, store)
        return `#${id} [.] ${item.text} (${counts(store.items)})`
      }

      if (action === "done") {
        if (typeof id !== "number") throw new Error("track: numeric id is required for 'done'")
        const store = await readStore(context.sessionID)
        const item = store.items[id - 1]
        if (!item) throw new Error(`track: no item #${id}`)
        item.status = "done"
        await writeStore(context.sessionID, store)
        return `#${id} [x] ${item.text} (${counts(store.items)})`
      }

      if (action === "list") {
        const store = await readStore(context.sessionID)
        return render(store.items)
      }

      await fs.rm(storeFile(context.sessionID), { force: true })
      return "cleared"
    })
  },
})
