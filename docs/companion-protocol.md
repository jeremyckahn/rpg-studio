# Companion bridge protocol

How an external agent (a Node script, a Python LangChain program, a local model) reads and
edits a project that is open in the editor. Implementation:

- schemas: `packages/core/src/schemas/protocol.ts` (the contract, shared by all parties)
- relay server, agent library, CLI, demo: `packages/companion-bridge/src/`
- editor side: `packages/editor/src/bridge/`

Rationale and threat model: [decisions.md ADR-018](decisions.md#adr-018-companion-bridge-topology-and-security).

## 1. Topology

```
agent ──ws──▶ relay server ◀──ws── editor (browser)
              (127.0.0.1:8080)     dials OUT; executes requests
```

The editor is a browser app and cannot listen, so it connects out to the relay. The relay
**only routes**: it validates message envelopes and enforces connection security, but never
interprets project data. The editor does all semantic validation.

Start it with `pnpm dev:companion` (or `rpgstudio-companion serve`), connect the editor from the
**Companion** button in the menu bar, then run an agent (`pnpm --filter @rpgstudio/companion-bridge demo`).

## 2. Framing

Text WebSocket frames, one JSON object each, at most **16 MiB** (`MAX_COMPANION_MESSAGE_BYTES`).
Binary frames are not used. Protocol version is **1**. Default address `ws://localhost:8080`
(`DEFAULT_COMPANION_URL`). Request ids are strings of 1–64 characters, chosen by the sender and
echoed in the answer.

## 3. Handshake

The first message on every connection must be a `hello`, within 5 s (configurable), or the
server closes with 4408.

```json
{ "kind": "hello", "protocol": 1, "role": "agent", "name": "my-bot", "token": "optional-secret" }
```

`role` is `"agent"` or `"editor"`; `name` and `token` are optional. The server answers:

```json
{ "kind": "welcome", "protocol": 1, "role": "agent", "editorConnected": true }
```

(`editorConnected` is always `true` for the editor's own welcome.) Agents then receive
`{ "kind": "status", "editorConnected": <bool> }` whenever the editor connects or disconnects.
Only one editor is connected at a time: a new editor replaces the old one, which is closed with 4000.

## 4. Agent → server requests

All requests carry an `id`. Anything not matching one of these four shapes gets an error result
(or is ignored if no id can be recovered).

### `query` (read-only)

```json
{ "kind": "query", "id": "1", "query": { "type": "GET_MAP_DATA", "id": 1 } }
```

| `query.type`          | Extra fields                      | Result                                                                                                                                                                                                     |
| --------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET_PROJECT_SUMMARY` |                                   | `{ name, revision, startMapId, startX, startY, startParty, plugins, maps: [{ id, name, width, height, tileSize, tileset, layers: [name], events }], counts: { actors, classes, items, skills, enemies } }` |
| `GET_MAP_DATA`        | `id` (map id)                     | the full `Tilemap`                                                                                                                                                                                         |
| `GET_TABLE`           | `table`                           | all records of `actors \| classes \| items \| skills \| enemies`                                                                                                                                           |
| `GET_RECORD`          | `table`, `id`                     | one record                                                                                                                                                                                                 |
| `GET_SCHEMA`          | `name`                            | JSON Schema (draft 2020-12, _input_ side: defaults are optional) for one of `project map actor class item skill enemy mapEvent eventPage eventCommand action pixelMatrix`                                  |
| `FIND_PATH`           | `mapId`, `from {x,y}`, `to {x,y}` | `{ found: boolean, path: [{x,y}] }` using the map's real collision                                                                                                                                         |
| `LIST_ASSETS`         |                                   | `[{ path, bytes }]`                                                                                                                                                                                        |

`GET_SCHEMA` with `name: "action"` returns the schema of every legal edit, which is the best way
for a model to learn what it may send.

### `action` (one edit)

```json
{
  "kind": "action",
  "id": "2",
  "action": {
    "type": "project/fillArea",
    "payload": { "mapId": 1, "layer": 0, "tile": 3, "startX": 2, "startY": 2, "endX": 6, "endY": 4 }
  }
}
```

`action` is validated by the editor against `ProjectActionSchema`: one of the sixteen
`project/*` actions listed in [editor.md](editor.md#project-actions), optionally with
`meta: { historyGroup }`. Success result: `{ "applied": 1, "revision": <n> }`.

### `batch` (several edits, atomic)

```json
{ "kind": "batch", "id": "3", "actions": [{ "type": "…" }, { "type": "…" }] }
```

1–1000 actions. The editor validates each, applies them in order to a **working copy**, and
only if all succeed dispatches them (all sharing one history group). If action _k_ is invalid
or refused, **nothing is applied** and the error names it ("Action 3 (project/setTiles) was
refused: …"). One Undo in the editor reverts the whole batch. Result: `{ applied, revision }`.

### `writeAsset`

```json
{ "kind": "writeAsset", "id": "4", "path": "img/characters/aria.png", "data": "<base64>" }
```

`path` must be an `AssetPath` and match `^(img|audio)/….(png|jpg|jpeg|gif|webp|ogg|mp3|m4a|wav|piskel)$`;
decoded data ≤ 12 MiB. Project data (`project.json`, `data/*`, `maps/*`) and plugin code cannot be written
this way. The write goes through the asset store, which resets the texture cache so any open
canvas shows new art immediately. Result: `{ path, bytes }`.

## 5. Results

Sent by the editor, relayed to the asking agent with its original id:

```json
{ "kind": "result", "id": "2", "ok": true,  "result": { "applied": 1, "revision": 7 } }
{ "kind": "result", "id": "2", "ok": false, "error": "Action 1 (project/setTiles) was refused: Cell (99, 0) is outside the 6x4 map" }
```

Errors the **server** generates (same shape, `ok: false`): `No editor is connected`,
`The editor disconnected` (in-flight requests), `The agent disconnected`,
`The editor did not answer in time` (30 s), `Invalid request: …`. Error messages are written
to be read by a model and acted on.

## 6. Direction rules and close codes

Each direction accepts only its own messages (`AgentToServerSchema`, `EditorToServerSchema`,
`ServerToAgentSchema`, `ServerToEditorSchema`): an agent cannot send a `result` (so cannot forge
the editor's answers), and the editor cannot send requests.

| Close code | Meaning                                   |
| ---------- | ----------------------------------------- |
| 4000       | Replaced by a newer editor connection     |
| 4400       | The first message was not a valid `hello` |
| 4401       | Missing or wrong token                    |
| 4403       | Origin not allowed                        |
| 4408       | No `hello` before the timeout             |

The editor client does not retry after 4400/4401/4403.

## 7. Security model

A page in the user's browser can open a WebSocket to `localhost`. Defences:

1. The server binds **127.0.0.1** unless told otherwise.
2. Browsers always send an `Origin` header and scripts do not. A connection **with** an origin is
   **never accepted as an agent**; it is accepted as the editor only if its origin is in the
   allow-list (`localhost:5173`, `127.0.0.1:5173`, `localhost:4173`, `127.0.0.1:4173`, plus
   `--allow-origin <url>` for a deployed editor). A malicious site therefore cannot drive the editor.
3. `--token <secret>` makes every connection (both roles) prove it knows the secret.
4. Strict schemas on every hop; unknown fields are rejected.
5. In the editor: Zod validation, dry run, atomic batches, asset allow-list and size limit,
   one history group per request so the user can always undo what an agent did.

## 8. Writing an agent

Node/TypeScript: use `connectAgent` from `@rpgstudio/companion-bridge`. It validates queries,
actions and paths locally with the core schemas _before_ sending.

```ts
const agent = await connectAgent({ url: 'ws://localhost:8080', token })
await agent.waitForEditor()
const map = await agent.query({ type: 'GET_MAP_DATA', id: 1 })
await agent.batch([{ type: 'project/fillArea', payload: {/* … */} }])
await agent.writeAsset('img/characters/aria.png', pngBytes)
```

Any other language: open the WebSocket, send `hello`, read `welcome`, then send requests and match
results by `id`. A Python sketch:

```python
import asyncio, json, websockets

