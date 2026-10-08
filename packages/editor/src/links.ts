/** The user guide: Markdown in `docs/user-guide`. Keep page names in step with it (AGENTS.md). */
export const USER_GUIDE_URL = 'https://github.com/jeremyckahn/rpg-studio/tree/main/docs/user-guide'

/** Guide pages the app links to directly; `tooling/user-guide.test.ts` checks each exists. */
export const USER_GUIDE_PAGES = { companion: 'ai-companion.md' } as const

export const userGuideUrl = (
  page?: (typeof USER_GUIDE_PAGES)[keyof typeof USER_GUIDE_PAGES],
): string =>
  page === undefined
    ? USER_GUIDE_URL
    : `https://github.com/jeremyckahn/rpg-studio/blob/main/docs/user-guide/${page}`
