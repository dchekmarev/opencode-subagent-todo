# opencode-todo

Per-session task tracking for [opencode](https://opencode.ai) subagents.

opencode ships a built-in `todowrite` tool for the main agent, but it is denied to
subagents (see [anomalyco/opencode#12938](https://github.com/anomalyco/opencode/issues/12938)).
That leaves subagents with no cheap way to keep a plan: re-emitting a checklist in
chat burns context on every turn and is easy to get wrong.

This project provides a lightweight alternative:

- **`track` tool** — a small, deterministic checklist stored **per session**, so lists
  never leak between sessions and cost no context to keep. The model only sends
  deltas (`add` / `done` by id) and never has to restate the whole list.
- **`opencode-todo` plugin** — appends a short system-prompt note to **every**
  session telling the model to prefer `todowrite` when it is available, and to fall
  back to `track` otherwise (i.e. as a subagent).

**What "session" means.** A session is one opencode agent run, not your chat window.
Every subagent runs in its own session, so within a single conversation the primary
agent and each subagent it spawns get **separate** lists — siblings never share state.
Resuming a subagent with `task_id` reuses its session (and therefore its list); a fresh
subagent gets a fresh, empty list.

## How it works

- The `track` tool is a custom opencode tool. Custom tools are registered globally,
  so every agent — including subagents at any nesting depth — receives it
  automatically. No per-agent configuration is required.
- State lives in `$XDG_DATA_HOME/opencode/agent-todos/<sessionID>.json`
  (`~/.local/share/opencode/agent-todos/` by default), one file per session, written
  atomically.
- The plugin uses the `experimental.chat.system.transform` hook to add the guidance.
  For primary agents the note is a no-op, since `todowrite` is already available.

## Install

Requires opencode 1.x. From a checkout of this repository:

```sh
npm install          # resolves @opencode-ai/plugin (for the tool's zod schema)
./install.sh         # symlinks tool/ and plugins/ into ~/.opencode
```

`install.sh` links into `~/.opencode` by default. To target the XDG config directory
instead:

```sh
OPENCODE_DOTDIR=~/.config/opencode ./install.sh
```

Then restart opencode.

### Allowing `track` for the built-in `explore` subagent

`explore` denies all tools by default (`"*": "deny"`) and only re-allows a read-only
set. To let it use `track`, add a rule to `agent.explore.permission` in your
`opencode.json` (config rules are appended last and win):

```json
{
  "agent": {
    "explore": {
      "permission": { "track": "allow" }
    }
  }
}
```

Other subagents (e.g. `general`, or any custom agent) receive `track` by default.

## Tool reference

`track(action, text?, id?)`

| action  | args            | result                                                       |
| ------- | --------------- | ------------------------------------------------------------ |
| `add`   | `text`          | appends an item, returns its `#id`                           |
| `done`  | `id`            | marks the item complete, returns progress and the next item  |
| `list`  | —               | prints the checklist with `[x]` / `[ ]` marks                |
| `clear` | —               | deletes the session's list                                   |

## Layout

```
tool/track.ts            the `track` custom tool
plugins/opencode-todo.ts system-prompt hint plugin
install.sh               symlink installer
```

## License

MIT
