module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    project: [
      './packages/*/tsconfig.json'
    ],
    tsconfigRootDir: __dirname,
  },
  plugins: [
    '@typescript-eslint',
    'functional',
  ],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:functional/external-typescript-recommended',
    'plugin:functional/recommended',
  ],
  rules: {
    'functional/immutable-data': ['error', {
      ignoreAccessorPattern: ['**.current', '**.scrollTop', '**.scrollLeft', '**.ref'],
      ignoreImmediateMutation: true
    }],
    'functional/no-let': 'error',
    'functional/no-throw-statements': 'off',
    'functional/no-loop-statements': 'off',
    'functional/no-conditional-statements': 'off',
    'functional/functional-parameters': 'off',
    'functional/no-expression-statements': 'off',
    'functional/no-return-void': 'off',
    'functional/no-classes': 'off',
    'functional/no-this-expressions': 'off',
    'functional/no-mixed-types': 'off',
    'functional/prefer-immutable-types': 'off',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    '@typescript-eslint/no-explicit-any': 'error',
  },
  overrides: [
    {
      files: ['**/*.test.ts', '**/*.test.tsx', '**/test/**', '**/scripts/**'],
      rules: {
        'functional/immutable-data': 'off',
        'functional/no-let': 'off',
      },
    },
    {
      // ECS systems and engine runtime manage PixiJS/Audio/ECS state per rules 5 and 6
      files: ['**/packages/engine/src/**'],
      rules: {
        'functional/immutable-data': 'off',
      },
    },
    {
      // Canvas rendering, binary packaging (fflate), and dynamic store slice injection
      files: [
        '**/packages/editor/src/canvas/**',
        '**/packages/editor/src/export/**',
        '**/packages/editor/src/store/index.ts',
      ],
      rules: {
        'functional/immutable-data': 'off',
      },
    },
  ],
  ignorePatterns: [
    'dist',
    'node_modules',
    'coverage',
    '*.config.js',
    '*.config.cjs',
    '*.config.mjs',
    '*.config.ts',
  ],
};
