# Extending the codebase: recipes

Step-by-step procedures for the changes most likely to be asked of you. Each lists every
file that must change, because most features here cross package boundaries. After any of
them run the full gate from [AGENTS.md](../AGENTS.md#the-verification-gate), and prefer
test-first: the exhaustive `switch` statements below mean TypeScript will point at every place
you forgot.

Contents: [field](#add-a-field-to-a-record-or-map) ·
[table](#add-a-database-table) ·
[event command](#add-an-event-command) ·
[project action](#add-a-project-action) ·
[map tool](#add-a-map-editing-tool) ·
[panel](#add-an-editor-panel-or-first-party-plugin) ·
[query](#add-a-companion-query) ·
[engine behaviour](#add-engine-behaviour) ·
[asset kind](#add-an-asset-kind-to-export) ·
[format change](#change-the-project-file-format) ·
[package](#add-a-package) ·
[dependency](#add-a-dependency)

## Add a field to a record or map

1. Add it to the schema in `core/src/schemas/*` with a `.default(...)` (or `.optional()`), so existing projects
   still load. Keep `z.strictObject`.
2. If other code constructs the type by hand (`createStarterProject`, `createEmptyMap`, test
   fixtures), TypeScript will complain; fix those, preferring `Schema.parse` in tests.
3. If it is edited in the UI: map fields are edited in `PropertiesPanel`/`MapToolPanel`; database fields appear in
   the `DatabaseEditor` **automatically** (columns come from the schema).
4. If an action changes it, see [project action](#add-a-project-action).
5. Tests: add a valid and an invalid case to `core/test/schemas.test.ts`; the round-trip tests in
   `core/test/project.test.ts` will cover file I/O.

## Add a database table

A table touches several enumerations, all of which are deliberate single sources:

1. `core/src/schemas/<file>.ts`: the record schema (`XSchema`) and its type.
2. `core/src/schemas/project.ts`: add it to `DatabaseShapeSchema`, `DATABASE_TABLES`
   and `DATABASE_RECORD_SCHEMAS`; add reference checks to `validateProject` if it links to other tables.
3. `core/src/project/files.ts`: add it to `TABLE_SCHEMAS` (and the starter project if sensible).
4. `core/src/schemas/actions.ts`: add a variant to `UpsertRecordPayloadSchema` and the table name to
   `DeleteRecordPayloadSchema`'s enum.
5. `core/src/schemas/protocol.ts`: add the name to the `table` enums of `GET_TABLE` and `GET_RECORD`; add a
   `SCHEMA_NAMES` entry and `SCHEMAS` mapping if agents should discover it.
6. `editor/src/components/database/records.ts`: add a case to `newRecord` (the `switch` is exhaustive).
7. Docs: tables in `data-model.md` and `companion-protocol.md`. Tests in `core/test/*`, `editor/test/columns.test.ts`.

## Add an event command

1. `core/src/schemas/event.ts`: add a `z.strictObject` with a literal `command` to `LeafCommandSchema`.
2. `core/src/events/compact.ts`: add a code to `COMMAND_CODES` (its `satisfies` clause fails until you do), then a
   case in `compileCommand` and in `expandCommand`.
3. `engine/src/game/interpreter.ts`: add a case to `execute` (the `switch` is exhaustive). Decide whether the
   command blocks: set `interpreter.waitTicks` or `waitingForMessage` to block, otherwise it runs inline.
   Use `rt.audio`, `rt.bus`, `setSwitch`/`setVariable` helpers; do not read clocks or randomness except `state.rng`.
4. If it references other project data (a map, an item), extend `validateProject` so dangling references are rejected.
5. Docs: command table in `data-model.md`. Tests: schema accept/reject (`core/test/schemas.test.ts`), compact
   round-trip (`core/test/events.test.ts`, add it to the `commands` list there), engine behaviour
   (`engine/test/events.test.ts`, using `solo([...])`).

## Add a project action

An action is how _anything_ edits a project (UI, plugins, console, AI). It must be pure and explainable.

1. `core/src/schemas/actions.ts`: payload schema, then `action('project/<name>', Payload)` in `ProjectActionSchema`.
   Bound every array and number. Export the payload type.
2. `editor/src/store/projectOps.ts`: write `const name = (project, payload): Result<Project>` and add a case to
   `applyProjectAction` (exhaustive). Rules: never mutate; return `fail(message)` with a message a model can act
   on; validate inputs for cheap tile-style operations, or build a candidate and run `validated(candidate)` when relationships
   change. Preserve structural sharing (`replaceMap`/`withMap`).
3. `editor/src/store/slices/project.ts`: add `name: operation('name')` to the reducers.
4. Done for free: undo/redo (derived from the schema), the AI bridge, the plugin `dispatchProjectAction`, the docs checker.
5. Update `core/test/actions.test.ts` (it enumerates every action type and asserts the count),
   the table in `editor.md`, and add cases to `editor/test/projectOps.test.ts` (success keeps `ProjectSchema` valid;
   each refusal has a message assertion) and, for UI, component tests.

## Add a map editing tool

1. Add the name to `MapTool` in `editor/src/store/slices/editorUi.ts`.
2. `editor/src/canvas/tools.ts`: handle it in `createPaintController` (`pointerDown/Move/Up`); dispatch existing project
   actions with the stroke's `historyGroup`. Keep it pure and unit-test it with a real store in `editor/test/canvas.test.ts`.
3. `editor/src/components/MapEditorWorkspace.tsx`: add it to `TOOLS`. If it needs scene feedback (a cursor, an overlay),
   extend `MapScene` in `canvas/mapScene.ts`.

## Add an editor panel or first-party plugin

1. Write the component in `editor/src/components/` (read state with `useAppSelector`; dispatch `projectActions`).
2. Register it in `editor/src/plugins/corePlugins.ts` inside a plugin's `initialize` with `ctx.ui.registerPanel`
   (`location: 'workspace' | 'left' | 'right' | 'bottom'`, optional `order` and `when`). Declare the capabilities it uses
   in that plugin's manifest; if the panel needs the file system, create it with `ctx.readFiles`/`ctx.writeFiles`
   (see `createPiskelEditorPanel`) instead of importing the AssetStore.
3. Test with `renderInApp` from `editor/test/render.tsx` (stub any panel that needs WebGL).

For third-party plugins see [plugins.md](plugins.md).

## Add a companion query

See [companion-protocol.md §10](companion-protocol.md#10-extending-the-protocol).

## Add engine behaviour

Follow [engine.md §9](engine.md#9-extending-the-engine). Always begin with a failing headless test:

```ts
const headless = createHeadlessGame(buildProject({ maps: [mapFromAscii(1, rows('.....'), { events: [...] })] }))
headless.step('right')
expect(headless.game.snapshot()).toMatchObject({ player: { x: 3 } })
```

If the change affects saves, bump `SAVE_STATE_VERSION` only for incompatible changes, extend
`SaveStateSchema`, and add a restore test including the "bad save leaves the game untouched" case.

## Add an asset kind to export

Edit `editor/src/export/packager.ts` (`IMAGE_EXTENSIONS`/`AUDIO_EXTENSIONS` or a new classifier) **and** make the
player able to use it (`player/bundle.ts` for data, the renderer/audio for assets). Add cases to
`editor/test/export.test.ts` for both "shipped" and "omitted with a reason".

## Change the project file format

Additive change: add a defaulted field and nothing else. Breaking change: bump `PROJECT_FORMAT_VERSION`
(`core/src/schemas/project.ts`), keep `filesToProject` accepting the old version (migrate in memory), update
`projectToFiles`, and write a migration test with a literal old-format fixture. Record the decision in
[decisions.md](decisions.md). `game.json` has its own `GAME_BUNDLE_FORMAT_VERSION`.

## Add a package

1. `packages/<name>/` with `package.json` (`type: module`, `exports` with `source`/`types`/`import`, scripts
   `build`, `typecheck`, `lint`, `test`), `tsconfig.json` (extends the base; set `types` and `lib`),
   `tsconfig.build.json`, `vite.config.ts` (`libConfig(...)` from `tooling/vite.ts`), `vitest.config.ts`
   (**copy an existing one**: it carries `sourceResolve`, `sourceSsr`, `workspaceServerDeps`).
2. `pnpm install`; confirm it exits 0 (see [troubleshooting](troubleshooting.md#pnpm-install-exits-non-zero)).
3. Write `README.md` and `AGENTS.md` (the docs test fails without one).
4. Root `vitest.config.ts` picks up `packages/*` automatically; ESLint uses the root config.
5. Mind the dependency direction (`core` imports nothing; nothing imports `editor`).

## Add a dependency

`pnpm --filter @rpgstudio/<pkg> add <dep>`. Then: `pnpm install --frozen-lockfile; echo $?` must be `0`. If pnpm reports
ignored build scripts, decide explicitly with `pnpm approve-builds` (allow, or deny with `'!pkg'`), which records it in
`pnpm-workspace.yaml`. If the dependency's types appear in your exported API, make sure `pnpm build` (declaration emit),
not just `typecheck`, still passes. Never import a package you did not declare (pnpm's layout will make it fail on Vercel).
