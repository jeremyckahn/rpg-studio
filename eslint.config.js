import js from '@eslint/js'
import functional from 'eslint-plugin-functional'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/dist-*/**',
      '**/coverage/**',
      '**/.vite/**',
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
    // Architecture rule 5: the ECS runtime is the one place that mutates in
    // place. Systems write component fields and simulation state during a tick
    // with no validation or copying overhead; Zod runs only at data boundaries
    // (file load, save restore, plugin and AI input).
    files: ['packages/engine/src/ecs/**/*.ts', 'packages/engine/src/game/**/*.ts'],
    rules: { 'functional/immutable-data': 'off' },
  },
  {
    // Config and build scripts are plain JS/TS outside any package tsconfig.
    files: ['**/*.js', '**/*.cjs', '**/*.mjs'],
    extends: [tseslint.configs.disableTypeChecked],
  },
)
