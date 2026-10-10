import { type Game } from '@rpgstudio/engine'

/** Plain-JSON facts about the running game, for the status line, the Debug panel and agents. */
export interface PreviewInfo {
  readonly tick: number
  readonly mapId: number
  readonly mapName: string
  readonly player: {
    readonly x: number
    readonly y: number
    readonly direction: string
    readonly moving: boolean
  }
  readonly switches: Readonly<Record<number, boolean>>
  readonly variables: Readonly<Record<number, number>>
  readonly message: string | null
  readonly eventRunning: boolean
  readonly gold: number
  readonly party: readonly {
    readonly actorId: number
    readonly level: number
    readonly hp: number
    readonly mp: number
  }[]
  readonly inventory: Readonly<Record<number, number>>
}

/** A copy, never a view: the game keeps mutating its own state every tick. */
export const readInfo = (game: Game): PreviewInfo => {
  const snapshot = game.snapshot()
  const { state } = game
  return {
    tick: snapshot.tick,
    mapId: snapshot.mapId,
    mapName: state.map.name,
    player: { ...snapshot.player },
    switches: { ...snapshot.switches },
    variables: { ...snapshot.variables },
    message: snapshot.message,
    eventRunning: snapshot.eventRunning,
    gold: state.gold,
    party: state.party.map(({ actorId, level, hp, mp }) => ({ actorId, level, hp, mp })),
    inventory: { ...state.inventory },
  }
}

/** True when two readings say the same thing, so a poll that found nothing new can skip a render. */
export const sameInfo = (a: PreviewInfo | null, b: PreviewInfo | null): boolean =>
  JSON.stringify(a) === JSON.stringify(b)
