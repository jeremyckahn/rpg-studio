/** The user guide: the project's GitHub wiki. Keep page names in step with the wiki (AGENTS.md). */
export const WIKI_URL = 'https://github.com/jeremyckahn/rpg-studio/wiki'

/** Wiki pages the app links to directly; `tooling/wiki.test.ts` checks each exists in the wiki. */
export const WIKI_PAGES = { companion: 'AI-Companion' } as const

export const wikiUrl = (page?: (typeof WIKI_PAGES)[keyof typeof WIKI_PAGES]): string =>
  page === undefined ? WIKI_URL : `${WIKI_URL}/${page}`
