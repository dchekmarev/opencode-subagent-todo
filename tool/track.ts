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

function storeFile(sessionID: string): string {
  return path.join(storeDir(), `${sessionID}.json`)
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
  try {
    const parsed = JSON.parse(await fs.readFile(storeFile(sessionID), "utf8"))
    if (parsed && Array.isArray(parsed.items)) {
      return { items: parsed.items.map(migrateItem) }
    }
  } catch {}
  return { items: [] }
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

export default tool({
  description:
    "Per-session task checklist for tracking your own plan without spending context re-emitting it. " +
    "States: [ ] todo, [.] in-progress (doing), [x] done. " +
    "Use 'add' to add todo, 'start'/'doing' to set in-progress, 'done' to finish, 'list' to reorient, 'clear' to reset. " +
    "Every call prints the current checklist (format: #id [marker] text) so never restate the list in chat. " +
    "State is isolated to this agent's own session (not shared with the parent or sibling agents).",
  args: {
    action: tool.schema
      .enum(["add", "start", "doing", "done", "list", "clear"])
      .describe("Operation to perform"),
    text: tool.schema.string().optional().describe("Item text (required for 'add')"),
    id: tool.schema
      .number()
      .int()
      .positive()
      .optional()
      .describe("Item id (required for 'start'/'doing'/'done')"),
  },
  async execute({ action, text, id }, context) {
    if (action === "add") {
      if (!text) return "error: text is required for add"
      const store = await readStore(context.sessionID)
      store.items.push({ text, status: "todo" })
      await writeStore(context.sessionID, store)
      return `added #${store.items.length} "${text}"\n${render(store.items)}`
    }

    if (action === "start" || action === "doing") {
      if (typeof id !== "number") return "error: numeric id is required for start/doing"
      const store = await readStore(context.sessionID)
      const item = store.items[id - 1]
      if (!item) return `error: no item #${id}`
      item.status = "doing"
      await writeStore(context.sessionID, store)
      const doing = store.items.filter((entry) => entry.status === "doing").length
      const done = store.items.filter((entry) => entry.status === "done").length
      return `started #${id} "${item.text}" (doing:${doing} done:${done}/${store.items.length})\n${render(store.items)}`
    }

    if (action === "done") {
      if (typeof id !== "number") return "error: numeric id is required for done"
      const store = await readStore(context.sessionID)
      const item = store.items[id - 1]
      if (!item) return `error: no item #${id}`
      item.status = "done"
      await writeStore(context.sessionID, store)
      const done = store.items.filter((entry) => entry.status === "done").length
      return `done #${id} "${item.text}" (${done}/${store.items.length})\n${render(store.items)}`
    }

    if (action === "list") {
      const store = await readStore(context.sessionID)
      return render(store.items)
    }

    await fs.rm(storeFile(context.sessionID), { force: true })
    return "cleared\n(empty)"
  },
})
