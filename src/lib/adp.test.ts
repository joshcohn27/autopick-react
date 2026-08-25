import { describe, it, expect } from 'vitest';
import { lookupAdp, computeAdpBoard } from './adp';
import { ADP_DATA } from '../data/adp-data';

// The floor K/DST are placed at, per adp-data.ts's own header comment:
// (12-1) * team_count + 1, currently 155 for a 14-team league.
const K_DST_FLOOR = 155;

describe('lookupAdp', () => {
  it('finds a real player case-insensitively', () => {
    const result = lookupAdp('jahmyr gibbs');
    expect(result.source).toBe('ranked');
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
    // Deliberately NOT a hardcoded number -- ADP_DATA's size is expected to
    // change over time, so this compares against the dataset's own live
    // size rather than a snapshot count that would need editing every time
    // the file changes.
    expect(board.length).toBe(Object.keys(ADP_DATA).length);
  });

  it('places every K and DST entry at or beyond the round-12-or-later floor', () => {
    const board = computeAdpBoard(new Set());
    const kickers = board.filter(e => e.position === 'K');
    const dsts = board.filter(e => e.position === 'DST');
    expect(kickers.length).toBeGreaterThan(0);
    expect(dsts.length).toBeGreaterThan(0);
    [...kickers, ...dsts].forEach(e => {
      expect(e.adp).toBeGreaterThanOrEqual(K_DST_FLOOR);
    });
  });

  it('carries nflTeam through to the board for a real player', () => {
    const board = computeAdpBoard(new Set());
    const gibbs = board.find(e => e.player === 'Jahmyr Gibbs');
    expect(gibbs).toBeDefined();
    expect(gibbs).toEqual({ player: 'Jahmyr Gibbs', position: 'RB', nflTeam: 'DET', adp: 1.2 });
  });
});

describe('ADP_DATA integrity', () => {
  it('gives every entry a position that is one of the six recognized codes', () => {
    const validPositions = new Set(['QB', 'RB', 'WR', 'TE', 'K', 'DST']);
    Object.entries(ADP_DATA).forEach(([player, entry]) => {
      expect(validPositions.has(entry.position), `${player} has an unrecognized position: ${entry.position}`).toBe(true);
    });
  });

  it('has no free-agent entries (nflTeam: "FA") -- per the file\'s own documented rule', () => {
    Object.entries(ADP_DATA).forEach(([player, entry]) => {
      expect(entry.nflTeam, `${player} has nflTeam: 'FA'`).not.toBe('FA');
    });
  });

  it('caps QB at exactly the 32 real Week 1 starters', () => {
    const qbCount = Object.values(ADP_DATA).filter(e => e.position === 'QB').length;
    expect(qbCount).toBe(32);
  });
});
