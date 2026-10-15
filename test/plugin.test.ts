import { test } from "node:test"
import assert from "node:assert/strict"
import plugin from "../plugins/opencode-subagent-todo.ts"

const HINT_MATCH = /use `todowrite` when it is available.*`track`/

async function hooksWith(parentByID: Record<string, string | undefined>, error?: Error) {
  const client = {
    session: {
      get: async ({ path }: { path: { id: string } }) => {
        if (error) throw error
        const parentID = parentByID[path.id]
        return { data: parentID ? { parentID } : {} }
      },
    },
  }
  return plugin.server({ client } as never)
}

async function transform(hooks: Awaited<ReturnType<typeof hooksWith>>, sessionID?: string) {
  const output = { system: [] as string[] }
  const hook = hooks["experimental.chat.system.transform"]
  assert.ok(hook)
  await hook({ sessionID } as never, output)
  return output.system
}

test("registers the `track` tool", async () => {
  const hooks = await hooksWith({})
  assert.ok(hooks.tool?.track, "plugin should expose the track tool")
})

test("primary session (no parent) gets no hint", async () => {
  const hooks = await hooksWith({})
  assert.deepEqual(await transform(hooks, "ses_primary"), [])
})

test("subagent session (has parent) gets the hint", async () => {
  const hooks = await hooksWith({ ses_child: "ses_parent" })
  const system = await transform(hooks, "ses_child")
  assert.equal(system.length, 1)
  assert.match(system[0]!, HINT_MATCH)
})

test("missing sessionID gets no hint", async () => {
  const hooks = await hooksWith({})
  assert.deepEqual(await transform(hooks, undefined), [])
})

test("fails open (adds the hint) when the session lookup throws", async () => {
  const hooks = await hooksWith({}, new Error("boom"))
  assert.match((await transform(hooks, "ses_x"))[0]!, HINT_MATCH)
})

test("caches the session lookup", async () => {
  let calls = 0
  const client = {
    session: {
      get: async () => {
        calls += 1
        return { data: { parentID: "ses_parent" } }
      },
    },
  }
  const hooks = await plugin.server({ client } as never)
  await transform(hooks, "ses_cache")
  await transform(hooks, "ses_cache")
  assert.equal(calls, 1)
})
