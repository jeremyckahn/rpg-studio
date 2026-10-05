import { type UserConfig } from 'vite'

/**
 * Workspace packages expose their TypeScript sources through the `source`
 * export condition so that dev servers, tests and type checking never depend on
 * build order. Published consumers get `dist/` instead.
 */
export const sourceResolve = {
  conditions: ['source'],
} as const satisfies NonNullable<UserConfig['resolve']>

/** Same condition for the SSR/Node environment that Vitest runs tests in. */
export const sourceSsr = {
  resolve: { conditions: ['source'] },
} as const satisfies NonNullable<UserConfig['ssr']>

/**
 * Vitest externalises linked workspace packages and would load their built
 * `dist/`. Inlining them lets Vite resolve the `source` condition instead.
 */
export const workspaceServerDeps: { inline: (string | RegExp)[] } = {
  inline: [/^@rpgstudio\//],
}

const isExternal = (id: string): boolean =>
  !id.startsWith('.') && !id.startsWith('/') && !/^[a-zA-Z]:[\\/]/.test(id)

interface LibOptions {
  readonly entry: string | Readonly<Record<string, string>>
  readonly target?: 'browser' | 'node'
}

/** Library-mode build: ES modules, every bare import stays external. */
export const libConfig = ({ entry, target = 'browser' }: LibOptions): UserConfig => ({
  resolve: sourceResolve,
  build: {
    target: target === 'node' ? 'node22' : 'es2023',
    sourcemap: true,
    minify: false,
    lib: {
      entry: typeof entry === 'string' ? { index: entry } : { ...entry },
      formats: ['es'],
      fileName: (_format, name) => `${name}.js`,
    },
    rollupOptions: {
      external: isExternal,
    },
  },
})
