export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface BoundingBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export const tileToWorld = (tileX: number, tileY: number, tileSize: number): Point =>
  Object.freeze({
    x: Math.floor(tileX * tileSize),
    y: Math.floor(tileY * tileSize),
  });

export const worldToTile = (worldX: number, worldY: number, tileSize: number): Point =>
  Object.freeze({
    x: Math.floor(worldX / tileSize),
    y: Math.floor(worldY / tileSize),
  });

export const isWithinBounds = (x: number, y: number, width: number, height: number): boolean =>
  x >= 0 && x < width && y >= 0 && y < height;

export const coordsToIndex = (x: number, y: number, width: number): number =>
  y * width + x;

export const indexToCoords = (index: number, width: number): Point =>
  Object.freeze({
    x: index % width,
    y: Math.floor(index / width),
  });

export const intersectsAABB = (a: BoundingBox, b: BoundingBox): boolean =>
  a.x < b.x + b.width &&
  a.x + a.width > b.x &&
  a.y < b.y + b.height &&
  a.y + a.height > b.y;

export const manhattanDistance = (a: Point, b: Point): number =>
  Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

export const euclideanDistance = (a: Point, b: Point): number =>
  Math.hypot(a.x - b.x, a.y - b.y);
