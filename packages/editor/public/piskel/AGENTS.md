# AGENTS.md: `public/piskel/` (vendored, generated)

**Do not edit anything in this folder by hand.** It is a generated build of
[Piskel](https://github.com/piskelapp/piskel) v0.15.0 (Apache-2.0, see `LICENSE` and `NOTICE.md`), committed so the editor works
offline and on Vercel without a network build step.

- Regenerate with `pnpm --filter @rpgstudio/editor piskel:vendor` (needs git and network). The script
  (`../../scripts/vendor-piskel.ts`) clones the pinned tag, **refuses to build if the commit differs from the pinned SHA**, builds with
  Piskel's Grunt toolchain, drops the unminified bundle, `piskelapp-partials/` and `img/unused/`, renames bundles to remove the build date,
  injects `rpgstudio-adapter.js` before the *last* `</body>`, and adds the license files.
- To change behaviour inside Piskel's page, edit `../../scripts/piskel-adapter.ts` (TypeScript; the script transpiles it into
  `rpgstudio-adapter.js`) and regenerate. Piskel's own code stays unmodified.
- To update Piskel: change `TAG` and `COMMIT` in the vendor script, regenerate, and re-verify the open → edit → save → map hot-reload flow in a browser.
- This folder is excluded from ESLint and Prettier.
- After regenerating, **restart the Vite dev server**; it deletes and recreates this folder, and the running server serves stale/404 responses for it.
- The editor-side counterpart is `src/piskel/`; protocol and security are described in
  [docs/editor.md §6](../../../../docs/editor.md#6-piskel). The JavaScript files here (`piskel-packaged-min.js`, `rpgstudio-adapter.js` and `js/lib/gif/gif.ie.worker.js`) are
  build artifacts, which is the one sanctioned exception to "TypeScript only".
