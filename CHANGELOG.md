# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.1] - 2026-10-15

### Added

- CI workflow (typecheck + tests on Node 22.18 and 24) and an npm release
  workflow using Trusted Publishing (OIDC, no stored tokens).
- Dependabot updates for npm and GitHub Actions.

### Changed

- Bumped `@opencode-ai/plugin` from 1.4.7 to 1.19.0.
- Hardened the `track` tool: unknown actions now throw instead of silently
  clearing state; item text is trimmed and capped at 500 characters; state files
  are written with `0600` and the session directory with `0700`.

## [0.1.0] - 2026-10-15

### Added

- `track` tool: a per-session checklist for opencode subagents, with `add`/`start`/
  `doing`/`done`/`list`/`clear`/`remove`/`edit` actions. Mutations return only the
  changed line(s) to keep the model's context small.
- `opencode-subagent-todo` plugin: registers the `track` tool and appends a
  system-prompt hint telling the model to prefer `todowrite`, falling back to
  `track` for subagent sessions.
- Installable straight from npm via `"plugin": ["opencode-subagent-todo"]`.

[Unreleased]: https://github.com/dchekmarev/opencode-subagent-todo/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/dchekmarev/opencode-subagent-todo/releases/tag/v0.1.1
[0.1.0]: https://github.com/dchekmarev/opencode-subagent-todo/releases/tag/v0.1.0
