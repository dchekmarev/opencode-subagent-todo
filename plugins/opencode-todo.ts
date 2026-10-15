const HINT =
  "Task tracking: `todowrite` is unavailable here, so keep your plan with the `track` tool " +
  "(`add` steps, `start`/`done` by id, `list` to reorient); don't restate the list in your messages."

export default {
  id: "opencode-todo",
  server: () => ({
    "experimental.chat.system.transform": async (
      _input: { sessionID?: string; model: unknown },
      output: { system: string[] },
    ) => {
      if (output.system.some((part) => part.includes("todowrite"))) return
      output.system.push(HINT)
    },
  }),
}
