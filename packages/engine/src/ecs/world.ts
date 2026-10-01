import { World } from 'miniplex';
import type { GameEntity } from './components.js';

export type GameWorld = World<GameEntity>;

export const createGameWorld = (): GameWorld => new World<GameEntity>();