async def main():
    async with websockets.connect("ws://localhost:8080") as ws:
        await ws.send(json.dumps({"kind": "hello", "protocol": 1, "role": "agent"}))
        print(await ws.recv())  # welcome
        await ws.send(json.dumps({"kind": "query", "id": "1", "query": {"type": "GET_SCHEMA", "name": "actor"}}))
        while (msg := json.loads(await ws.recv()))["kind"] != "result":
            pass  # skip `status` pushes
        print(msg)

asyncio.run(main())
```

The reference agent, `src/demo.ts`, is the canonical example of a well-behaved session: read the
project, fetch a schema, reshape a map in one batch, validate a generated record with Zod, write
generated pixel art, and verify the result with a path query.

## 9. In the browser console

`window.RPGStudio` (non-enumerable) exposes the same machinery in-page:
`RPGStudio.query({ type: 'GET_MAP_DATA', id: 1 })` (throws with the reason on failure) and
`RPGStudio.dispatch(action)` (returns a `Result`).

## 10. Extending the protocol

- **New query:** add a variant to `QuerySchema` (core), handle it in `editor/src/bridge/queries.ts`
  (`runQuery`; the `switch` is exhaustive so TypeScript will point at it), add it to the table above,
  add tests in `editor/test/bridge.test.ts` and `core/test/protocol.test.ts`.
- **New action:** see [extending.md](extending.md#add-a-project-action); it is available to agents
  automatically.
- **New request kind:** add it to `AgentRequestSchema` and `createCompanionHandler`'s `switch`;
  the relay forwards any valid `AgentRequest` untouched. Bump `COMPANION_PROTOCOL_VERSION` only for
  incompatible changes.
- **Server behaviour** lives in `companion-bridge/src/server.ts`; every security property above has a test in
  `companion-bridge/test/server.test.ts`. Keep it that way.
