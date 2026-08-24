import { describe, it, expect } from 'vitest';
import { CONFIG } from '../config';
import {
  parseDraftCell, parseRankingCell, colLetterToIndex,
  parseDraftGrid, snakeOrderForRound, analyzeGrid, computeOpenSlots, parseTradeNotes
} from './draft';
import type { Pick } from '../types';

describe('parseDraftCell', () => {
  it('parses a standard player cell', () => {
    expect(parseDraftCell('Saquon Barkley, PHI -RB')).toEqual({
      player: 'Saquon Barkley', nflTeam: 'PHI', position: 'RB', raw: 'Saquon Barkley, PHI -RB'
    });
  });

  it('parses a D/ST cell', () => {
    expect(parseDraftCell('Pittsburgh Steelers, PIT -DST')).toEqual({
      player: 'Pittsburgh Steelers', nflTeam: 'PIT', position: 'DST', raw: 'Pittsburgh Steelers, PIT -DST'
    });
  });

  it('returns null for an empty cell', () => {
    expect(parseDraftCell('')).toBeNull();
    expect(parseDraftCell(undefined)).toBeNull();
  });

  it('falls back to UNKNOWN for freeform notes (trade markers etc)', () => {
    const result = parseDraftCell('COHN: Tyrone');
    expect(result?.position).toBe('UNKNOWN');
    expect(result?.player).toBe('COHN: Tyrone');
  });
});

describe('parseRankingCell', () => {
  it('parses a ranking entry (no position suffix)', () => {
    expect(parseRankingCell('Josh Allen, BUF')).toEqual({ player: 'Josh Allen', nflTeam: 'BUF' });
  });
});

describe('colLetterToIndex', () => {
  it('converts letters to zero-based indices', () => {
    expect(colLetterToIndex('A')).toBe(0);
    expect(colLetterToIndex('P')).toBe(15);
  });
});

describe('snakeOrderForRound', () => {
  it('round 1 goes forward, round 2 reverses', () => {
    const forward = CONFIG.TEAMS.map((_, i) => i);
    expect(snakeOrderForRound(0)).toEqual(forward);
    expect(snakeOrderForRound(1)).toEqual([...forward].reverse());
  });
});

function cell(name: string, team: string, pos: string) {
  return `${name}, ${team} -${pos}`;
}

describe('analyzeGrid', () => {
  it('detects the correct team on the clock through a partial snake round', () => {
    const values: unknown[][] = [];
    values[0] = ['Round', ...CONFIG.TEAMS];

    const round1: unknown[] = ['Round1'];
    CONFIG.TEAMS.forEach((_, i) => round1.push(cell(`Player R1T${i}`, 'XX', i % 2 === 0 ? 'RB' : 'WR')));
    values[1] = round1;

    const round2: unknown[] = ['Round2', ...CONFIG.TEAMS.map(() => '')];
    const reverseOrder = CONFIG.TEAMS.map((_, i) => i).reverse();
    reverseOrder.slice(0, 5).forEach(teamIdx => {
      round2[teamIdx + 1] = cell(`Player R2T${teamIdx}`, 'XX', 'QB');
    });
    values[2] = round2;

    for (let r = 3; r <= 16; r++) values[r] = ['Round' + r];

    const grid = parseDraftGrid(values);
    const { picks, onClock } = analyzeGrid(grid);

    expect(picks.length).toBe(14 + 5);
    expect(onClock).not.toBeNull();
    expect(onClock!.teamIndex).toBe(reverseOrder[5]);
    expect(onClock!.round).toBe(2);
  });

  it('still finds a pick sitting in a later round even while an earlier team/round is blank (keepers)', () => {
    // This mirrors what the real sheet looks like mid-draft: keepers land
    // wherever their round is, not necessarily round 1, so round 1 can have
    // gaps before round 7 has an entry for a totally different team.
    const values: unknown[][] = [];
    values[0] = ['Round', ...CONFIG.TEAMS];
    for (let r = 1; r <= 16; r++) values[r] = ['Round' + r, ...CONFIG.TEAMS.map(() => '')];

    // Team at column index 10 (11th team) gets a round-1 keeper; team at
    // column index 0 (first team) is still blank in round 1.
    values[1][11] = cell('Keeper Guy', 'XX', 'WR');
    // A totally different team has an entry way out in round 7.
    values[7][3] = cell('Round Seven Guy', 'XX', 'WR');

    const grid = parseDraftGrid(values);
    const { picks, onClock } = analyzeGrid(grid);

    expect(picks.length).toBe(2);
    expect(picks.map(p => p.cell.player)).toEqual(expect.arrayContaining(['Keeper Guy', 'Round Seven Guy']));
    // First team is still on the clock for round 1, despite the later picks existing.
    expect(onClock).not.toBeNull();
    expect(onClock!.round).toBe(1);
    expect(onClock!.teamIndex).toBe(0);
  });
});

describe('computeOpenSlots', () => {
  it('fills dedicated slots before flex/bench, leaves the right ones open', () => {
    const fakePicks: Pick[] = [
      { round: 1, teamIndex: 0, pickNumber: 1, cell: { player: 'QB Guy', nflTeam: null, position: 'QB', raw: '' } },
      { round: 2, teamIndex: 0, pickNumber: 2, cell: { player: 'RB Guy 1', nflTeam: null, position: 'RB', raw: '' } },
      { round: 3, teamIndex: 0, pickNumber: 3, cell: { player: 'RB Guy 2', nflTeam: null, position: 'RB', raw: '' } },
      { round: 4, teamIndex: 0, pickNumber: 4, cell: { player: 'WR Guy 1', nflTeam: null, position: 'WR', raw: '' } },
      { round: 5, teamIndex: 0, pickNumber: 5, cell: { player: 'TE Guy', nflTeam: null, position: 'TE', raw: '' } },
      { round: 6, teamIndex: 0, pickNumber: 6, cell: { player: 'DST Guy', nflTeam: null, position: 'DST', raw: '' } },
      { round: 7, teamIndex: 0, pickNumber: 7, cell: { player: 'K Guy', nflTeam: null, position: 'K', raw: '' } }
    ];

    const openSlots = computeOpenSlots(fakePicks);
    expect(openSlots.filter(s => s.name === 'WR').length).toBe(1);
    expect(openSlots.filter(s => s.name === 'FLEX').length).toBe(1);
    expect(openSlots.filter(s => s.name === 'BENCH').length).toBe(7);
    expect(openSlots.length).toBe(9);
  });
});

describe('parseTradeNotes', () => {
  it('drops the section header and blank rows, keeps the actual notes', () => {
    const values = [
      ['Traded Draft Picks'],
      ["Brad trades 3rd rnd pick to Guppy"],
      [''],
      ["Guppy trades 10th rnd pick to Brad"],
      [undefined]
    ];
    expect(parseTradeNotes(values)).toEqual([
      "Brad trades 3rd rnd pick to Guppy",
      "Guppy trades 10th rnd pick to Brad"
    ]);
  });

  it('returns an empty list when there are no trades', () => {
    expect(parseTradeNotes([['Traded Draft Picks'], [''], ['']])).toEqual([]);
  });
});
