import Pause from '@mui/icons-material/Pause'
import PlayArrow from '@mui/icons-material/PlayArrow'
import Replay from '@mui/icons-material/Replay'
import {
  Alert,
  Box,
  ButtonBase,
  Chip,
  FormControlLabel,
  IconButton,
  Stack,
  Switch,
  Tooltip,
  Typography,
} from '@mui/material'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useStore } from 'react-redux'

import { useAppDispatch, useAppSelector, useServices } from '../components/services.tsx'
import { useLayoutMode } from '../components/useLayoutMode.ts'
import { type FilesReadCapability } from '../plugins/editorHost.ts'
import { type RootState } from '../store/index.ts'
import { editorUiSlice } from '../store/slices/editorUi.ts'
import {
  type PreviewControllerOptions,
  type PreviewState,
  createPreviewController,
} from './previewController.ts'
import { type PauseReason } from './previewControls.ts'
import { createPreviewHost } from './previewHost.ts'
import { describeStart } from './previewStart.ts'

const REASON_TEXT: Readonly<Record<PauseReason, { title: string; hint: string }>> = {
  user: { title: 'Paused', hint: 'Click or press Enter to resume' },
  focus: { title: 'Click to play', hint: 'Paused while you work elsewhere' },
  hidden: { title: 'Paused', hint: 'This browser tab is in the background' },
}

const describeRun = (state: PreviewState): string => {
  if (state.phase === 'starting') return 'Starting…'
  if (state.phase === 'failed') return 'Cannot start'
  if (state.crashed) return 'Stopped by an error'
  if (state.running) return 'Running'
  const reason = state.reasons[0]
  return reason === 'user'
    ? 'Paused'
    : reason === 'hidden'
      ? 'Paused (tab hidden)'
      : 'Paused (click the game to play)'
}

/**
 * The Play tab: the game, running inside the editor from the project as it is right now. It is
 * created by the preview plugin from the file capability that plugin declared. Everything that
 * decides what happens lives in `PreviewController`; this only shows it and passes input in.
 */
