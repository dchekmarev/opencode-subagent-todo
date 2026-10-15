import type { PluginModule } from "@opencode-ai/plugin"

const HINT =
  "Task tracking: `todowrite` is unavailable here, so keep your plan with the `track` tool " +
  "(`add` steps, `start`/`done` by id, `list` to reorient); don't restate the list in your messages."

const plugin: PluginModule = {
  id: "opencode-todo",
  server: async () => ({
    "experimental.chat.system.transform": async (_input, output) => {
      if (output.system.some((part) => part.includes("todowrite"))) return
      output.system.push(HINT)
    },
  }),
}

export default plugin
