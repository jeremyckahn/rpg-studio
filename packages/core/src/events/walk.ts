import { type EventCommand } from '../schemas/event.ts'

/** Every command in `commands`, descending into both arms of each branch. */
export const flattenCommands = (commands: readonly EventCommand[]): EventCommand[] =>
  commands.flatMap((command) =>
    command.command === 'ConditionalBranch'
      ? [command, ...flattenCommands(command.then), ...flattenCommands(command.else)]
      : [command],
  )
