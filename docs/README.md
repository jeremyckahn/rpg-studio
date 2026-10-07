# Documentation index

Looking for the guide to **using** the app? See the [user guide](user-guide/README.md). The rest of this folder is for people changing the code.

Start with the root [AGENTS.md](../AGENTS.md) for commands, rules and gotchas. This folder holds the details.
Every package also has its own `AGENTS.md` with a file map and local rules: [core](../packages/core/AGENTS.md),
[engine](../packages/engine/AGENTS.md), [editor](../packages/editor/AGENTS.md),
[companion-bridge](../packages/companion-bridge/AGENTS.md), [e2e](../packages/e2e/AGENTS.md); plus [tooling](../tooling/AGENTS.md) and the
[vendored Piskel folder](../packages/editor/public/piskel/AGENTS.md).

| Document                                               | Read it to…                                                                             |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| [architecture.md](architecture.md)                     | see how the packages, the editor, the engine, export and the AI bridge fit together     |
| [decisions.md](decisions.md)                           | learn _why_ each significant choice was made, what it costs, and what was rejected      |
| [data-model.md](data-model.md)                         | know every schema, limit, file format and reference rule                                |
| [engine.md](engine.md)                                 | work on simulation, events, saves, rendering, audio, the player or the headless harness |
| [editor.md](editor.md)                                 | work on the store, project actions, undo, project I/O, canvas, Piskel, export, PWA      |
| [plugins.md](plugins.md)                               | write or load a plugin; understand capabilities and the sandbox                         |
| [companion-protocol.md](companion-protocol.md)         | implement an agent or change the AI bridge                                              |
| [extending.md](extending.md)                           | follow step-by-step recipes for common changes                                          |
| [testing.md](testing.md)                               | run, write and trust tests; know what is not automated                                  |
| [tooling-and-deployment.md](tooling-and-deployment.md) | understand configs, builds, Vercel and pnpm                                             |
| [troubleshooting.md](troubleshooting.md)               | fix a confusing failure fast                                                            |

## Known gaps and limitations (single list)

Honest status, so nobody builds on an assumption that is not true. Each item is detailed where linked.

| Gap                                                       | Detail                                                                                                                                                                                                                     |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The editor does not auto-load a project's `plugins/<id>/` | Only the engine player does; first-party plugins are bundled. [plugins.md](plugins.md#status-what-works-and-what-is-not-wired-up-yet)                                                                                      |
| The `render` plugin capability is unprovided              | No host implements it; plugins declaring it are rejected                                                                                                                                                                   |
| Real audio playback is unverified                         | `@pixi/sound` streaming switch is only covered by mocks. [engine.md §6](engine.md#6-audio-audio)                                                                                                                           |
| Piskel and the data grid are not touch-optimised          | The rest of the editor has a compact layout and touch gestures. [editor.md §4](editor.md#4-ui-structure), [ADR-025](decisions.md#adr-025-mobile-support-one-layout-switch-gestures-as-a-pure-reducer-and-prompted-updates) |
| Map events are authored as JSON                           | The editor has a validated JSON editor but no visual event editor                                                                                                                                                          |
| CI runs only the tests                                    | One GitHub Actions workflow; lint, typecheck and build still run only locally. [tooling-and-deployment.md §6a](tooling-and-deployment.md#6a-continuous-integration-unit-and-end-to-end-tests)                              |
| A few browser-only things are not automated               | Pixel-exact canvas output, audio, the native folder picker, the update prompt, real touch hardware. [testing.md §8](testing.md#8-what-is-not-covered-by-automated-tests)                                                   |
| The compact event format is not used by the engine        | It round-trips and is tested; the engine interprets the semantic form                                                                                                                                                      |
| Save games cannot capture a running event                 | `canSave()` is false while one runs                                                                                                                                                                                        |

## Bugs found by the end-to-end tests

Writing `packages/e2e` turned up nine bugs; all are fixed and each has a test that fails without the fix (the unit tests in
`packages/editor/test/session.test.ts`, `project.test.ts` and `packages/engine/test/renderer.test.ts` cover the save and
tilemap fixes too). None are open. A bug found later is written as a `test.fixme` with its cause and listed here until fixed;
see [packages/e2e/AGENTS.md](../packages/e2e/AGENTS.md).

## Keeping these documents true

`pnpm test` runs `tooling/docs.test.ts`, which checks links, anchors, repository paths and that the lists of actions, queries, schema
names, event commands, capabilities and close codes in the docs match the code. Update docs in the same commit as the code.
