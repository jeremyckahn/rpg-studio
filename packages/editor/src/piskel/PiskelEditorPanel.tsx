import SaveIcon from '@mui/icons-material/Save'
import { Alert, Box, Button, Stack, Typography } from '@mui/material'
import { useEffect, useRef, useState } from 'react'

import { type FilesReadCapability, type FilesWriteCapability } from '../plugins/editorHost.ts'
import { useAppSelector } from '../components/services.tsx'
import { type PiskelBridge, createPiskelBridge } from './bridge.ts'

/** Where the vendored Piskel build is served from (see `pnpm piskel:vendor`). */
export const piskelUrl = (): string => `${import.meta.env.BASE_URL}piskel/index.html`

/** How long to wait for the embedded editor before suggesting it is missing. */
const READY_TIMEOUT_MS = 8_000

/**
 * The sprite editor panel. It is created by the pixel-editor plugin from the
 * file capabilities that plugin declared, so everything it reads and writes
 * goes through the same sandbox as any third-party plugin.
 */
export const createPiskelEditorPanel = (files: {
  read: FilesReadCapability
  write: FilesWriteCapability
}) =>
  function PiskelEditorPanel() {
    const path = useAppSelector((state) => state.editorUi.openAssetPath)
    const frame = useRef<HTMLIFrameElement>(null)
    const [bridge, setBridge] = useState<PiskelBridge | null>(null)
    const [ready, setReady] = useState(false)
    const [missing, setMissing] = useState(false)
    const [message, setMessage] = useState<{ severity: 'success' | 'error'; text: string } | null>(
      null,
    )

    useEffect(() => {
      const created = createPiskelBridge({
        target: () => frame.current?.contentWindow ?? null,
        origin: window.location.origin,
        files: {
          readText: files.read.readText,
          readBytes: files.read.readBytes,
          write: files.write.write,
        },
      })
      const stopReady = created.onReady(() => {
        setReady(true)
        setMissing(false)
      })
      const stopError = created.onError((text) => {
        setMessage({ severity: 'error', text })
      })
      const stopSaved = created.onSaved((sprite) => {
        setMessage({
          severity: 'success',
          text: `Saved ${sprite.base}.png (${sprite.width * sprite.frames}×${sprite.height}) and ${sprite.base}.piskel`,
        })
      })
      const timer = window.setTimeout(() => {
        if (!created.isReady()) setMissing(true)
      }, READY_TIMEOUT_MS)
      setBridge(created)
      return () => {
        window.clearTimeout(timer)
        stopReady()
        stopError()
        stopSaved()
        created.dispose()
      }
    }, [])

    useEffect(() => {
      if (!path || !bridge) return
      bridge.open(path).catch((error: unknown) => {
        setMessage({
          severity: 'error',
          text: error instanceof Error ? error.message : String(error),
        })
      })
    }, [path, bridge])

    const save = (): void => {
      bridge?.save().catch((error: unknown) => {
        setMessage({
          severity: 'error',
          text: error instanceof Error ? error.message : String(error),
        })
      })
    }

    return (
      <Stack sx={{ height: '100%', minHeight: 0 }}>
        <Stack
          direction="row"
          spacing={1}
          sx={{ p: 1, alignItems: 'center', borderBottom: 1, borderColor: 'divider' }}
        >
          <Button
            size="small"
            variant="contained"
            startIcon={<SaveIcon />}
            disabled={!ready || !path}
            onClick={save}
          >
            Save to project
          </Button>
          <Typography variant="body2" color="text.secondary" noWrap>
            {path ?? 'Double-click a .png or .piskel in the asset browser to edit it'}
          </Typography>
        </Stack>
        {message ? (
          <Alert
            severity={message.severity}
            onClose={() => {
              setMessage(null)
            }}
          >
            {message.text}
          </Alert>
        ) : null}
        {missing ? (
          <Alert severity="warning">
            The embedded Piskel editor did not respond. Build it with{' '}
            <code>pnpm --filter @rpgstudio/editor piskel:vendor</code> and reload.
          </Alert>
        ) : null}
        <Box sx={{ flex: 1, minHeight: 0 }}>
          <iframe
            ref={frame}
            title="Piskel sprite editor"
            src={piskelUrl()}
            // Same-origin first-party build; no top navigation or popups.
            sandbox="allow-scripts allow-same-origin allow-downloads allow-modals"
            style={{ width: '100%', height: '100%', border: 0, background: '#222' }}
          />
        </Box>
      </Stack>
    )
  }
