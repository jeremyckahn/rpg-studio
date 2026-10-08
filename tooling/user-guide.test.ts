import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  ConditionSchema,
  EventCommandSchema,
  EventGraphicSchema,
  MapEventSchema,
  ProjectMetaSchema,
} from '../packages/core/src/index.ts'
import { USER_GUIDE_PAGES } from '../packages/editor/src/links.ts'

/**
 * Checks the user guide in `docs/user-guide`: links and heading anchors, that the index lists
 * every page, that the pages the app links to exist, and that JSON examples pass the real
 * schemas. See AGENTS.md ("The user guide") and tooling/AGENTS.md.
 */
const guideDir = resolve(import.meta.dirname, '../docs/user-guide')

const pages = readdirSync(guideDir)
  .filter((name) => name.endsWith('.md'))
  .map((name) => ({ file: name, text: readFileSync(join(guideDir, name), 'utf8') }))

const withoutFences = (text: string): string => text.replace(/^```[\s\S]*?^```/gm, '')

/** GitHub's heading → anchor rule. */
const anchorsOf = (text: string): Set<string> =>
  new Set(
    [...withoutFences(text).matchAll(/^#{1,6}\s+(.+?)\s*#*\s*$/gm)].map((m) =>
      (m[1] ?? '')
        .replace(/`/g, '')
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s_-]/gu, '')
        .trim()
        .replace(/\s/g, '-'),
    ),
  )

const anchors = new Map(pages.map(({ file, text }) => [file, anchorsOf(text)]))
const content = pages

describe('the user guide', () => {
  it('links only to files and headings that exist', () => {
    const broken = pages.flatMap(({ file, text }) =>
      [...withoutFences(text).matchAll(/\]\(([^)\s]+)\)/g)].flatMap((m) => {
        const target = m[1] ?? ''
        if (/^[a-z]+:/i.test(target)) return []
        const [targetPath = '', anchor = ''] = target.split('#')
        const resolvedPath = targetPath === '' ? file : targetPath
        const absolute = resolve(guideDir, dirname(file), resolvedPath)
        if (!existsSync(absolute)) return [`${file}: no file "${resolvedPath}" (${target})`]
        if (anchor === '') return []
        const known =
          dirname(resolvedPath) === '.'
            ? anchors.get(resolvedPath)
            : anchorsOf(readFileSync(absolute, 'utf8'))
        return known?.has(anchor) ? [] : [`${file}: no heading "#${anchor}" in ${resolvedPath}`]
      }),
    )
    expect(broken).toEqual([])
  })

  it('lists every page in the index', () => {
    const index = pages.find(({ file }) => file === 'README.md')?.text ?? ''
    const missing = content
      .map(({ file }) => file)
      .filter((file) => file !== 'README.md' && !index.includes(`](${file})`))
    expect(missing).toEqual([])
  })

  it('has every page the app links to', () => {
    const names = new Set(pages.map(({ file }) => file))
    expect(Object.values(USER_GUIDE_PAGES).filter((page) => !names.has(page))).toEqual([])
  })

  it('shows only JSON examples that the real schemas accept', () => {
    const problems = content.flatMap(({ file, text }) =>
      [...text.matchAll(/^```json\n([\s\S]*?)^```/gm)].flatMap((m) => {
        const body = m[1] ?? ''
        // Examples abbreviated with "…" are illustrations, not data.
        if (body.includes('…')) return []
        let value: unknown
        try {
          value = JSON.parse(body)
        } catch (error) {
          return [`${file}: invalid JSON (${String(error)}): ${body.slice(0, 40)}`]
        }
        const first = (Array.isArray(value) ? value[0] : value) as
          Record<string, unknown> | undefined
        const schema = Array.isArray(value)
          ? first && 'pages' in first
            ? MapEventSchema.array()
            : first && 'command' in first
              ? EventCommandSchema.array()
              : first && 'type' in first && 'switchId' in first
                ? ConditionSchema.array()
                : first && 'type' in first && 'variableId' in first
                  ? ConditionSchema.array()
                  : undefined
          : first && 'frameWidth' in first
            ? EventGraphicSchema
            : first && 'format' in first
              ? ProjectMetaSchema
              : undefined
        if (!schema) return []
        const result = schema.safeParse(value)
        return result.success
          ? []
          : [`${file}: ${JSON.stringify(result.error.issues.slice(0, 2))} in ${body.slice(0, 40)}`]
      }),
    )
    expect(problems).toEqual([])
  })
})
