/** The part of a running game that a reload needs. */
export interface Checkpointable {
  canSave: () => boolean
  serialize: () => unknown
}

/**
 * What a live reload should continue from, or `undefined` to start again from the beginning.
 *
 * - With "keep my place" off, always start again.
 * - A game can only be saved between events, so while a cutscene runs the last checkpoint
 *   taken before it began is used instead (the cutscene then plays again from its start).
 */
export const chooseCheckpoint = (
  game: Checkpointable,
  remembered: unknown,
  keepPlace: boolean,
): unknown => {
  if (!keepPlace) return undefined
  return game.canSave() ? game.serialize() : remembered
}

/** The message shown when the new project could not take the player's place. */
export const describeRestart = (reason: string): string =>
  `Restarted from the beginning: ${reason.replace(/\.$/, '')}.`
