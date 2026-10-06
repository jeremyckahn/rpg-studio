# @rpgstudio/companion-bridge

Lets an AI agent (a Python LangChain script, a local model, anything that can
open a WebSocket) read and edit an RPG Studio project while a human watches the
editor update live.

Rules, file map and pitfalls: [AGENTS.md](AGENTS.md). Protocol reference: [docs/companion-protocol.md](../../docs/companion-protocol.md).

```
 agent  ──ws──▶  companion server  ◀──ws──  editor (browser)
 (Node, Python…)  localhost:8080            dials out; executes requests
```

The **editor connects out** to the server, so nothing has to listen inside a
browser. Agents connect in. The server only relays: it routes each request to
the editor and the answer back to the agent that asked, keeping several agents
apart.

## Try it

```sh
pnpm dev:companion          # starts the relay on ws://localhost:8080
pnpm dev                    # in another terminal; then use "Companion" in the menu bar
pnpm --filter @rpgstudio/companion-bridge demo
```

The demo (`src/demo.ts`) is the reference agent: it reads the project, fetches the
JSON Schema of an actor, reshapes a map in one all-or-nothing batch, generates a
Zod-validated actor, draws a 16×16 sprite as a colour matrix, writes it into the
project (the editor's canvases refresh at once), and finally checks the result
with a path query. A single Undo in the editor reverts each request.

## Protocol

Strict JSON, defined with Zod in `@rpgstudio/core` (`schemas/protocol.ts`), and
validated on both ends. Every connection starts with `hello { role, token? }`.

| Agent sends                 | Meaning                                                                                                               |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `query { query }`           | Read-only: `GET_PROJECT_SUMMARY`, `GET_MAP_DATA`, `GET_TABLE`, `GET_RECORD`, `GET_SCHEMA`, `FIND_PATH`, `LIST_ASSETS` |
| `action { action }`         | One serialised Redux action (`project/setTiles`, …)                                                                   |
| `batch { actions }`         | Several actions, applied all-or-nothing                                                                               |
| `writeAsset { path, data }` | A PNG/audio/`.piskel` file under `img/` or `audio/`                                                                   |

`GET_SCHEMA` returns JSON Schema for the project, maps, actors, classes, items,
skills, enemies, events and the action union, so an agent can learn the exact
shape of what it may send, and validate its own output before sending it.

In the browser console, `RPGStudio.query({ type: 'GET_MAP_DATA', id: 1 })`
answers the same queries.

## Using it from code

```ts
import { connectAgent } from '@rpgstudio/companion-bridge'

const agent = await connectAgent({ url: 'ws://localhost:8080' })
await agent.waitForEditor()
const map = await agent.query({ type: 'GET_MAP_DATA', id: 1 })
await agent.batch([
  {
    type: 'project/fillArea',
    payload: { mapId: 1, layer: 0, tile: 3, startX: 2, startY: 2, endX: 6, endY: 4 },
  },
])
```

Outgoing queries, actions and paths are checked against the core schemas before
they are sent, so a mistake fails locally with a precise message.

## Security

The server listens on a local port, which any web page open in your browser can
try to reach. So:

- It binds to **127.0.0.1** by default.
- Browsers cannot hide their `Origin`. A connection carrying one is **never**
  accepted as an agent (otherwise any site could drive your editor), and is
  accepted as the editor only from an allowed origin: `localhost:5173` and
  `:4173` by default, more with `--allow-origin <url>`.
- `--token <secret>` makes every connection prove it knows a shared secret.
- Each side only accepts the messages that direction may carry: an agent cannot
  forge an editor's answer, and the editor cannot issue requests.
- The editor validates every action against `ProjectActionSchema`, applies
  batches atomically on a copy first, and lets agents write only images and
  audio (never project data or code) of at most 12 MB.
- Messages over 16 MB are rejected, and a request the editor does not answer in
  30 seconds fails rather than hanging.

## Options

```
rpgstudio-companion serve [--port 8080] [--host 127.0.0.1] [--allow-origin URL]... [--token SECRET]
rpgstudio-companion demo  [--url ws://localhost:8080] [--token SECRET]
```
