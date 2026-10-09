import { Box, Chip, Divider, Stack, Typography } from '@mui/material'
import { useSyncExternalStore } from 'react'

import { useAppSelector, useServices } from '../components/services.tsx'
import { type PreviewController } from './previewController.ts'

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <Box sx={{ mb: 1.5, px: 1 }}>
    <Typography variant="overline" color="text.secondary">
      {title}
    </Typography>
    <Stack spacing={0.25}>{children}</Stack>
  </Box>
)

const Row = ({ name, value, id }: { name: string; value: React.ReactNode; id?: string }) => (
  <Stack
    direction="row"
    spacing={1}
    sx={{ alignItems: 'baseline', justifyContent: 'space-between' }}
  >
    <Typography variant="body2" noWrap title={id ? `#${id}` : undefined}>
      {name}
    </Typography>
    <Typography variant="body2" component="span" sx={{ fontVariantNumeric: 'tabular-nums' }}>
      {value}
    </Typography>
  </Stack>
)

/** A named id, or `#id` when it has no name; every id that is named or has been set is listed. */
const idRows = <T,>(
  names: Readonly<Record<string, string>>,
  values: Readonly<Record<number, T>>,
  show: (value: T | undefined) => React.ReactNode,
): React.ReactNode[] => {
  const ids = [...new Set([...Object.keys(names), ...Object.keys(values)])]
    .map(Number)
    .toSorted((a, b) => a - b)
  return ids.map((id) => (
    <Row key={id} id={String(id)} name={names[id] ?? `#${id}`} value={show(values[id])} />
  ))
}

const DebugBody = ({ controller }: { controller: PreviewController }) => {
  const state = useSyncExternalStore(controller.subscribe, controller.getState)
  const project = useAppSelector((root) => root.project.data)
  const info = state.info

  if (!info) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ p: 1 }}>
        {state.phase === 'failed' ? 'The game is not running.' : 'Starting…'}
      </Typography>
    )
  }

  const actor = (id: number): string =>
    project.database.actors.find((candidate) => candidate.id === id)?.name ?? `Actor ${id}`
  const item = (id: number): string =>
    project.database.items.find((candidate) => candidate.id === id)?.name ?? `Item ${id}`
  const switches = idRows(project.meta.switchNames, info.switches, (value) =>
    value ? 'ON' : 'OFF',
  )
  const variables = idRows(project.meta.variableNames, info.variables, (value) => value ?? 0)
  const items = Object.entries(info.inventory).filter(([, count]) => count > 0)

  return (
    <Box data-testid="preview-debug">
      <Stack direction="row" spacing={0.5} sx={{ p: 1 }}>
        <Chip size="small" label={state.running ? 'Running' : 'Paused'} />
        <Chip size="small" label={`tick ${info.tick}`} variant="outlined" />
      </Stack>
      <Divider />
      <Section title="Where">
        <Row name="Map" value={`${info.mapName} (#${info.mapId})`} />
        <Row name="Tile" value={`${info.player.x}, ${info.player.y}`} />
        <Row name="Facing" value={info.player.direction} />
        <Row name="Message" value={info.message ?? '—'} />
        <Row name="Event running" value={info.eventRunning ? 'yes' : 'no'} />
      </Section>
      <Section title="Party">
        <Row name="Gold" value={info.gold} />
        {info.party.map((member) => (
          <Row
            key={member.actorId}
            name={actor(member.actorId)}
            value={`Lv ${member.level} · HP ${member.hp} · MP ${member.mp}`}
          />
        ))}
        {items.map(([id, count]) => (
          <Row key={id} name={item(Number(id))} value={`×${count}`} />
        ))}
      </Section>
      <Section title="Switches">
        {switches.length > 0 ? switches : <Typography variant="body2">None set</Typography>}
      </Section>
      <Section title="Variables">
        {variables.length > 0 ? variables : <Typography variant="body2">None set</Typography>}
      </Section>
    </Box>
  )
}

/**
 * What the running game is doing, read-only: where the player is, the party, and every switch and
 * variable that is named or has been set. It reads whichever Play tab is open through the hub.
 */
export const PreviewDebugPanel = () => {
  const { preview } = useServices()
  const controller = useSyncExternalStore(preview.subscribe, preview.current)
  return controller ? (
    <DebugBody controller={controller} />
  ) : (
    <Typography variant="body2" color="text.secondary" sx={{ p: 1 }}>
      Open the Play tab.
    </Typography>
  )
}
