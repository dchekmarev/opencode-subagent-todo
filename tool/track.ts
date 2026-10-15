import { tool } from "@opencode-ai/plugin"
import { promises as fs } from "node:fs"
import * as os from "node:os"
import * as path from "node:path"

type Item = { text: string; done: boolean }
type Store = { items: Item[] }

function storeDir(): string {
  const dataHome = process.env.XDG_DATA_HOME ?? path.join(os.homedir(), ".local", "share")
  return path.join(dataHome, "opencode", "agent-todos")
}

function storeFile(sessionID: string): string {
  return path.join(storeDir(), `${sessionID}.json`)
}

async function readStore(sessionID: string): Promise<Store> {
  try {
    const parsed = JSON.parse(await fs.readFile(storeFile(sessionID), "utf8"))
    if (parsed && Array.isArray(parsed.items)) return { items: parsed.items }
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

function nextPending(items: Item[]): { id: number; text: string } | undefined {
  const idx = items.findIndex((item) => !item.done)
  return idx === -1 ? undefined : { id: idx + 1, text: items[idx].text }
}

export default tool({
  description:
    "Per-session task checklist for tracking your own plan without spending context re-emitting it. " +
    "Use 'add' for each step, 'done' when a step finishes, 'list' to reorient, 'clear' to reset. " +
    "State is isolated to this agent's own session (not shared with the parent or sibling agents); never restate the list in chat.",
  args: {
    action: tool.schema.enum(["add", "done", "list", "clear"]).describe("Operation to perform"),
    text: tool.schema.string().optional().describe("Item text (required for 'add')"),
    id: tool.schema.number().int().positive().optional().describe("Item id (required for 'done')"),
  },
  async execute({ action, text, id }, context) {
    if (action === "add") {
      if (!text) return "error: text is required for add"
      const store = await readStore(context.sessionID)
      store.items.push({ text, done: false })
      await writeStore(context.sessionID, store)
      return `added #${store.items.length} "${text}" (${store.items.length} total)`
    }

    if (action === "done") {
      if (typeof id !== "number") return "error: numeric id is required for done"
      const store = await readStore(context.sessionID)
      const item = store.items[id - 1]
      if (!item) return `error: no item #${id}`
      item.done = true
      await writeStore(context.sessionID, store)
      const completed = store.items.filter((entry) => entry.done).length
      const next = nextPending(store.items)
      return `done #${id} "${item.text}" (${completed}/${store.items.length})${next ? ` | next #${next.id} "${next.text}"` : " | all done"}`
    }

    if (action === "list") {
      const store = await readStore(context.sessionID)
      if (store.items.length === 0) return "empty"
      return store.items.map((item, index) => `${item.done ? "[x]" : "[ ]"} #${index + 1} ${item.text}`).join("\n")
    }

    await fs.rm(storeFile(context.sessionID), { force: true })
    return "cleared"
  },
})
