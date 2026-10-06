import { useMediaQuery, useTheme } from '@mui/material'

export interface LayoutMode {
  /** Phone and small-tablet screens: one workspace with a switchable bottom sheet instead of side docks. */
  readonly compact: boolean
  /** The screen is taller than it is wide. Only meaningful for the sheet's placement. */
  readonly portrait: boolean
}

/**
 * Chooses between the desktop layout (docked side panels) and the compact one.
 * Width decides compactness, so a phone in landscape and a tablet in portrait are
 * both compact; orientation then decides where the sheet goes (below the map in
 * portrait, beside it in landscape).
 */
export const useLayoutMode = (): LayoutMode => {
  const theme = useTheme()
  const compact = useMediaQuery(theme.breakpoints.down('md'))
  const portrait = useMediaQuery('(orientation: portrait)')
  return { compact, portrait }
}
