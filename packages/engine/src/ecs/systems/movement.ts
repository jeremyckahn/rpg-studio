import type { GameWorld } from '../world.js';
import type { GameEntity } from '../components.js';
import type { Direction } from '@rpgstudio/core';

export interface MovementSystemOptions {
  tileSize?: number;
  isPassable?: (x: number, y: number) => boolean;
}

export const getDirectionFromDelta = (dx: number, dy: number): Direction => {
  if (dx > 0) return 'right';
  if (dx < 0) return 'left';
  if (dy > 0) return 'down';
  return 'up';
};

export const requestEntityMove = (
  entity: GameEntity,
  targetX: number,
  targetY: number,
  isPassable: (x: number, y: number) => boolean = () => true
): boolean => {
  if (!entity.position || !entity.movement) {
    return false;
  }

  // Already moving
  if (entity.movement.moving) {
    return false;
  }

  const dx = targetX - entity.position.x;
  const dy = targetY - entity.position.y;
  if (dx === 0 && dy === 0) {
    return false;
  }

  entity.movement.direction = getDirectionFromDelta(dx, dy);

  if (!isPassable(targetX, targetY)) {
    return false;
  }

  entity.movement.targetX = targetX;
  entity.movement.targetY = targetY;
  entity.movement.moving = true;
  return true;
};

export const createMovementSystem = (
  world: GameWorld,
  options: MovementSystemOptions = {}
) => {
  const tileSize = options.tileSize ?? 32;
  const isPassable = options.isPassable ?? (() => true);

  const movingEntities = world.with('position', 'movement');

  return (deltaTime: number) => {
    // Entities with collision
    const solidEntities = world.with('position', 'collision');

    for (const entity of movingEntities) {
      const { position, movement } = entity;

      if (!movement.moving) {
        // If target differs from current position, initiate move if clear
        if (movement.targetX !== position.x || movement.targetY !== position.y) {
          const isSolidBlocked = Array.from(solidEntities).some(
            (other) =>
              other !== entity &&
              other.collision.solid &&
              other.position.x === movement.targetX &&
              other.position.y === movement.targetY
          );

          if (isPassable(movement.targetX, movement.targetY) && !isSolidBlocked) {
            movement.moving = true;
          } else {
            movement.targetX = position.x;
            movement.targetY = position.y;
          }
        }
      }

      if (movement.moving) {
        const targetPixelX = movement.targetX * tileSize;
        const targetPixelY = movement.targetY * tileSize;

        const step = movement.speed * (tileSize / 8) * (deltaTime / 16.666);
        const distToX = targetPixelX - position.pixelX;
        const distToY = targetPixelY - position.pixelY;

        if (Math.abs(distToX) <= step && Math.abs(distToY) <= step) {
          position.pixelX = targetPixelX;
          position.pixelY = targetPixelY;
          position.x = movement.targetX;
          position.y = movement.targetY;
          movement.moving = false;
        } else {
          if (distToX !== 0) {
            position.pixelX += Math.sign(distToX) * Math.min(step, Math.abs(distToX));
          }
          if (distToY !== 0) {
            position.pixelY += Math.sign(distToY) * Math.min(step, Math.abs(distToY));
          }
        }
      } else {
        // Ensure pixel alignment when stationary
        position.pixelX = position.x * tileSize;
        position.pixelY = position.y * tileSize;
      }
    }
  };
};
