import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { CLOSE } from '../packages/companion-bridge/src/server.ts'
import {
  CAPABILITIES,
  COMMAND_CODES,
  ProjectActionSchema,
  QuerySchema,
  SCHEMA_NAMES,
} from '../packages/core/src/index.ts'

/**
 * Documentation for agents is only useful if it stays true, so drift is a test failure.
 * See docs/decisions.md (ADR-024) and tooling/AGENTS.md.
 */

const root = resolve(import.meta.dirname, '..')

const SKIPPED_DIRECTORIES = new Set(['node_modules', '.git', '.vercel', '.claude', 'coverage'])
/** Markdown that is third-party or generated, not ours to police. */
const SKIPPED_FILES = new Set(['packages/editor/public/piskel/NOTICE.md'])

const markdownFiles = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      return SKIPPED_DIRECTORIES.has(entry.name) || entry.name.startsWith('dist')
        ? []
        : markdownFiles(path)
    }
    return entry.name.endsWith('.md') && !SKIPPED_FILES.has(relative(root, path)) ? [path] : []
  })

const files = markdownFiles(root).map((path) => ({
  path,
  name: relative(root, path),
  text: readFileSync(path, 'utf8'),
}))

const read = (name: string): string => readFileSync(join(root, name), 'utf8')

/** Text with fenced code blocks removed. */
const withoutFences = (text: string): string => text.replace(/^```[\s\S]*?^```/gm, '')

