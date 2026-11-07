import { countTiles, isHonorTile, isNumberTile, tileRank, tileSuit } from './tile';
import { Meld, RuleOptions, Tile } from './types';

export interface HuResult {
  isHu: boolean;
  pattern?: 'STANDARD' | 'QIDUI';
}

function canFormMelds(counts: number[], start: number): boolean {
  let tile = start;
  while (tile < counts.length && counts[tile] === 0) tile += 1;
  if (tile === counts.length) return true;
  if (counts[tile] >= 3) {
    counts[tile] -= 3;
    if (canFormMelds(counts, tile)) return true;
    counts[tile] += 3;
  }
  if (
    isNumberTile(tile) &&
    tileRank(tile) <= 7 &&
    tileSuit(tile) === tileSuit(tile + 2) &&
    counts[tile + 1] > 0 &&
    counts[tile + 2] > 0
  ) {
    counts[tile] -= 1;
    counts[tile + 1] -= 1;
    counts[tile + 2] -= 1;
    if (canFormMelds(counts, tile)) return true;
    counts[tile] += 1;
    counts[tile + 1] += 1;
    counts[tile + 2] += 1;
  }
  return false;
}

export function isStandardHu(hand: Tile[], melds: Meld[]): boolean {
  const requiredMelds = 4 - melds.length;
  if (hand.length !== requiredMelds * 3 + 2) return false;
  const counts = Array<number>(27).fill(0);
  for (const tile of hand) counts[tile] += 1;
  for (let pair = 0; pair < counts.length; pair += 1) {
    if (counts[pair] < 2) continue;
    counts[pair] -= 2;
    if (canFormMelds(counts, 0)) return true;
    counts[pair] += 2;
  }
  return false;
}

export function isSevenPairs(hand: Tile[], melds: Meld[]): boolean {
  if (melds.length !== 0 || hand.length !== 14) return false;
  const counts = countTiles(hand);
  return counts.size === 7 && [...counts.values()].every((count) => count === 2);
}

export function canHu(
  hand: Tile[],
  melds: Meld[],
  rules: RuleOptions,
): HuResult {
  if (isStandardHu(hand, melds)) return { isHu: true, pattern: 'STANDARD' };
  if (rules.enableQidui && isSevenPairs(hand, melds)) {
    return { isHu: true, pattern: 'QIDUI' };
  }
  return { isHu: false };
}

export function getWaitingTiles(
  hand: Tile[],
  melds: Meld[],
  rules: RuleOptions,
): Tile[] {
  const waiting: Tile[] = [];
  const counts = countTiles(hand);
  for (let tile = 0; tile < 27; tile += 1) {
    if ((counts.get(tile) ?? 0) >= 4) continue;
    if (canHu([...hand, tile], melds, rules).isHu) waiting.push(tile);
  }
  return waiting;
}

export function canChi(hand: Tile[], tile: Tile, selected: Tile[]): boolean {
  if (!isNumberTile(tile) || selected.length !== 2) return false;
  const candidate = [...selected, tile].sort((left, right) => left - right);
  return (
    candidate[1] === candidate[0] + 1 &&
    candidate[2] === candidate[1] + 1 &&
    tileSuit(candidate[0]) === tileSuit(candidate[2]) &&
    hand.includes(selected[0]) &&
    hand.includes(selected[1])
  );
}

export function canUseSameTiles(hand: Tile[], tile: Tile, count: number): boolean {
  return hand.filter((item) => item === tile).length >= count;
}

export function isHonor(tile: Tile): boolean {
  return isHonorTile(tile);
}
