import { Alert, Box, Button, MenuItem, Stack, TextField, Typography } from '@mui/material'
import { MapEventSchema } from '@rpgstudio/core'
import { useState } from 'react'
import { z } from 'zod'

import { applyProjectAction, selectCurrentMap } from '../store/index.ts'
import { projectActions } from '../store/slices/project.ts'
import { useAppDispatch, useAppSelector } from './services.tsx'

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <Box sx={{ mb: 2, px: 1 }}>
    <Typography variant="overline" color="text.secondary">
      {title}
    </Typography>
    <Stack spacing={1} sx={{ mt: 0.5 }}>
      {children}
    </Stack>
  </Box>
)

interface CommitFieldProps {
  label: string
  value: string | number
  onCommit: (value: string) => void
  type?: 'text' | 'number'
  /** Change this to throw away what was typed and show the stored value again (after a refusal). */
  resetToken?: number
}

const CommitFieldInner = ({ label, value, onCommit, type = 'text' }: CommitFieldProps) => {
  const [draft, setDraft] = useState(String(value))
  const commit = (): void => {
    if (draft !== String(value)) onCommit(draft)
  }
  return (
    <TextField
      size="small"
      label={label}
      type={type}
      value={draft}
      onChange={(event) => {
        setDraft(event.target.value)
      }}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') commit()
      }}
    />
  )
}

/**
 * Field that commits on blur or Enter, so typing does not create undo steps.
 * Keyed by its value, so it starts over from the stored value when that changes.
 */
const CommitField = (props: CommitFieldProps) => (
  <CommitFieldInner key={`${String(props.value)}:${String(props.resetToken ?? 0)}`} {...props} />
)

const EventsEditor = ({ initial }: { initial: string }) => {
  const dispatch = useAppDispatch()
  const project = useAppSelector((state) => state.project.data)
  const map = useAppSelector(selectCurrentMap)
  const [text, setText] = useState(initial)
  const [problem, setProblem] = useState<string | null>(null)
  if (!map) return null

  const apply = (): void => {
    let raw: unknown
    try {
      raw = JSON.parse(text)
    } catch (error) {
      setProblem(`Not valid JSON: ${error instanceof Error ? error.message : String(error)}`)
      return
    }
    const parsed = z.array(MapEventSchema).safeParse(raw)
    if (!parsed.success) {
      setProblem(
        parsed.error.issues
          .slice(0, 3)
          .map((issue) => `${['events', ...issue.path].join('.')}: ${issue.message}`)
          .join('\n'),
      )
      return
    }

    // Replace the event list with the edited one, as a single undo step. Removals
    // run first, then each event is added or updated and checked against the project.
    const keep = new Set(parsed.data.map((event) => event.id))
    const removals = map.events.filter((event) => !keep.has(event.id))
    const group = `events-${Date.now().toString(36)}`
    let working = project
    for (const event of removals) {
      const action = {
        type: 'project/removeMapEvent',
        payload: { mapId: map.id, eventId: event.id },
      } as const
      const result = applyProjectAction(working, action)
      if (!result.success) {
        setProblem(result.error)
        return
      }
      working = result.data
    }
    for (const event of parsed.data) {
      const action = { type: 'project/upsertMapEvent', payload: { mapId: map.id, event } } as const
      const result = applyProjectAction(working, action)
      if (!result.success) {
        setProblem(`Event ${event.id}: ${result.error}`)
        return
      }
      working = result.data
    }
    removals.forEach((event) => {
      dispatch(projectActions.removeMapEvent({ mapId: map.id, eventId: event.id }, group))
    })
    parsed.data.forEach((event) => {
      dispatch(projectActions.upsertMapEvent({ mapId: map.id, event }, group))
    })
    setProblem(null)
  }

  return (
    <Section title="Events (JSON)">
      <TextField
        multiline
        minRows={6}
        maxRows={16}
        value={text}
        onChange={(event) => {
          setText(event.target.value)
        }}
        slotProps={{
          htmlInput: {
            'aria-label': 'Map events JSON',
            spellCheck: false,
            style: { fontFamily: 'monospace', fontSize: 12 },
          },
        }}
      />
      {problem ? (
        <Alert severity="error" sx={{ whiteSpace: 'pre-wrap' }}>
          {problem}
        </Alert>
      ) : null}
      <Button size="small" variant="outlined" onClick={apply} disabled={text === initial}>
        Apply events
      </Button>
    </Section>
  )
}

/** Keyed by the map and its stored events, so the editor resets when either changes. */
const EventsJson = () => {
  const map = useAppSelector(selectCurrentMap)
  if (!map) return null
  const canonical = JSON.stringify(map.events, null, 2)
  return <EventsEditor key={`${map.id}:${canonical}`} initial={canonical} />
}

