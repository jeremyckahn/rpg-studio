import { type ActorClass, type Project, type Stats } from '@rpgstudio/core'

import { type PartyMember } from './types.ts'

const STAT_KEYS = ['maxHp', 'maxMp', 'attack', 'defense', 'magic', 'speed', 'luck'] as const

/** Base stats plus per-level growth, floored (the formula RPG Maker classes use). */
export const statsAtLevel = (actorClass: ActorClass, level: number): Stats =>
  Object.fromEntries(
    STAT_KEYS.map((key) => [
      key,
      Math.floor(actorClass.baseStats[key] + actorClass.growth[key] * (level - 1)),
    ]),
  ) as Stats

export const partyMemberStats = (project: Project, member: PartyMember): Stats | undefined => {
  const actor = project.database.actors.find((candidate) => candidate.id === member.actorId)
  const actorClass = project.database.classes.find((candidate) => candidate.id === actor?.classId)
  return actorClass && statsAtLevel(actorClass, member.level)
}

/** A fresh party member at the actor's initial level with full HP and MP. */
export const createPartyMember = (project: Project, actorId: number): PartyMember => {
  const actor = project.database.actors.find((candidate) => candidate.id === actorId)
  if (!actor) throw new RangeError(`Actor ${actorId} does not exist`)
  const member: PartyMember = {
    actorId,
    level: actor.initialLevel,
    experience: 0,
    hp: 0,
    mp: 0,
  }
  const stats = partyMemberStats(project, member)
  if (!stats) throw new RangeError(`Actor ${actorId} has no class ${actor.classId}`)
  return { ...member, hp: stats.maxHp, mp: stats.maxMp }
}
