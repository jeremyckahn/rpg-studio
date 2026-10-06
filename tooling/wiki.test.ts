import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  ConditionSchema,
  EventCommandSchema,
  EventGraphicSchema,
  MapEventSchema,
  ProjectMetaSchema,
} from '../packages/core/src/index.ts'
import { WIKI_PAGES } from '../packages/editor/src/links.ts'

/**
 * Checks a local clone of the GitHub wiki (the user guide, a separate git repo). It runs only
 * when a clone exists, at `../rpg-studio.wiki` or wherever `WIKI_DIR` points, so a fresh
 * checkout is unaffected. See AGENTS.md ("The wiki") and tooling/AGENTS.md.
 */
const wikiDir = process.env.WIKI_DIR ?? resolve(import.meta.dirname, '../../rpg-studio.wiki')
const present = existsSync(join(wikiDir, 'Home.md'))

const pages = present
  ? readdirSync(wikiDir)
      .filter((name) => name.endsWith('.md'))
      .map((name) => ({
        file: name,
        page: name.slice(0, -3),
        text: readFileSync(join(wikiDir, name), 'utf8'),
      }))
  : []

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

const anchors = new Map(pages.map(({ page, text }) => [page, anchorsOf(text)]))
const content = pages.filter(({ page }) => !page.startsWith('_'))

describe.skipIf(!present)('the wiki (user guide)', () => {
  it('links only to pages and headings that exist', () => {
    const broken = pages.flatMap(({ file, page, text }) =>
      [...withoutFences(text).matchAll(/\]\(([^)\s]+)\)/g)].flatMap((m) => {
        const target = m[1] ?? ''
        if (/^[a-z]+:/i.test(target)) return []
        const [targetPage = '', anchor = ''] = target.split('#')
        const resolved = targetPage === '' ? page : targetPage
        const known = anchors.get(resolved)
        if (!known) return [`${file}: no page "${resolved}" (${target})`]
        return anchor === '' || known.has(anchor)
          ? []
          : [`${file}: no heading "#${anchor}" in ${resolved}`]
      }),
    )
    expect(broken).toEqual([])
  })

  it('lists every page in the sidebar', () => {
    const sidebar = pages.find(({ page }) => page === '_Sidebar')?.text ?? ''
    const missing = content
      .map(({ page }) => page)
      .filter((page) => page !== 'Home' && !sidebar.includes(`](${page})`))
    expect(missing).toEqual([])
  })

  it('has every page the app links to', () => {
    const names = new Set(pages.map(({ page }) => page))
    expect(Object.values(WIKI_PAGES).filter((page) => !names.has(page))).toEqual([])
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
