import {
  type Collision,
  type EventTrigger,
  type Movement,
  type Position,
  type SpriteData,
} from '@rpgstudio/core'
import { World } from 'miniplex'

/**
 * An entity is a plain object whose components are typed from the Zod
 * component schemas in `@rpgstudio/core`. Components are validated where data
 * enters the engine (map load, save restore, plugin and AI input); systems
 * mutate them directly while ticking.
 */
export interface Entity {
  readonly kind: 'player' | 'event'
  position?: Position
  movement?: Movement
  sprite?: SpriteData
  collision?: Collision
  eventTrigger?: EventTrigger
  /** Map event this entity was spawned from (event entities only). */
  eventId?: number
  /** Index of the page currently in effect, or -1 when no page is active. */
  activePage?: number
}

export const createWorld = (): World<Entity> => new World<Entity>()
