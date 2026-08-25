import { describe, it, expect } from 'vitest';
import { lookupAdp, computeAdpBoard } from './adp';
import { ADP_DATA } from '../data/adp-data';

// The floor K/DST are placed at, per adp-data.ts's own header comment:
// (14-1) * team_count + 1, currently 183 for a 14-team league.
const K_DST_FLOOR = 183;

describe('lookupAdp', () => {
  it('finds a real player case-insensitively', () => {
    const result = lookupAdp('jahmyr gibbs');
    expect(result.source).toBe('blended');
    expect(result.adp).toBeLessThan(5);
  });

  it('falls back to a high, non-winning value for an unranked player', () => {
    const result = lookupAdp('Totally Made Up Player XYZ');
    expect(result.source).toBe('unranked');
    expect(result.adp).toBeGreaterThan(500);
  });
});

describe('computeAdpBoard', () => {
  it('returns the board sorted ascending by ADP, best first', () => {
    const board = computeAdpBoard(new Set(), 10);
    expect(board.length).toBe(10);
    for (let i = 1; i < board.length; i++) {
      expect(board[i].adp).toBeGreaterThanOrEqual(board[i - 1].adp);
    }
    expect(board[0].player).toBe('Jahmyr Gibbs');
  });

  it('filters out drafted players by name, case-insensitive', () => {
    const drafted = new Set(['jahmyr gibbs', 'bijan robinson']);
    const board = computeAdpBoard(drafted, 10);
    expect(board.find(e => e.player === 'Jahmyr Gibbs')).toBeUndefined();
    expect(board.find(e => e.player === 'Bijan Robinson')).toBeUndefined();
    expect(board[0].player).not.toBe('Jahmyr Gibbs');
  });

  it('respects an explicit limit', () => {
    expect(computeAdpBoard(new Set(), 5).length).toBe(5);
  });

  it('returns the full list, uncapped, when no limit is passed', () => {
    const board = computeAdpBoard(new Set());
    expect(board.length).toBe(Object.keys(ADP_DATA).length);
    // 784, not the original (buggy) 790 -- the six apostrophe-named players
    // that got corrupted into a truncated key AND a duplicate late-round
    // entry (e.g. "Ja'Marr Chase" -> "Marr Chase" plus a fake deep-bench
    // "Ja'Marr Chase") are fixed to one correct entry each: 790 - 6 = 784.
    expect(board.length).toBe(784);
  });

  it('places every K and DST entry at or beyond the round-14-or-later floor', () => {
    const board = computeAdpBoard(new Set());
    const kickers = board.filter(e => e.position === 'K');
    const dsts = board.filter(e => e.position === 'DST');
    expect(kickers.length).toBeGreaterThan(0);
    expect(dsts.length).toBeGreaterThan(0);
    [...kickers, ...dsts].forEach(e => {
      expect(e.adp).toBeGreaterThanOrEqual(K_DST_FLOOR);
    });
  });

  it('leaves the real-ADP block untouched by the sheet-sourced extension (Jahmyr Gibbs still exactly 1.0)', () => {
    expect(ADP_DATA['Jahmyr Gibbs'].blended).toBe(1.0);
    const board = computeAdpBoard(new Set());
    expect(board[0]).toEqual({ player: 'Jahmyr Gibbs', position: 'RB', adp: 1.0 });
  });
});
