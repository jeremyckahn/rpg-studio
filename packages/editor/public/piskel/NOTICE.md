# Piskel

This folder contains a build of [Piskel](https://github.com/piskelapp/piskel), Copyright Julian Descottes and contributors, licensed under the Apache License 2.0 (see `LICENSE`).

- Source: https://github.com/piskelapp/piskel.git at v0.15.0 (ef945ef8a6ecd16290e5f4cebb76804bc00afce4)
- Built with Piskel's own `grunt build`.
- Changes: the unminified bundle, piskelapp.com partials and unused images were removed, bundle files were renamed to drop their build date, and `rpgstudio-adapter.js` (from `scripts/piskel-adapter.ts`) is loaded at the end of `index.html`. Piskel's own code is unmodified.

Regenerate with `pnpm --filter @rpgstudio/editor piskel:vendor`.
