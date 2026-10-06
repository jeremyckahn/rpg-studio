# Documentation index

Start with the root [AGENTS.md](../AGENTS.md) for commands, rules and gotchas. This folder holds the details.
Every package also has its own `AGENTS.md` with a file map and local rules: [core](../packages/core/AGENTS.md),
[engine](../packages/engine/AGENTS.md), [editor](../packages/editor/AGENTS.md),
[companion-bridge](../packages/companion-bridge/AGENTS.md); plus [tooling](../tooling/AGENTS.md) and the
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

| Gap                                                       | Detail                                                                                                                                |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| The editor does not auto-load a project's `plugins/<id>/` | Only the engine player does; first-party plugins are bundled. [plugins.md](plugins.md#status-what-works-and-what-is-not-wired-up-yet) |
| The `render` plugin capability is unprovided              | No host implements it; plugins declaring it are rejected                                                                              |
| Real audio playback is unverified                         | `@pixi/sound` streaming switch is only covered by mocks. [engine.md §6](engine.md#6-audio-audio)                                      |
| No touch controls in the player                           | Keyboard only. [engine.md §7](engine.md#7-the-player-player)                                                                          |
| Map events are authored as JSON                           | The editor has a validated JSON editor but no visual event editor                                                                     |
| No CI workflow                                            | Vercel builds only; lint/test/typecheck run locally. [tooling-and-deployment.md §6](tooling-and-deployment.md#6-deployment-vercel)    |
| WebGL/browser-only behaviour has no automated tests       | Verified manually; checklist in [testing.md §8](testing.md#8-what-is-not-covered-by-automated-tests)                                  |
| The compact event format is not used by the engine        | It round-trips and is tested; the engine interprets the semantic form                                                                 |
| Save games cannot capture a running event                 | `canSave()` is false while one runs                                                                                                   |

## Keeping these documents true

`pnpm test` runs `tooling/docs.test.ts`, which checks links, anchors, repository paths and that the lists of actions, queries, schema
names, event commands, capabilities and close codes in the docs match the code. Update docs in the same commit as the code.
