# AGENTS.md: `tooling/`

Shared build/test configuration and repository checks. Not a package; nothing is published from here.

- `vite.ts`: `sourceResolve`, `sourceSsr`, `workspaceServerDeps` (make Vite/Vitest resolve workspace packages from TypeScript
  sources through the `source` export condition) and `libConfig` (library-mode builds). Every package's `vite.config.ts` /
  `vitest.config.ts` imports from here with an explicit `.ts` extension (Vite's native config loader requires it).
  See [docs/tooling-and-deployment.md](../docs/tooling-and-deployment.md#3-the-source-export-condition).
- `docs.test.ts`: keeps the documentation true. It fails on broken links/anchors, backticked repository paths that no longer exist,
  packages without an `AGENTS.md`, and project actions / queries / schema names / event commands / capabilities / close codes missing from
  the docs that must list them. When it fails after your change, update the docs.
- `wiki.test.ts`: validates a local clone of the GitHub wiki (the user guide, a separate repository) at `../rpg-studio.wiki` or
  `WIKI_DIR`: links and anchors, sidebar coverage, pages the app links to, and that JSON examples pass the real schemas. It is skipped
  when no clone exists. See [AGENTS.md](../AGENTS.md#the-wiki-user-guide-keep-it-current).
- `vitest.config.ts`: the Vitest project for `docs.test.ts` and `wiki.test.ts`.

Changing `vite.ts` affects every package; run the full verification gate.
