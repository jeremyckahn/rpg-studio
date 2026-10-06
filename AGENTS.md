# AGENTS.md

Orientation for any agent (or human) working in this repository. Read this first;
it links to the deeper documents. Package-level rules live in each package's own
`AGENTS.md`, and the closest one to the file you are editing wins.

## What this is

RPG Studio is an open-source, browser-based alternative to RPG Maker. A human (or an
AI agent) authors a game in the **editor**, a PWA; the **engine** runs the game; the
editor exports a static web bundle. Everything is TypeScript, all data is strict JSON,
and every data shape is a Zod schema.

```
packages/core              schemas, plugin manager, event bus, math, PNG/Piskel codecs   (no DOM, no UI)
packages/engine            ECS game runtime, headless harness, PixiJS renderer, audio, player
packages/editor            React/MUI authoring app, Redux store, map canvas, Piskel, export, PWA
packages/companion-bridge  local WebSocket relay + agent library + CLI for AI agents
tooling/                   shared Vite/Vitest config helpers and the docs checker
docs/                      architecture, decisions, guides (start at docs/README.md)
```

Dependency direction is strictly `core ← engine ← editor`, and `core ← companion-bridge`.
`core` must never import from another package. `editor` has `companion-bridge` only as
a devDependency (for the end-to-end test).

## Commands

Requires Node.js 22+ and pnpm 12 (`packageManager` is pinned in `package.json`).

| Command                                              | Purpose                                                     |
| ---------------------------------------------------- | ----------------------------------------------------------- |
| `pnpm install`                                       | Install (must exit 0; see Gotchas on blocked build scripts) |
| `pnpm dev`                                           | Build the engine player, then serve the editor on `:5173`   |
| `pnpm dev:companion`                                 | Start the AI-agent relay on `ws://localhost:8080`           |
| `pnpm lint`                                          | ESLint, zero warnings allowed                               |
| `pnpm typecheck`                                     | `tsc --noEmit` for the root and every package               |
| `pnpm test`                                          | Vitest for every package (and the docs checker)             |
| `pnpm build`                                         | Build every package in dependency order                     |
| `pnpm build:app`                                     | Build the editor PWA to `packages/editor/dist-app`          |
| `pnpm preview`                                       | Serve the built editor PWA locally                          |
| `pnpm format` / `pnpm format:check`                  | Prettier                                                    |
| `pnpm --filter @rpgstudio/<pkg> <script>`            | Run a script in one package                                 |
| `pnpm exec vitest run test/x.test.ts` (in a package) | Run one test file                                           |

Vercel runs `pnpm build && pnpm build:app` and publishes `packages/editor/dist-app`.

### The verification gate

Before declaring any change done, all of these must pass with no warnings:

```sh
pnpm install --frozen-lockfile && pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm build:app
```

Also confirm the wiki is up to date (see below). Check **exit codes**, not just output. Piping a command through `tail`/`grep` hides its
failure, which once hid a failing `pnpm install` in this repo.

## The rules (and where they are enforced)

1. **Strict TypeScript.** Strictness flags live in `tsconfig.base.json`, including
   `noUncheckedIndexedAccess`. JavaScript only exists as build output, with deliberate
   exceptions that are generated or vendored (see `packages/editor/public/piskel`) plus the hand-written `eslint.config.js`.
