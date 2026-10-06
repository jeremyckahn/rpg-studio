import { CssBaseline, ThemeProvider, createTheme } from '@mui/material'
import { Provider } from 'react-redux'

import { MasterLayout } from './components/MasterLayout.tsx'
import { type EditorServices, ServicesProvider } from './components/services.tsx'
import { type EditorStore } from './store/index.ts'

const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: '#64b5f6' },
    background: { default: '#1b1d23', paper: '#23262e' },
  },
  shape: { borderRadius: 6 },
  typography: { fontSize: 13 },
  components: {
    // Fingers need bigger targets than mice, and iOS zooms into inputs below 16px.
    MuiButtonBase: {
      styleOverrides: { root: { '@media (pointer: coarse)': { minHeight: 44, minWidth: 44 } } },
    },
    MuiInputBase: {
      styleOverrides: { root: { '@media (pointer: coarse)': { fontSize: 16 } } },
    },
  },
})

export interface AppProps {
  readonly store: EditorStore
  readonly services: EditorServices
}

/** The editor: Redux and services at the root, the master layout inside. */
export const App = ({ store, services }: AppProps) => (
  <Provider store={store}>
    <ServicesProvider services={services}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <MasterLayout />
      </ThemeProvider>
    </ServicesProvider>
  </Provider>
)
