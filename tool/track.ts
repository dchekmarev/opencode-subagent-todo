import { tool } from "@opencode-ai/plugin"
import { promises as fs } from "node:fs"
import * as os from "node:os"
import * as path from "node:path"

type Item = { text: string; status: "todo" | "doing" | "done" }
type Store = { items: Item[] }

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

async function writeStore(sessionID: string, store: Store): Promise<void> {
  await fs.mkdir(storeDir(), { recursive: true })
  const file = storeFile(sessionID)
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`
  await fs.writeFile(tmp, JSON.stringify(store, null, 2), "utf8")
  await fs.rename(tmp, file)
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
    "Per-session task checklist for tracking your own plan without spending context re-emitting it. " +
    "States: [ ] todo, [.] in-progress (doing), [x] done. " +
    "Use 'add' to add todo(s) (pass 'items' array to add several at once), 'start'/'doing' to set in-progress, " +
    "'done' to finish, 'list' to reorient, 'clear' to reset. " +
    "Mutations print ONLY the changed line(s) to avoid duplicating the list in context; call 'list' when you need the full checklist. " +
    "State is isolated to this agent's own session (not shared with the parent or sibling agents).",
  args: {
    action: tool.schema
      .enum(["add", "start", "doing", "done", "list", "clear"])
      .describe("Operation to perform"),
    text: tool.schema.string().optional().describe("Single item text (for 'add')"),
    items: tool.schema
      .array(tool.schema.string())
      .optional()
      .describe("Multiple item texts to add at once (for 'add')"),
    id: tool.schema
      .number()
      .int()
      .positive()
      .optional()
      .describe("Item id (required for 'start'/'doing'/'done')"),
  },
  async execute({ action, text, items, id }, context) {
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
  },
})
