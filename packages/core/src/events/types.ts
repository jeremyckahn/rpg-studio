import type { Direction } from '../schemas/event.js';

export type CoreEvents = {
  'map:loaded': { readonly mapId: string | number };
  'player:move': {
    readonly fromX: number;
    readonly fromY: number;
    readonly toX: number;
    readonly toY: number;
    readonly direction: Direction;
  };
  'player:transfer': {
    readonly mapId: string | number;
    readonly x: number;
    readonly y: number;
    readonly direction?: Direction;
  };
  'dialogue:show': {
    readonly text: string;
    readonly speakerName?: string;
    readonly face?: string;
    readonly faceIndex?: number;
  };
  'dialogue:close': Record<string, never>;
  'switch:change': { readonly switchId: string | number; readonly value: boolean };
  'variable:change': { readonly variableId: string | number; readonly value: number };
  'audio:playSE': { readonly name: string; readonly volume?: number; readonly pitch?: number };
  'audio:playBGM': { readonly name: string; readonly volume?: number; readonly pitch?: number };
  'save:create': { readonly slot: number };
  'save:load': { readonly slot: number };
}
