# @rpgstudio/e2e

Playwright end-to-end tests for RPG Studio: the built editor, an exported game and the AI companion bridge in a real
browser. Rules, file map and traps: [AGENTS.md](AGENTS.md). How it fits the rest of the test suite:
[docs/testing.md](../../docs/testing.md#7-end-to-end-tests-playwright).

```sh
pnpm build && pnpm build:app                                                # the app under test
pnpm --filter @rpgstudio/e2e exec playwright install --with-deps chromium   # once per machine
pnpm test:e2e
```

GitHub Actions runs them on every pull request and every push to `main` (`.github/workflows/tests.yml`, together with the unit tests).
