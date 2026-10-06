# Tooling, builds and deployment

## 1. Requirements and layout

- **Node.js ≥ 22** (`engines`). Vite 8 needs ≥ 20.19 / 22.12, so older Nodes fail inside Rolldown with
  "Cannot find native binding". Vercel runs the project on Node 24.x.
- **pnpm 12.8.1**, pinned by `packageManager`. Workspace: `pnpm-workspace.yaml` (`packages/*`, plus
  `allowBuilds: { esbuild: false }`).
- No Turborepo; `pnpm -r run build` builds in topological order (core → engine → editor/companion-bridge).

```
tsconfig.base.json     strict compiler options shared by everyone
tsconfig.json          root files only (config files, tooling/)
eslint.config.js       one flat config for the whole repo
vitest.config.ts       projects: packages/* and tooling
tooling/vite.ts        shared Vite/Vitest helpers (source condition, library build)
.prettierrc.json       semi:false, singleQuote, width 100, trailingComma all
vercel.json            deployment config (see §6)
```

## 2. TypeScript

`tsconfig.base.json` enables every strict flag and also `noUncheckedIndexedAccess` (array/record indexing returns
`T | undefined`, so write `arr[i] ?? fallback` or check), `noImplicitOverride`, `noImplicitReturns`,
`noUnusedLocals/Parameters`, `verbatimModuleSyntax` (use `import { type X }`), `isolatedModules`, and
`allowImportingTsExtensions` (we import with `.ts`/`.tsx` suffixes inside `src`). `customConditions: ["source"]`
makes workspace imports resolve to TypeScript sources.

Per-package `tsconfig.json` extends the base and sets `types` (and `lib`: engine and editor add DOM; editor adds
`ES2024` for `Map.groupBy`, `DOM.AsyncIterable` for directory handles, and `jsx: react-jsx`). `tsconfig.build.json`
clears `customConditions` and emits declarations only (`emitDeclarationOnly`, `rootDir: src`, `outDir: dist`), so
dependants see each other's **built** `.d.ts`: this is why `pnpm build` can fail where `pnpm typecheck` passes.

**Version pin:** TypeScript is `~6.0.x` because `typescript-eslint` 8 requires `<6.1`. Do not bump TypeScript
without checking its peer range.

## 3. The `source` export condition

Every package `exports` map looks like:

```json
".": { "source": "./src/index.ts", "types": "./dist/index.d.ts", "import": "./dist/index.js" }
```

`tooling/vite.ts` provides:

| Export                         | Use                                                                                        |
| ------------------------------ | ------------------------------------------------------------------------------------------ |
| `sourceResolve`                | `resolve.conditions: ['source']`; goes in every Vite/Vitest config                         |
| `sourceSsr`                    | the same for the Node/SSR environment Vitest runs in                                       |
| `workspaceServerDeps`          | tells Vitest to _inline_ `@rpgstudio/*` so Vite (not Node) resolves them                   |
| `libConfig({ entry, target })` | library-mode build: ES modules, every bare import external, sourcemaps, names `[entry].js` |

