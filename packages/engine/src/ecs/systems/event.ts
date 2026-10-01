import type { GameWorld } from '../world.js';
import type { EventCommand, Direction } from '@rpgstudio/core';

export interface EventSystemState {
  switches: Map<string, boolean>;
  variables: Map<string, number>;
  onShowText?: (text: string, speakerName?: string) => void;
  onTransferPlayer?: (mapId: string | number, x: number, y: number, direction?: Direction) => void;
  onPlaySE?: (name: string, volume?: number, pitch?: number) => void;
  onPlayBGM?: (name: string, volume?: number, pitch?: number) => void;
}

export const evaluateCondition = (
  condition: {
    type: 'switch' | 'variable';
    id: string | number;
    op?: '==' | '!=' | '>=' | '<=' | '>' | '<';
    value: boolean | number;
  },
  state: EventSystemState
): boolean => {
  const key = String(condition.id);

  if (condition.type === 'switch') {
    const actual = state.switches.get(key) ?? false;
    return actual === Boolean(condition.value);
  }

  if (condition.type === 'variable') {
    const actual = state.variables.get(key) ?? 0;
    const target = Number(condition.value);
    const op = condition.op ?? '==';

    switch (op) {
      case '==': return actual === target;
      case '!=': return actual !== target;
      case '>=': return actual >= target;
      case '<=': return actual <= target;
      case '>': return actual > target;
      case '<': return actual < target;
      default: return actual === target;
    }
  }

  return false;
};

export const createEventSystem = (
  world: GameWorld,
  state: EventSystemState
) => {
  const eventEntities = world.with('eventTrigger');

  const executeCommand = (cmd: EventCommand, queue: EventCommand[], insertIndex: number): number => {
    switch (cmd.command) {
      case 'ShowText':
        if (state.onShowText) {
          state.onShowText(cmd.text, cmd.speakerName);
        }
        return 0;

      case 'TransferPlayer':
        if (state.onTransferPlayer) {
          state.onTransferPlayer(cmd.mapId, cmd.x, cmd.y, cmd.direction);
        }
        return 0;

      case 'SetSwitch':
        state.switches.set(String(cmd.switchId), cmd.value);
        return 0;

      case 'SetVariable': {
        const key = String(cmd.variableId);
        const current = state.variables.get(key) ?? 0;
        const computeNext = (): number => {
          switch (cmd.operation) {
            case 'set': return cmd.value;
            case 'add': return current + cmd.value;
            case 'sub': return current - cmd.value;
            case 'mul': return current * cmd.value;
            case 'div': return cmd.value !== 0 ? Math.floor(current / cmd.value) : current;
            case 'mod': return cmd.value !== 0 ? current % cmd.value : current;
            default: return current;
          }
        };
        state.variables.set(key, computeNext());
        return 0;
      }

      case 'PlaySE':
        if (state.onPlaySE) {
          state.onPlaySE(cmd.name, cmd.volume, cmd.pitch);
        }
        return 0;

      case 'PlayBGM':
        if (state.onPlayBGM) {
          state.onPlayBGM(cmd.name, cmd.volume, cmd.pitch);
        }
        return 0;

      case 'Wait':
        return cmd.frames;

      case 'ConditionalBranch': {
        const passes = evaluateCondition(cmd.condition, state);
        const branchCommands = passes
          ? [...cmd.thenCommands]
          : cmd.elseCommands ? [...cmd.elseCommands] : [];
        if (branchCommands.length > 0) {
          queue.splice(insertIndex, 0, ...branchCommands);
        }
        return 0;
      }

      default:
        return 0;
    }
  };

  return () => {
    for (const entity of eventEntities) {
      const trigger = entity.eventTrigger;
      if (!trigger || !trigger.active) {
        continue;
      }

      // Check wait frames
      if (trigger.waitFrames > 0) {
        trigger.waitFrames--;
        continue;
      }

      const queue = [...trigger.commandQueue];

      while (trigger.commandIndex < queue.length) {
        const cmd = queue[trigger.commandIndex];
        if (!cmd) {
          trigger.commandIndex++;
          continue;
        }

        const wait = executeCommand(cmd, queue, trigger.commandIndex + 1);
        trigger.commandIndex++;

        if (wait > 0) {
          trigger.waitFrames = wait;
          trigger.commandQueue = queue;
          return;
        }
      }

      // Queue finished
      trigger.active = false;
      trigger.commandQueue = [];
      trigger.commandIndex = 0;
    }
  };
};