/** GitHub's heading → anchor rule, including the `-1` suffix for repeated headings. */
const anchorsOf = (text: string): Set<string> => {
  const headings = [...withoutFences(text).matchAll(/^#{1,6}\s+(.+?)\s*#*\s*$/gm)].map(
    (m) => m[1] ?? '',
  )
  const bases = headings.map((heading) =>
    heading
      .replace(/`/g, '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s_-]/gu, '')
      .trim()
      .replace(/\s/g, '-'),
  )
  // A repeated heading gets "-1", "-2"… in order of appearance.
  return new Set(
    bases.map((base, index) => {
      const earlier = bases.slice(0, index).filter((candidate) => candidate === base).length
      return earlier === 0 ? base : `${base}-${earlier}`
    }),
  )
}

describe('markdown links', () => {
  it('finds the documents this test is meant to protect', () => {
    const names = files.map((file) => file.name)
    expect(names).toEqual(
      expect.arrayContaining([
        'AGENTS.md',
        'README.md',
        'docs/README.md',
        'docs/architecture.md',
        'docs/decisions.md',
        'packages/core/AGENTS.md',
      ]),
    )
  })

  it.each(files.map((file) => [file.name, file] as const))(
    '%s: every relative link and anchor resolves',
    (_name, file) => {
      const links = [...withoutFences(file.text).matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)].map(
        (m) => m[1] ?? '',
      )
      const problems = links.flatMap((link) => {
        if (/^[a-z][a-z0-9+.-]*:/i.test(link)) return [] // http:, https:, mailto:
        const [target = '', anchor] = link.split('#')
        const destination = target === '' ? file.path : resolve(dirname(file.path), target)
        if (!existsSync(destination))
          return [`${link}: ${relative(root, destination)} does not exist`]
        if (anchor && destination.endsWith('.md')) {
          const anchors = anchorsOf(readFileSync(destination, 'utf8'))
          if (!anchors.has(anchor)) return [`${link}: no heading produces the anchor "#${anchor}"`]
        }
        return []
      })
      expect(problems).toEqual([])
    },
  )
})

describe('repository paths mentioned in prose', () => {
  it.each(files.map((file) => [file.name, file] as const))(
    '%s: every `packages/…`, `docs/…` or `tooling/…` path exists',
    (_name, file) => {
      const mentioned = [
        ...withoutFences(file.text).matchAll(/`((?:packages|docs|tooling)\/[A-Za-z0-9_./@-]+)`/g),
      ].map((m) => m[1] ?? '')
      const missing = mentioned.filter(
        // Build outputs and generated folders do not exist in a fresh checkout.
        (path) => !/dist/.test(path) && !existsSync(join(root, path)),
      )
      expect(missing).toEqual([])
    },
  )
})

describe('package maps', () => {
  const packageDirectories = readdirSync(join(root, 'packages'), { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() && existsSync(join(root, 'packages', entry.name, 'package.json')),
    )
    .map((entry) => entry.name)

  it('gives every package, and tooling, its own AGENTS.md', () => {
    expect(packageDirectories.length).toBeGreaterThanOrEqual(4)
    const missing = [
      ...packageDirectories.map((name) => `packages/${name}`),
      'tooling',
      'packages/editor/public/piskel',
    ].filter((directory) => !existsSync(join(root, directory, 'AGENTS.md')))
    expect(missing).toEqual([])
  })

  it('mentions every package by name in the root AGENTS.md and README', () => {
    const names = packageDirectories.map((directory) => {
      const manifest = JSON.parse(read(`packages/${directory}/package.json`)) as { name: string }
      return manifest.name
    })
    const agents = read('AGENTS.md')
    const readme = read('README.md')
    expect(
      names.filter(
        (name) => !agents.includes(name.replace('@rpgstudio/', '')) && !agents.includes(name),
      ),
    ).toEqual([])
    expect(names.filter((name) => !readme.includes(name))).toEqual([])
  })

  it.each(packageDirectories)(
    'packages/%s/AGENTS.md: the file map only names files that exist',
    (directory) => {
      const base = join(root, 'packages', directory)
      const agents = readFileSync(join(base, 'AGENTS.md'), 'utf8')
      const blocks = [...agents.matchAll(/^```[^\n]*\n([\s\S]*?)^```/gm)].map((m) => m[1] ?? '')
      // The first token of every unindented line in a code block is a path relative to the package.
      const tokens = blocks
        .flatMap((block) => block.split('\n'))
        .filter((line) => /^[a-z]/.test(line))
        .map((line) => line.split(/\s+/)[0] ?? '')
        .filter((token) =>
          /^(?:src|test|scripts|public)\/|^[\w.-]+\.(?:ts|tsx|json|md)$/.test(token),
        )
      expect(tokens.length).toBeGreaterThan(5)
      expect(tokens.filter((token) => !existsSync(join(base, token)))).toEqual([])
    },
  )
})

describe('docs list what the code defines', () => {
  const editor = read('docs/editor.md')
  const protocol = read('docs/companion-protocol.md')
  const dataModel = read('docs/data-model.md')
  const plugins = read('docs/plugins.md')
  const agents = read('AGENTS.md')

  it('documents every project action', () => {
    const types = ProjectActionSchema.options.map((option) => option.shape.type.value)
    expect(types).toHaveLength(16)
    expect(types.filter((type) => !editor.includes(`\`${type}\``))).toEqual([])
  })

  it('documents every companion query and schema name', () => {
    const queries = QuerySchema.options.map((option) => option.shape.type.value)
    expect(queries.filter((type) => !protocol.includes(`\`${type}\``))).toEqual([])
    expect(SCHEMA_NAMES.filter((name) => !protocol.includes(name))).toEqual([])
  })

  it('documents every event command and its compact code', () => {
    const missing = Object.entries(COMMAND_CODES).flatMap(([command, code]) => [
      ...(dataModel.includes(command) ? [] : [command]),
      ...(dataModel.includes(`${command} ${code}`) || dataModel.includes(`\`${command} ${code}\``)
        ? []
        : [`${command} ${code}`]),
    ])
    expect(missing).toEqual([])
  })

  it('documents every plugin capability', () => {
    expect(CAPABILITIES.filter((capability) => !plugins.includes(`\`${capability}\``))).toEqual([])
  })

  it('documents every companion close code', () => {
    const codes = Object.values(CLOSE)
    // Tolerant of Prettier re-aligning table columns.
    expect(codes.filter((code) => !new RegExp(`\\|\\s*${code}\\s*\\|`).test(protocol))).toEqual([])
  })

  it('documents every root script', () => {
    const scripts = Object.keys(
      (JSON.parse(read('package.json')) as { scripts: Record<string, string> }).scripts,
    )
    expect(scripts.filter((script) => !agents.includes(`pnpm ${script}`))).toEqual([])
  })
})
