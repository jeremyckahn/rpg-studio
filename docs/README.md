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

## Open bugs found by the end-to-end tests

Writing `packages/e2e` turned up these. The first five are `test.fixme` there (each with a comment naming the cause); when you
fix one, turn its test into a plain `test` and delete the row. The rest are smaller and have no failing test.

| Bug                                                                        | Cause and where                                                                                                                                                                                        |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Dim other layers** changes nothing on screen                             | `MapScene` sets `tilemap.alpha`, but `@pixi/tilemap`'s shader only multiplies by each tile's own alpha (`canvas/mapScene.ts`)                                                                          |
| The data grid's select-all checkbox selects nothing                        | DataGrid reports "all" as an `exclude` model with no ids; `DatabaseEditor` copies only `model.ids` (`components/database/DatabaseEditor.tsx`)                                                          |
| The first Save of a new project leaves out the starter tileset             | `newProject` loads it with `assets.replaceAll`, which marks nothing unsaved, and `saveProject` writes only unsaved assets; reopening the folder gives a map with no tileset (`project/session.ts`)     |
| **Save to another folder** writes nothing if the project has not changed   | `saveTo` reuses the previous folder's "already on disk" cache, so the new folder stays empty (`project/session.ts`, `project/persistence.ts`)                                                          |
| Replacing a loaded asset can leave the map showing the old image           | The session's asset mirror (which reloads the tileset) is subscribed before the texture invalidation, so the reload gets the stale cached texture; seen under load (`main.tsx`, `project/textures.ts`) |
| The Add button in the Database reads "Add classe" and "Add enemie"         | The label is `table.slice(0, -1)` (`components/database/DatabaseEditor.tsx`)                                                                                                                           |
| A refused Start X/Y leaves the refused number in the field with no message | The field is keyed by the stored value, which did not change (`components/PropertiesPanel.tsx`)                                                                                                        |
| Save says "Already saved" when the save only deleted files                 | The message looks at files written, not deleted (`project/session.ts`)                                                                                                                                 |
| Piskel's icons are missing offline                                         | Its icon fonts are requested with a cache-busting query string that the service worker's precache does not match (`vite.app.config.ts`)                                                                |

## Keeping these documents true

`pnpm test` runs `tooling/docs.test.ts`, which checks links, anchors, repository paths and that the lists of actions, queries, schema
names, event commands, capabilities and close codes in the docs match the code. Update docs in the same commit as the code.
