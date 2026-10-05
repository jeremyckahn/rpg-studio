# RPG Studio

An open-source, web-native, PWA-first alternative to RPG Maker, engineered for
authoring by both human creators and external AI agents.

## Principles

- **Strict TypeScript everywhere.** JavaScript is only a build artifact.
- **Immutable state.** `functional/immutable-data` is an ESLint error. Every
  state change produces a new object reference. Exceptions are explicit and
  narrow: the ECS tick (rule 5 below) and scratch memory that cannot escape a
  single call (the A\* heap). Each carries a justification comment.
- **Strict JSON, never YAML.** All project data and wire payloads are JSON.
- **Zod is the source of truth.** Every data model is a Zod schema and its
  TypeScript type is `z.infer`red from it. Inputs from files, plugins and AI
  agents are validated with `safeParse` at the boundary.
- **ECS with boundary validation.** The engine runs on `miniplex` with plain
  objects. Systems mutate components during a tick without validation overhead.
- **Pixel-perfect rendering.** PixiJS with nearest-neighbour scaling and
  `@pixi/tilemap` batching.
- **Two-headed plugins.** `shared.ts` + `editor.ts` + `engine.ts`, coordinated by
  a `manifest.json`. The exported game never loads editor code.

## Packages

| Package                                                    | Purpose                                                                        |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------ |
| [`@rpgstudio/core`](packages/core)                         | Zod schemas, plugin manager, typed event bus, grid math, A\*, RNG              |
| [`@rpgstudio/engine`](packages/engine)                     | ECS runtime, headless simulation harness, PixiJS renderer, audio               |
| [`@rpgstudio/editor`](packages/editor)                     | React/MUI authoring shell, Redux store, map canvas, Piskel bridge, export, PWA |
| [`@rpgstudio/companion-bridge`](packages/companion-bridge) | Local WebSocket companion server and reference AI agent runner                 |

## Getting started

Requires Node.js 22+ and pnpm 12+.

```sh
pnpm install
pnpm dev          # builds the engine player, then starts the editor dev server
```

## Scripts

| Command          | What it does                                                  |
| ---------------- | ------------------------------------------------------------- |
| `pnpm lint`      | ESLint across the workspace, failing on any warning           |
| `pnpm typecheck` | `tsc --noEmit` in every package                               |
| `pnpm test`      | Vitest across every package                                   |
| `pnpm build`     | Builds every package (libraries, engine player, declarations) |
| `pnpm build:app` | Builds the editor PWA into `packages/editor/dist-app`         |

`vercel.json` deploys `packages/editor/dist-app` using `pnpm build && pnpm build:app`.

## Workspace conventions

Packages expose their sources through a `source` export condition, which Vite,
Vitest and `tsc` all enable. Tests and dev servers therefore never depend on
build order, while published consumers receive `dist/`.

## License

[MIT](LICENSE)
