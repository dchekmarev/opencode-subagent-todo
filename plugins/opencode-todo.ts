const HINT = [
  "Task tracking: if the `todowrite` tool is available in your toolset, use it and ignore the rest of this note.",
  "Otherwise, when you run without `todowrite` (for example as a subagent), maintain your own task list with the `track` tool:",
  '`track(action:"add", items:["step 1","step 2", ...])` to add all steps at once, `track(action:"start", id:N)` when you begin one, `track(action:"done", id:N)` when a step finishes, `track(action:"list")` to reorient.',
  "Mutations print only the changed line(s) (call `list` for the full checklist), state is stored in your own agent session (not shared with the parent or siblings), and costs no context to keep; never restate the full checklist in your messages.",
].join(" ")

export default {
  id: "opencode-todo",
  server: () => ({
    "experimental.chat.system.transform": async (_input: { sessionID?: string }, output: { system: string[] }) => {
      output.system.push(HINT)
    },
  }),
}
