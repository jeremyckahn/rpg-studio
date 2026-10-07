import js from '@eslint/js'
import functional from 'eslint-plugin-functional'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/dist-*/**',
      '**/coverage/**',
      '**/.vite/**',
      // Playwright's own output (the HTML report ships minified scripts).
      '**/playwright-report/**',
      '**/test-results/**',
      '**/playwright-videos/**',
      '**/public/piskel/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { functional },
    rules: {
      // RPG Studio rule #2: state is never mutated. Every update produces a
      // new object reference so React, undo/redo, and plugins can rely on
      // reference equality.
      'functional/immutable-data': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['packages/editor/**/*.{ts,tsx}'],
    ...reactHooks.configs.flat.recommended,
  },
  {
    // Architecture rule 5: the ECS runtime is the one place that mutates in
    // place. Systems write component fields and simulation state during a tick
    // with no validation or copying overhead; Zod runs only at data boundaries
    // (file load, save restore, plugin and AI input).
    files: ['packages/engine/src/ecs/**/*.ts', 'packages/engine/src/game/**/*.ts'],
    rules: { 'functional/immutable-data': 'off' },
  },
  {
    // PixiJS is a retained-mode scene graph: display objects are mutated in
    // place by design (`sprite.x = ...`, `container.addChild`), and `@pixi/sound`
    // is a mutable singleton. That mutation is confined to these adapter
    // modules; game state is only ever read from here.
    files: [
      'packages/engine/src/renderer/**/*.ts',
      'packages/engine/src/player/**/*.ts',
      'packages/engine/src/audio/pixiSoundBackend.ts',
      'packages/editor/src/canvas/mapScene.ts',
    ],
    rules: { 'functional/immutable-data': 'off' },
  },
  {
    // Config and build scripts are plain JS/TS outside any package tsconfig.
    files: ['**/*.js', '**/*.cjs', '**/*.mjs'],
    extends: [tseslint.configs.disableTypeChecked],
  },
)