CLI tools that run TypeScript directly use the same idea: `tsx --conditions=source` (see
`companion-bridge` `dev`/`demo`). Plain `node --experimental-strip-types` cannot run files that use TypeScript
parameter properties (core's error classes do), so scripts that need core use its built `dist`
(`scripts/generate-icons.ts` imports `@rpgstudio/core`, so build core first).

## 4. Lint and format

`pnpm lint` = `eslint . --max-warnings 0`. Config highlights (`eslint.config.js`):

- `typescript-eslint` **type-checked** recommended rules via the project service (so TS errors in tests fail lint too);
- `functional/immutable-data: error` (see [ADR-002](decisions.md#adr-002-immutability-by-lint-with-narrow-documented-exceptions)),
  turned off for the files listed there;
- `react-hooks` recommended (flat) for `packages/editor/**`, including the React Compiler rules
  (`set-state-in-effect`, refs-during-render);
- `consistent-type-imports` (inline `type` imports), `no-unused-vars` with a leading `_` escape;
- ignores: `dist*`, `coverage`, `.vite`, and `public/piskel` (vendored, minified).

`pnpm format` runs Prettier over the whole repo (Markdown included; `public/piskel`, `dist*`, the lockfile are in
`.prettierignore`). Prettier **re-wraps** code, so run it before scripted edits and again after.

## 5. Builds

| Command                                         | Output                                                                                                                                              |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm build`                                    | each package's `dist/` (library JS + `.d.ts`); `engine` also builds `dist-player/player.js`; `companion-bridge` builds `dist/cli.js` with a shebang |
| `pnpm build:app`                                | `packages/editor/dist-app/`: the PWA, plus `engine/player.js` and `piskel/`                                                                         |
| `pnpm --filter @rpgstudio/engine build:player`  | only the player bundle                                                                                                                              |
| `pnpm --filter @rpgstudio/editor icons`         | regenerate `public/icons/*` with our own PNG encoder                                                                                                |
| `pnpm --filter @rpgstudio/editor piskel:vendor` | regenerate `public/piskel/` (needs network and git)                                                                                                 |

Order matters for `build:app`: the editor's Vite plugin (`scripts/enginePlayerPlugin.ts`) copies
`packages/engine/dist-player/player.js` into the app and **errors if it is missing**, which is why the root `dev` script
builds the engine first and Vercel runs `pnpm build` before `pnpm build:app`.

The player bundle is a single minified file with PixiJS inside (`codeSplitting: false`) and
`process.env.NODE_ENV` defined; `engine/test/playerBundle.test.ts` guards both.

All build outputs are git-ignored (`dist/`, `dist-*/`).

## 6. Deployment (Vercel)

`vercel.json`:

```json
{
  "buildCommand": "pnpm build && pnpm build:app",
  "outputDirectory": "packages/editor/dist-app",
  "installCommand": "rm -rf node_modules packages/*/node_modules && pnpm install --frozen-lockfile",
  "framework": "vite"
}
```

- **Why the install command removes `node_modules` first:** Vercel restores the previous deployment's build cache. After the
  repository was rewritten, the cache held `packages/*/node_modules` from the old layout whose `vite` shims pointed at files
  that no longer exist, so every build failed with `MODULE_NOT_FOUND`. A plain `pnpm install` does not remove stale
  per-package folders. Keep the cleanup.
- **`--frozen-lockfile`** makes a drifting lockfile a build failure instead of a silent change.
- **pnpm build scripts:** pnpm 12 exits non-zero (`ERR_PNPM_IGNORED_BUILDS`) when a dependency has a build script that is
  neither allowed nor denied. `esbuild` (pulled in by `tsx`) is denied in `pnpm-workspace.yaml`. Always check
  `pnpm install; echo $?`.
- Pushes to `main` deploy as **Production**; Preview deployments are created for other branches and pull requests.
- The project's Vercel settings (Node version, Root Directory `.`, framework preset) live in the dashboard; deployment
  protection (SSO) may be enabled there, which makes `*.vercel.app` URLs redirect to a login.
- Inspect a deployment with the Vercel CLI (`npx vercel inspect <deployment-url> --logs`) after `npx vercel login`.
- `.vercel/` (the local project link) and `.env*` are git-ignored.
- `engines.node` is `>=22`, which Vercel warns will auto-upgrade with new Node majors; pin to `22.x` if that matters.
- **There is no GitHub Actions workflow.** Vercel's build is the only automated check, and it does not run tests or lint.
  Run the verification gate locally (see [AGENTS.md](../AGENTS.md#the-verification-gate)); adding CI is a reasonable next step.

## 7. PWA

`vite-plugin-pwa` 2 (`generateSW`) configured in `packages/editor/vite.app.config.ts` ([ADR-020](decisions.md#adr-020-installable-pwa-with-a-relative-base)):
manifest (name, icons incl. maskable, standalone), precache of the shell, engine player and Piskel (limit 6 MB per file),
`navigateFallback: index.html` denying `/piskel/`, `cleanupOutdatedCaches`. The service worker only registers in
production builds.

## 8. Vendored third-party code

`packages/editor/public/piskel/` is a generated build of Piskel v0.15.0 (Apache-2.0; LICENSE and NOTICE.md inside). It is
excluded from lint and format and must not be edited by hand. See [editor.md §6](editor.md#6-piskel).

## 9. Local developer tooling

`.claude/launch.json` is git-excluded (`.git/info/exclude`) and only defines preview servers for browser verification
(`editor` on 5173, `companion` on 8080). It is not part of the project.
