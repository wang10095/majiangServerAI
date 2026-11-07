import { Tile } from './types';

export const TILE_TYPE_COUNT = 27;
export const TILE_COPIES = 4;
export const WALL_SIZE = TILE_TYPE_COUNT * TILE_COPIES;

export function isNumberTile(tile: Tile): boolean {
  return tile >= 0 && tile <= 26;
}

export function isHonorTile(tile: Tile): boolean {
  return false;
}

export function tileSuit(tile: Tile): number {
  return Math.floor(tile / 9);
}

export function tileRank(tile: Tile): number {
  return (tile % 9) + 1;
}

export function createWall(random: () => number = Math.random): Tile[] {
  const wall: Tile[] = [];
  for (let tile = 0; tile < TILE_TYPE_COUNT; tile += 1) {
    for (let copy = 0; copy < TILE_COPIES; copy += 1) wall.push(tile);
  }
  for (let index = wall.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [wall[index], wall[swapIndex]] = [wall[swapIndex], wall[index]];
  }
  return wall;
}

export function sortTiles(tiles: Tile[]): Tile[] {
  return [...tiles].sort((left, right) => left - right);
}

export function countTiles(tiles: Tile[]): Map<Tile, number> {
  const counts = new Map<Tile, number>();
  for (const tile of tiles) counts.set(tile, (counts.get(tile) ?? 0) + 1);
  return counts;
}

export function removeTiles(hand: Tile[], tiles: Tile[]): boolean {
  const remaining = [...hand];
  for (const tile of tiles) {
    const index = remaining.indexOf(tile);
    if (index < 0) return false;
    remaining.splice(index, 1);
  }
  hand.splice(0, hand.length, ...remaining);
  return true;
}

export function isValidTile(tile: Tile): boolean {
  return Number.isInteger(tile) && tile >= 0 && tile < TILE_TYPE_COUNT;
}
