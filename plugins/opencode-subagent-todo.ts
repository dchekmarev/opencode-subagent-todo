import type { PluginModule } from "@opencode-ai/plugin"
import trackTool from "../tool/track.ts"

const HINT =
  "Task tracking: use `todowrite` when it is available; otherwise keep your plan with the `track` tool " +
  "(`add` steps, `start`/`done` by id, `list` to reorient); don't restate the list in your messages."

const plugin: PluginModule = {
  id: "opencode-subagent-todo",
  server: async ({ client }) => {
    // Sessions started by a subagent (the `task` tool) carry a parent id, and only
    // those lack the built-in `todowrite`. Detect them from the session itself instead
    // of scanning the system prompt for a tool name, which is unreliable.
    const subagents = new Map<string, boolean>()

    async function isSubagent(sessionID: string): Promise<boolean> {
      const cached = subagents.get(sessionID)
      if (cached !== undefined) return cached
      try {
        const result = await client.session.get({ path: { id: sessionID } })
        const value = result.data?.parentID != null
        subagents.set(sessionID, value)
        return value
      } catch {
        // On any lookup failure add the (safe, both-ways) hint rather than dropping it.
        return true
      }
    }

    return {
      // Registering the tool from the plugin (rather than relying on a scanned
      // `tool/` file) is what makes the package installable straight from npm via
      // `"plugin": ["opencode-subagent-todo"]`.
      tool: { track: trackTool },
      "experimental.chat.system.transform": async (input, output) => {
        if (!input.sessionID) return
        if (!(await isSubagent(input.sessionID))) return
        output.system.push(HINT)
      },
    }
  },
}

export default plugin
