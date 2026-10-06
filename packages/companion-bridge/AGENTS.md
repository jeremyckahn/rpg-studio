# AGENTS.md: `@rpgstudio/companion-bridge`

The local relay and tooling that lets external AI agents drive the editor. Node-only. Read the
[root AGENTS.md](../../AGENTS.md) first, then [docs/companion-protocol.md](../../docs/companion-protocol.md)
(the protocol and security model) and the [README](README.md) (usage).

## Hard rules for this package

- **The server only routes.** It validates envelopes and enforces connection security; it never interprets project data. Semantic validation
  belongs in the editor (`packages/editor/src/bridge/handler.ts`).
- **The protocol lives in core** (`core/src/schemas/protocol.ts`). Never define wire shapes here; import the schemas. Each direction
  accepts only its own messages.
- **Security properties are non-negotiable and each has a test** in `test/server.test.ts`: loopback bind by default, a connection with an
  `Origin` header is never an agent and is the editor only from an allowed origin, optional shared token, no forged results, 16 MB message cap,
  request timeouts, failing in-flight requests on disconnect. Do not weaken one without replacing its test and updating
  [ADR-018](../../docs/decisions.md#adr-018-companion-bridge-topology-and-security).
- Node ≥ 22. No DOM. Uses `ws`.
- Imports `@rpgstudio/core` only; it must not depend on the editor (the editor has it as a devDependency for the e2e test).
- No parameter-property classes in CLI-reachable code if you want `node --experimental-strip-types` to work (the dev scripts use `tsx`).

## Map

```
src/server.ts    startCompanionServer: handshake, role/origin/token checks, routing with rewritten ids, timeouts, replacement of the editor
src/agent.ts     connectAgent: validates outgoing queries/actions/paths with core schemas, request/response matching, waitForEditor
src/demo.ts      runDemo: the reference agent (read, discover schema, batch terrain, validated actor, pixel art, path check)
src/cli.ts       `rpgstudio-companion serve|demo` (node:util parseArgs); built with a shebang
src/rawData.ts   rawDataToString for ws RawData
src/index.ts     public API (server, agent, demo, rawData)
test/server.test.ts   real sockets
```

## Invariants worth knowing

- Relay ids are `r<n>`; the original agent id is restored on the way back, so two agents may reuse the same id.
- Close codes: 4000 replaced, 4400 bad hello, 4401 unauthorized, 4403 forbidden origin, 4408 hello timeout (`CLOSE`).
- Defaults: port 8080, host 127.0.0.1, hello timeout 5 s, request timeout 30 s, allowed editor origins `localhost`/`127.0.0.1` on 5173 and 4173.
- `connectAgent` rejects with `CompanionError`; `ProjectActionSchema.parse` errors (ZodError) are thrown synchronously before anything is sent.
- `demo.ts` must stay a _good example_: it is what a future agent author copies.

## Testing

`pnpm --filter @rpgstudio/companion-bridge test` (real servers on port 0, torn down in `afterEach`). The cross-package end-to-end test
is `packages/editor/test/e2e/companion.e2e.test.ts`; run the editor tests after changing the server, agent or demo.

## Running it

`pnpm dev:companion` (serve, via `tsx --conditions=source`), `pnpm --filter @rpgstudio/companion-bridge demo`, or after `pnpm build`:
`node packages/companion-bridge/dist/cli.js serve --port 8080 --allow-origin https://your-editor.example`.

## Pitfalls

- `ws` throws on an unhandled `error` event; test sockets need an `error` listener.
- A browser-based test client must send an `Origin`; the e2e test wraps `ws` with `{ origin }` to behave like a browser.
- Changing `demo.ts` output (tile counts, asset paths, actor name) breaks the e2e assertions; update them together.
