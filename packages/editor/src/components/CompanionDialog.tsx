import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Link,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { DEFAULT_COMPANION_URL } from '@rpgstudio/core'
import { useState } from 'react'

import { parseCompanionUrl } from '../bridge/companionClient.ts'
import { WIKI_PAGES, wikiUrl } from '../links.ts'
import { useAppSelector, useServices } from './services.tsx'

/** Where to connect the editor to a local companion server so AI agents can drive it. */
export const CompanionDialog = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const { companion } = useServices()
  const { status, error } = useAppSelector((state) => state.editorUi.companion)
  const [url, setUrl] = useState(DEFAULT_COMPANION_URL)
  const [token, setToken] = useState('')
  const [problem, setProblem] = useState<string | null>(null)

  const connect = (): void => {
    try {
      parseCompanionUrl(url)
    } catch (cause) {
      setProblem(cause instanceof Error ? cause.message : String(cause))
      return
    }
    setProblem(null)
    companion.connect({ url, ...(token ? { token } : {}) })
    onClose()
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Companion bridge</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            Connect to a local companion server so an AI agent can read and edit this project. Start
            one with <code>pnpm dev:companion</code>. Anything an agent sends is validated before it
            changes your project, and each request can be undone in one step.{' '}
            <Link href={wikiUrl(WIKI_PAGES.companion)} target="_blank" rel="noopener noreferrer">
              Setup guide
            </Link>
          </Typography>
          <TextField
            label="Server address"
            value={url}
            onChange={(event) => {
              setUrl(event.target.value)
            }}
            helperText="Must start with ws:// or wss://"
          />
          <TextField
            label="Token (optional)"
            type="password"
            value={token}
            onChange={(event) => {
              setToken(event.target.value)
            }}
            helperText="Only needed if the server was started with --token"
          />
          {problem ? <Alert severity="error">{problem}</Alert> : null}
          {status !== 'disconnected' || error ? (
            <Alert severity={status === 'connected' ? 'success' : error ? 'warning' : 'info'}>
              {status === 'connected' ? 'Connected.' : error || 'Connecting…'}
            </Alert>
          ) : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button
          color="inherit"
          disabled={status === 'disconnected'}
          onClick={() => {
            companion.disconnect()
          }}
        >
          Disconnect
        </Button>
        <Button onClick={onClose}>Close</Button>
        <Button variant="contained" onClick={connect}>
          Connect
        </Button>
      </DialogActions>
    </Dialog>
  )
}