export const createPreviewPanel = (
  files: { read: FilesReadCapability },
  /** Tests substitute the session, since jsdom has no WebGL. */
  testing: { createSession?: PreviewControllerOptions['createSession'] } = {},
) =>
  function PreviewWorkspace() {
    const store = useStore<RootState>()
    const dispatch = useAppDispatch()
    const { preview } = useServices()
    const { compact } = useLayoutMode()
    const project = useAppSelector((state) => state.project.data)
    const keepPlace = useAppSelector((state) => state.editorUi.previewKeepPlace)

    // Creating these starts nothing: the effect below attaches them, and detaches on the way out.
    const [{ host, controller }] = useState(() => {
      const created = createPreviewHost({ store, read: files.read })
      const { editorUi } = store.getState()
      return {
        host: created,
        controller: createPreviewController({
          host: created,
          keepPlace: editorUi.previewKeepPlace,
          start: editorUi.previewStart,
          ...(testing.createSession ? { createSession: testing.createSession } : {}),
        }),
      }
    })
    const state = useSyncExternalStore(controller.subscribe, controller.getState)

    const frame = useRef<HTMLDivElement>(null)
    const stage = useRef<HTMLDivElement>(null)

    useEffect(() => {
      const element = stage.current
      if (!element) return undefined
      controller.attach(element)
      preview.set(controller)
      // Opening the tab is a request to play: focusing the game is what starts it.
      element.focus({ preventScroll: true })
      return () => {
        preview.set(null)
        controller.detach()
        host.dispose()
      }
    }, [controller, host, preview])

    const focusGame = (): void => {
      stage.current?.focus({ preventScroll: true })
    }
    const resume = (): void => {
      if (state.crashed) void controller.restart()
      else controller.send('userResumed')
      focusGame()
    }
    const pause = (): void => {
      controller.send('userPaused')
    }
    const restart = (): void => {
      void controller.restart()
      focusGame()
    }
    const clearStart = (): void => {
      dispatch(editorUiSlice.actions.previewStartSet(null))
      void controller.restart(null)
      focusGame()
    }

    const startLabel = describeStart(project, state.start)
    const ready = state.phase === 'ready'
    const standingStill = ready && !state.running
    const reason = state.crashed ? undefined : REASON_TEXT[state.reasons[0] ?? 'focus']

    return (
      <Stack ref={frame} sx={{ height: '100%', minHeight: 0 }}>
        <Stack
          direction="row"
          spacing={1}
          // A mouse or finger on the toolbar hands the keyboard back to the game, or the arrow keys
          // would silently stop working after a click. Keyboard use of the toolbar is left alone.
          onPointerUp={focusGame}
          sx={{
            p: 0.5,
            alignItems: 'center',
            borderBottom: 1,
            borderColor: 'divider',
            flexWrap: compact ? 'nowrap' : 'wrap',
            overflowX: 'auto',
            flexShrink: 0,
          }}
        >
          {state.running ? (
            <Tooltip title="Pause (Esc)">
              <span>
                <IconButton size="small" aria-label="Pause" onClick={pause}>
                  <Pause fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
          ) : (
            <Tooltip title="Play (Enter)">
              <span>
                <IconButton size="small" aria-label="Resume" disabled={!ready} onClick={resume}>
                  <PlayArrow fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
          )}
          <Tooltip title="Start again from the beginning">
            <span>
              <IconButton size="small" aria-label="Restart" disabled={!ready} onClick={restart}>
                <Replay fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="On: an edit reloads the game and keeps your place. Off: an edit starts the game again.">
            <FormControlLabel
              sx={{ ml: 1, mr: 0, flexShrink: 0 }}
              control={
                <Switch
                  size="small"
                  checked={keepPlace}
                  onChange={(_event, next) => {
                    dispatch(editorUiSlice.actions.previewKeepPlaceSet(next))
                    controller.setKeepPlace(next)
                  }}
                  slotProps={{ input: { 'aria-label': 'Keep my place when the project changes' } }}
                />
              }
              label={<Typography variant="body2">Keep my place</Typography>}
            />
          </Tooltip>
          {startLabel ? (
            <Chip
              size="small"
              label={`Starting at ${startLabel}`}
              onDelete={clearStart}
              deleteIcon={
                <span aria-label="Use the project start" role="img">
                  ✕
                </span>
              }
              sx={{ flexShrink: 0 }}
            />
          ) : null}
        </Stack>

        {state.notice ? (
          <Alert severity={state.notice.severity} sx={{ borderRadius: 0, py: 0 }}>
            {state.notice.text}
          </Alert>
        ) : null}

        <Box
          sx={{ position: 'relative', flex: 1, minHeight: 0, bgcolor: '#000', overflow: 'hidden' }}
        >
          <div
            ref={stage}
            role="application"
            aria-label="Game preview"
            tabIndex={0}
            style={{ position: 'absolute', inset: 0, outline: 'none', touchAction: 'none' }}
            onFocus={() => {
              controller.send('focusEntered')
            }}
            onBlur={(event) => {
              const next = event.relatedTarget
              // Moving to the toolbar is still "in the game"; going anywhere else is not.
              if (next instanceof Node && frame.current?.contains(next)) return
              controller.send('focusLeft')
            }}
            onKeyDown={(event) => {
              if (event.ctrlKey || event.metaKey || event.altKey) return
              if (event.key === 'Escape' && state.running) {
                event.preventDefault()
                pause()
              } else if ((event.key === 'Enter' || event.key === ' ') && standingStill) {
                event.preventDefault()
                resume()
              }
            }}
          />

          {state.phase === 'failed' ? (
            <Alert
              severity="error"
              sx={{ position: 'absolute', left: 16, right: 16, top: 16 }}
              role="alert"
            >
              <Typography variant="subtitle2">The game cannot start</Typography>
              {state.problems.map((problem) => (
                <Typography key={problem} variant="body2">
                  {problem}
                </Typography>
              ))}
              <Typography variant="body2" sx={{ mt: 1 }}>
                Fix this and the game starts by itself.
              </Typography>
            </Alert>
          ) : null}

          {standingStill ? (
            <ButtonBase
              onClick={resume}
              tabIndex={-1}
              aria-label={state.crashed ? 'Restart the game' : 'Resume the game'}
              sx={{
                position: 'absolute',
                inset: 0,
                bgcolor: 'rgba(0,0,0,0.55)',
                color: '#fff',
                flexDirection: 'column',
                gap: 0.5,
              }}
            >
              <Typography variant="h6" role="status">
                {state.crashed ? 'The game stopped' : reason?.title}
              </Typography>
              <Typography variant="body2">
                {state.crashed ? 'Click to start again' : reason?.hint}
              </Typography>
            </ButtonBase>
          ) : null}
        </Box>

        <Stack
          direction="row"
          spacing={1.5}
          sx={{
            px: 1,
            py: 0.5,
            borderTop: 1,
            borderColor: 'divider',
            flexShrink: 0,
            overflowX: 'auto',
            whiteSpace: 'nowrap',
          }}
        >
          <Typography variant="caption" data-testid="preview-status">
            {describeRun(state)}
          </Typography>
          {state.info ? (
            <Typography variant="caption" color="text.secondary">
              {state.info.mapName} · ({state.info.player.x}, {state.info.player.y}) · tick{' '}
              {state.info.tick}
            </Typography>
          ) : null}
          {state.pendingChange ? (
            <Typography variant="caption" color="warning.main">
              The project changed; the game updates when you resume
            </Typography>
          ) : null}
        </Stack>
      </Stack>
    )
  }