2. **Immutability.** `functional/immutable-data` is an ESLint **error**. It flags array
   mutators, property assignment, `Map`/`Set` mutation and `Object.assign`-style calls.
   Write new state with spreads, `map`, `filter`, `toSorted`, `toSpliced`, `toReversed`.
   The few allowed exceptions are listed in [docs/decisions.md](docs/decisions.md#adr-002-immutability-by-lint-with-narrow-documented-exceptions)
   and in `eslint.config.js`. Do not add new ones casually; if you must, prefer a
   file-level `/* eslint-disable functional/immutable-data -- <reason> */` with a real reason.
3. **Strict JSON, never YAML.** All project files and wire messages are JSON.
4. **Zod is the source of truth.** Define a schema, then `z.infer` the type. Use
   `z.strictObject` so unknown (hallucinated) fields are rejected. Validate with
   `safeParse` at every boundary (file load, save restore, plugin registration,
   anything an AI sends). Never hand-write an interface that duplicates a schema.
   The one exception, `ConditionalBranchCommand`, is explained in [docs/data-model.md](docs/data-model.md).
5. **ECS boundary validation.** Inside the engine tick there is no validation and
   systems mutate component objects directly. Validation happens where data enters.
6. **Pixel-perfect rendering.** `scaleMode: 'nearest'`, no antialiasing, integer zoom.
7. **Two-headed plugins.** `shared` + `editor` + `engine` entries behind a
   `manifest.json`. The exported game must never load editor code. Details in [docs/plugins.md](docs/plugins.md).

## Where to look

| I want to…                                 | Read                                                             |
| ------------------------------------------ | ---------------------------------------------------------------- |
| Understand the whole system                | [docs/architecture.md](docs/architecture.md)                     |
| Know _why_ something is the way it is      | [docs/decisions.md](docs/decisions.md)                           |
| Change a data shape or project file format | [docs/data-model.md](docs/data-model.md)                         |
| Work on game simulation, rendering, audio  | [docs/engine.md](docs/engine.md)                                 |
| Work on the editor, store, undo, export    | [docs/editor.md](docs/editor.md)                                 |
| Write or load a plugin                     | [docs/plugins.md](docs/plugins.md)                               |
| Work on the AI bridge                      | [docs/companion-protocol.md](docs/companion-protocol.md)         |
| Add an action, command, query, panel, …    | [docs/extending.md](docs/extending.md)                           |
| Write or fix tests                         | [docs/testing.md](docs/testing.md)                               |
| Build, lint, deploy, Vercel, pnpm          | [docs/tooling-and-deployment.md](docs/tooling-and-deployment.md) |
| Something is broken in a confusing way     | [docs/troubleshooting.md](docs/troubleshooting.md)               |

## The wiki (user guide): keep it current

The **GitHub wiki** at <https://github.com/jeremyckahn/rpg-studio/wiki> is the guide for people **using** the app
(`docs/` is for people changing the code). It is a **separate git repository**, not part of this one:
`git@github.com:jeremyckahn/rpg-studio.wiki.git`, default branch `master`. The app links to it (the **?** button in
the menu bar and the companion dialog; `packages/editor/src/links.ts`).

**Rule: whenever a change affects anything a user can see or do, update the wiki in the same piece of work, before
you call it done.** That includes menu items and labels, tools, panels, gestures and keyboard shortcuts, event commands
and their fields, file and folder formats, export contents, supported file types, limits and validation messages,
mobile behaviour, companion setup, and anything added to or removed from the "Current Limitations" page. Removing a
limitation is as important as documenting a feature. Unsure whether a change is user-visible? Update the wiki.

How:

1. Clone (or `git pull`) the wiki next to this repository: `git clone git@github.com:jeremyckahn/rpg-studio.wiki.git ../rpg-studio.wiki`.
2. Edit the Markdown pages. Page name = file name (`Building-Maps.md` is "Building Maps"); link pages by bare name,
   as the existing pages do (a link target of just the page name, optionally followed by `#heading`); keep `_Sidebar.md` and `Home.md` listing every page.
3. Run `pnpm test`: `tooling/wiki.test.ts` validates the clone at `../rpg-studio.wiki` (or `WIKI_DIR`): links and heading
   anchors, sidebar coverage, the pages the app links to, and that every `json` example is accepted by the real Zod
   schemas. Do not weaken it; write examples that are true.
4. Commit with `docs(wiki): <what changed>` and `git push origin master`. If you cannot push (no access, no clone), say so
   in your final message and list the pages that need updating; never silently skip it.

Which page covers what:

| Area changed                                     | Page(s)                                                                     |
| ------------------------------------------------ | --------------------------------------------------------------------------- |
| Menu bar, panels, shortcuts, layout              | `The-Interface`, `Mobile-and-Touch`                                         |
| Save, open, zip, browser support                 | `Projects-and-Saving`, `Project-File-Format`                                |
| Map tools, layers, collision, map properties     | `Building-Maps`                                                             |
| Asset kinds, folders, formats, tilesets, sprites | `Assets`, `Sprite-Editor`                                                   |
| Database tables and fields                       | `Database`                                                                  |
| Event commands, triggers, conditions             | `Events`                                                                    |
| Export, player, controls                         | `Playing-and-Exporting`, `Mobile-and-Touch`                                 |
| Companion bridge, console API                    | `AI-Companion`                                                              |
| Plugin system                                    | `Plugins`                                                                   |
| New features, fixed gaps, new gaps               | `Current-Limitations`, `Troubleshooting-and-FAQ`, `Home`, `Getting-Started` |

Renaming or removing a wiki page: update `_Sidebar.md`, `Home.md`, every link to it, and `WIKI_PAGES` in
`packages/editor/src/links.ts`.

## Conventions

- **Style:** Prettier (`semi: false`, single quotes, width 100, trailing commas). Run
  `pnpm format`. Imports use explicit `.ts`/`.tsx` extensions inside `src` (the
  `allowImportingTsExtensions` option is on); tests import from `../src` without them.
- **Type imports:** `import { type Foo }` inline (enforced by lint).
- **Errors as values at boundaries:** use `Result<T, E>` (`ok`/`fail` from core) for
  operations that can legitimately be refused (project actions, queries, restore). Throw
  only for programmer errors and unrecoverable failures, with a specific message.
- **Naming:** schemas end in `Schema`; their types drop it (`ActorSchema` → `Actor`).
  Action creators are `projectActions.*`; action `type` strings are `project/<name>`.
- **Comments** explain _why_, not what. Keep the justification comment on every lint
  exception.
- **Commits:** Conventional Commits (`feat(scope):`, `fix:`, `test:`, `docs:`, `build:`,
  `refactor:`), small and atomic, each leaving the tree passing. Check `git status` before
  committing so nothing is left unstaged.

## Gotchas that cost real time

These are all documented in detail in [docs/troubleshooting.md](docs/troubleshooting.md).

- **Scripted edits silently miss after Prettier.** Prettier re-wraps lines, so a
  `str.replace(old, new)` that worked yesterday may match nothing today. Use an editor
  tool that fails loudly, and run `pnpm format` before and after.
- **`pnpm install` can fail with `ERR_PNPM_IGNORED_BUILDS`** when a new dependency has a
  blocked postinstall script. Record the decision with `pnpm approve-builds` (see
  `allowBuilds` in `pnpm-workspace.yaml`); never leave install exiting non-zero.
- **Vercel restores stale build caches.** `vercel.json` has a self-cleaning
  `installCommand` for this reason. Do not "simplify" it.
- **Tests resolve workspace packages from source**, not `dist`, through the `source`
  export condition. New packages and new vitest configs must copy the pattern in `tooling/vite.ts`.
- **The engine's root entry must not import PixiJS** (it has to run in Node). A test
  enforces it; PixiJS code lives behind `@rpgstudio/engine/renderer|audio|player`.
- **Declaration emit** chokes on inferred Redux slices and on recursive Zod schemas. The
  fixes (explicit action-creator types, an explicit `ConditionalBranchCommand`) are
  load-bearing; read the comments before touching them.
- **Restart the editor dev server** after regenerating `public/piskel` (it deletes and
  recreates the folder, which Vite's static cache does not survive).

## Things not to do

- Do not edit `packages/editor/public/piskel/` by hand. It is generated by
  `pnpm --filter @rpgstudio/editor piskel:vendor`; change `scripts/piskel-adapter.ts` or
  the vendor script instead.
- Do not make the editor or an agent write project data except through a validated
  project action (`applyProjectAction`). That single path is what keeps undo, validation
  and the AI bridge consistent.
- Do not import `@rpgstudio/editor` code from the engine, or React/MUI from `core`/`engine`.
- Do not disable lint rules, loosen `tsconfig`, or skip tests to get green. Fix the cause.
- Do not commit generated output (`dist/`, `dist-app/`, `dist-player/`), `.env*`, or `.vercel/`.

## Local-only tooling

`.claude/launch.json` (git-excluded) defines preview servers for browser verification.
It is a developer convenience, not part of the repo. If you verify UI in a browser, take a
fresh screenshot immediately before clicking by coordinates: pane resizes shift them.