/** Properties of the selected map and of the project's starting point. */
export const PropertiesPanel = () => {
  const dispatch = useAppDispatch()
  const map = useAppSelector(selectCurrentMap)
  const meta = useAppSelector((state) => state.project.data.meta)
  const maps = useAppSelector((state) => state.project.data.maps)
  // The refusal is remembered with its map so it is not shown under another map's fields.
  const [resizeRefusal, setResizeRefusal] = useState<{ mapId: number; message: string } | null>(
    null,
  )
  // One counter per field: a refusal remounts only the field it refused, not a sibling's draft.
  const [resizeResets, setResizeResets] = useState({ width: 0, height: 0 })
  // A blank or unchanged name changes nothing, so the field is put back to the stored name.
  const [nameResets, setNameResets] = useState({ map: 0, project: 0 })
  const [startError, setStartError] = useState<string | null>(null)
  const [startResets, setStartResets] = useState({ startX: 0, startY: 0 })
  const project = useAppSelector((state) => state.project.data)

  /** Renames only to a different, non-blank name; otherwise shows the stored name again. */
  const commitName = (
    field: 'map' | 'project',
    stored: string,
    typed: string,
    rename: (name: string) => void,
  ): void => {
    const name = typed.trim()
    if (name && name !== stored) rename(name)
    else setNameResets((counts) => ({ ...counts, [field]: counts[field] + 1 }))
  }

  return (
    <Box sx={{ overflow: 'auto', height: '100%', py: 1 }}>
      {map ? (
        <Section title="Map">
          <CommitField
            label="Name"
            value={map.name}
            resetToken={nameResets.map}
            onCommit={(typed) =>
              commitName('map', map.name, typed, (name) =>
                dispatch(projectActions.renameMap({ mapId: map.id, name })),
              )
            }
          />
          <Stack direction="row" spacing={1}>
            {(['width', 'height'] as const).map((dimension) => (
              <CommitField
                key={dimension}
                label={dimension === 'width' ? 'Width' : 'Height'}
                type="number"
                value={map[dimension]}
                resetToken={resizeResets[dimension]}
                onCommit={(value) => {
                  const next = {
                    width: map.width,
                    height: map.height,
                    [dimension]: Math.round(Number(value)),
                  }
                  const action = {
                    type: 'project/resizeMap',
                    payload: { mapId: map.id, ...next },
                  } as const
                  const result = applyProjectAction(project, action)
                  if (!result.success) {
                    // Put the stored size back, as the Start fields do, instead of leaving the refused number.
                    setResizeRefusal({ mapId: map.id, message: result.error })
                    setResizeResets((counts) => ({ ...counts, [dimension]: counts[dimension] + 1 }))
                    return
                  }
                  setResizeRefusal(null)
                  dispatch(projectActions.resizeMap(action.payload))
                }}
              />
            ))}
          </Stack>
          {resizeRefusal?.mapId === map.id ? (
            <Alert severity="warning">{resizeRefusal.message}</Alert>
          ) : null}
          <Typography variant="caption" color="text.secondary">
            Tileset: {map.tileset} · {map.tileSize}px tiles
          </Typography>
        </Section>
      ) : null}

      <Section title="Game start">
        <TextField
          select
          size="small"
          label="Start map"
          value={meta.startMapId}
          onChange={(event) => {
            setStartError(null)
            dispatch(
              projectActions.updateMeta({
                changes: { startMapId: Number(event.target.value), startX: 0, startY: 0 },
              }),
            )
          }}
        >
          {maps.map((candidate) => (
            <MenuItem key={candidate.id} value={candidate.id}>
              {candidate.id}. {candidate.name}
            </MenuItem>
          ))}
        </TextField>
        <Stack direction="row" spacing={1}>
          {(['startX', 'startY'] as const).map((field) => (
            <CommitField
              key={field}
              label={field === 'startX' ? 'Start X' : 'Start Y'}
              type="number"
              value={meta[field]}
              resetToken={startResets[field]}
              onCommit={(value) => {
                const action = {
                  type: 'project/updateMeta',
                  payload: { changes: { [field]: Math.max(0, Math.round(Number(value))) } },
                } as const
                // Say why a position is refused (off the map, say) and put the old number back.
                const result = applyProjectAction(project, action)
                if (!result.success) {
                  setStartError(result.error)
                  setStartResets((counts) => ({ ...counts, [field]: counts[field] + 1 }))
                  return
                }
                setStartError(null)
                dispatch(projectActions.updateMeta(action.payload))
              }}
            />
          ))}
        </Stack>
        {startError ? <Alert severity="warning">{startError}</Alert> : null}
        <CommitField
          label="Project name"
          value={meta.name}
          resetToken={nameResets.project}
          onCommit={(typed) =>
            commitName('project', meta.name, typed, (name) =>
              dispatch(projectActions.updateMeta({ changes: { name } })),
            )
          }
        />
      </Section>

      <EventsJson />
    </Box>
  )
}
