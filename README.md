# RPG Studio

RPG Studio is an open-source, web-native, PWA-first alternative to RPG Maker, engineered for seamless authoring by both human creators and external AI agents.

## Architectural Pillars

- **Plugin-First (Microkernel) Paradigm:** The core application is a lightweight plugin loader, state manager, and typed event bus. Features are implemented as plugins.
- **Strict Immutability:** State mutations are strictly forbidden. ESLint enforces `functional/immutable-data`. All state updates produce new object references.
- **Strict JSON Serialization:** All project data and communication payloads are strict JSON. YAML is explicitly forbidden.
- **Zod as the Source of Truth:** All data models (Maps, Actors, Items, Save States, Events) are defined as Zod schemas with TypeScript interfaces inferred via `z.infer`.
- **ECS Separation of Concerns:** Engine game logic uses `miniplex` with plain JS objects typed from Zod schemas. Full validation occurs at boundaries; systems update component references during ticks with zero validation overhead.
- **Pixel-Perfect Rendering:** PixiJS configured strictly with `scaleMode: 'nearest'` and `@pixi/tilemap` for WebGL grid batching.
- **Two-Headed Plugins:** Plugins cleanly isolate `@rpgstudio/editor` code from `@rpgstudio/engine` code via dedicated entry points (`shared.ts`, `editor.ts`, `engine.ts`) coordinated by `manifest.json`.
- **Companion Bridge:** Outbound WebSocket client in the Editor connecting to external AI companion runners for programmatic state manipulation.

## Packages

- [`@rpgstudio/core`](./packages/core): Zod schemas, capability-based plugin manager, typed event bus, and grid math.
- [`@rpgstudio/engine`](./packages/engine): PixiJS renderer, miniplex ECS, audio manager, and headless simulation harness.
- [`@rpgstudio/editor`](./packages/editor): React/MUI authoring shell, dynamic Redux Toolkit store, Map canvas, Piskel bridge, and in-browser static web exporter.
- [`@rpgstudio/companion-bridge`](./packages/companion-bridge): Local AI companion runner and automation client.

## Development

```bash
# Install dependencies
pnpm install

# Start the local development server (RPG Studio Editor web app)
pnpm dev

# Or start specific subsystems:
pnpm dev:editor      # Editor workspace with HMR (http://localhost:5173)
pnpm dev:companion   # AI Companion WebSocket bridge (ws://localhost:8080)

# Build all packages and libraries
pnpm build

# Build standalone web application distribution
pnpm build:app

# Locally preview the built web application
pnpm preview

# Run static analysis and linting (strict immutability rules)
pnpm lint

# Run unit and integration tests across all workspaces
pnpm test
```

## License

MIT © Jeremy Kahn
