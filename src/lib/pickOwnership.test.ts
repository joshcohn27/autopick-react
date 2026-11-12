import { describe, expect, it } from 'vitest';
import {
  availableYears, buildPickOwnership, formatOwnedPick, formatTradedAwayPick,
  ordinal, parseTradeRows
} from './pickOwnership';
import type { TeamPickOwnership } from './pickOwnership';

const TEAMS = ['Guppy', 'Brad K', 'Alex W', 'Josh C'];
const ROUNDS = 3;
const HEADER = ['Year', 'Round', 'Original Team', 'New Owner', 'Notes'];

function ownership(rows: unknown[][], year = 2027) {
  const { trades, warnings } = parseTradeRows([HEADER, ...rows], TEAMS, ROUNDS);
  const teams = buildPickOwnership(TEAMS, ROUNDS, year, trades);
  return { trades, warnings, teams };
}

function card(teams: TeamPickOwnership[], name: string): TeamPickOwnership {
  const found = teams.find(t => t.team === name);
  if (!found) {
    throw new Error(`no card for ${name}`);
  }
  return found;
}

function ownedLabels(teams: TeamPickOwnership[], name: string): string[] {
  return card(teams, name).owned.map(formatOwnedPick);
}

function tradedAwayLabels(teams: TeamPickOwnership[], name: string): string[] {
  return card(teams, name).tradedAway.map(formatTradedAwayPick);
}

describe('ordinal', () => {
  it('handles the usual suffixes and the teens', () => {
    const inputs = [1, 2, 3, 4, 10, 11, 12, 13, 14, 21, 22, 23, 101, 111, 112];
    const expected = ['1st', '2nd', '3rd', '4th', '10th', '11th', '12th', '13th', '14th', '21st', '22nd', '23rd', '101st', '111th', '112th'];
    expect(inputs.map(ordinal)).toEqual(expected);
  });
});

describe('pick ownership', () => {
  it('gives every team its own picks when there are no trades', () => {
    const { teams, warnings } = ownership([]);
    expect(warnings).toEqual([]);
    expect(teams.map(t => t.team)).toEqual(['Alex W', 'Brad K', 'Guppy', 'Josh C']);
    for (const team of teams) {
      expect(team.owned.map(formatOwnedPick)).toEqual(['1st rounder', '2nd rounder', '3rd rounder']);
      expect(team.tradedAway).toEqual([]);
    }
  });

  it('handles a completely empty sheet (no header row either)', () => {
    const { trades, warnings } = parseTradeRows([], TEAMS, ROUNDS);
    expect(trades).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it('applies a single trade', () => {
    const { teams } = ownership([[2027, 3, 'Guppy', 'Brad K', '']]);
    expect(ownedLabels(teams, 'Brad K')).toEqual([
      '1st rounder', '2nd rounder', '3rd rounder', '3rd rounder (via Guppy)'
    ]);
    expect(ownedLabels(teams, 'Guppy')).toEqual(['1st rounder', '2nd rounder']);
    expect(tradedAwayLabels(teams, 'Guppy')).toEqual(['3rd rounder (to Brad K)']);
  });

  it('applies a multi-pick trade and keeps notes', () => {
    const { teams } = ownership([
      ['2027', '1', 'Alex W', 'Josh C', 'top 3 protected'],
      ['2027', '2', 'Josh C', 'Alex W', ''],
      ['2027', '3', 'Josh C', 'Alex W', '']
    ]);
    const josh = card(teams, 'Josh C');
    expect(josh.owned.map(formatOwnedPick)).toEqual(['1st rounder', '1st rounder (via Alex W)']);
    expect(josh.owned[1].notes).toBe('top 3 protected');
    expect(tradedAwayLabels(teams, 'Josh C')).toEqual(['2nd rounder (to Alex W)', '3rd rounder (to Alex W)']);
    expect(ownedLabels(teams, 'Alex W')).toEqual([
      '2nd rounder', '2nd rounder (via Josh C)', '3rd rounder', '3rd rounder (via Josh C)'
    ]);
  });

  it('lets the lowest row win when a pick is traded twice', () => {
    const { teams } = ownership([
      [2027, 1, 'Guppy', 'Brad K', 'first deal'],
      [2027, 1, 'Guppy', 'Alex W', 'flipped']
    ]);
    expect(ownedLabels(teams, 'Brad K')).toEqual(['1st rounder', '2nd rounder', '3rd rounder']);
    const alex = card(teams, 'Alex W');
    expect(alex.owned.map(formatOwnedPick)[1]).toBe('1st rounder (via Guppy)');
    expect(alex.owned[1].notes).toBe('flipped');
    expect(tradedAwayLabels(teams, 'Guppy')).toEqual(['1st rounder (to Alex W)']);
  });

  it('treats a pick traded back to its original team as an own pick', () => {
    const { teams } = ownership([
      [2027, 2, 'Brad K', 'Guppy', ''],
      [2027, 2, 'Brad K', 'Brad K', '']
    ]);
    expect(ownedLabels(teams, 'Brad K')).toEqual(['1st rounder', '2nd rounder', '3rd rounder']);
    expect(tradedAwayLabels(teams, 'Brad K')).toEqual([]);
    expect(ownedLabels(teams, 'Guppy')).toEqual(['1st rounder', '2nd rounder', '3rd rounder']);
  });

  it('still returns a card for a team that traded every pick away', () => {
    const { teams } = ownership([
      [2027, 1, 'Josh C', 'Guppy', ''],
      [2027, 2, 'Josh C', 'Brad K', ''],
      [2027, 3, 'Josh C', 'Guppy', '']
    ]);
    const josh = card(teams, 'Josh C');
    expect(josh.owned).toEqual([]);
    expect(tradedAwayLabels(teams, 'Josh C')).toEqual([
      '1st rounder (to Guppy)', '2nd rounder (to Brad K)', '3rd rounder (to Guppy)'
    ]);
  });

  it('keeps future-year trades out of the current year and lists the year', () => {
    const rows = [[2028, 1, 'Guppy', 'Josh C', '']];
    const current = ownership(rows, 2027);
    expect(ownedLabels(current.teams, 'Josh C')).toEqual(['1st rounder', '2nd rounder', '3rd rounder']);

    const future = ownership(rows, 2028);
    expect(ownedLabels(future.teams, 'Josh C')).toEqual([
      '1st rounder', '1st rounder (via Guppy)', '2nd rounder', '3rd rounder'
    ]);

    expect(availableYears(current.trades, 2027)).toEqual([2027, 2028]);
  });

  it('only lists the default year and later ones', () => {
    const { trades } = ownership([
      [2026, 1, 'Guppy', 'Josh C', ''],
      [2029, 1, 'Guppy', 'Josh C', ''],
      [2028, 1, 'Guppy', 'Josh C', '']
    ]);
    expect(availableYears(trades, 2027)).toEqual([2027, 2028, 2029]);
  });

  it('skips a typo team name with a warning', () => {
    const { teams, warnings } = ownership([
      [2027, 1, 'Gupy', 'Brad K', ''],
      [2027, 2, 'Guppy', 'Brad', '']
    ]);
    expect(warnings.map(w => w.rowNumber)).toEqual([2, 3]);
    expect(warnings[0].reason).toContain('unknown original team "Gupy"');
    expect(warnings[1].reason).toContain('unknown new owner "Brad"');
    expect(ownedLabels(teams, 'Brad K')).toEqual(['1st rounder', '2nd rounder', '3rd rounder']);
  });

  it('skips bad round and year values with a warning', () => {
    const { trades, warnings } = ownership([
      [2027, 0, 'Guppy', 'Brad K', ''],
      [2027, 4, 'Guppy', 'Brad K', ''],
      [2027, '1st', 'Guppy', 'Brad K', ''],
      [2027, 1.5, 'Guppy', 'Brad K', ''],
      [2027, '', 'Guppy', 'Brad K', ''],
      ['next year', 1, 'Guppy', 'Brad K', '']
    ]);
    expect(trades).toEqual([]);
    expect(warnings.map(w => w.rowNumber)).toEqual([2, 3, 4, 5, 6, 7]);
    expect(warnings[0].reason).toContain('bad round "0"');
    expect(warnings[5].reason).toContain('bad year "next year"');
  });

  it('matches team names regardless of case and extra spaces, and skips blank rows', () => {
    const { teams, warnings, trades } = ownership([
      [],
      ['', '', '', '', ''],
      ['  2027 ', ' 2 ', '  guPPY  ', 'BRAD   k', '  pick swap  ']
    ]);
    expect(warnings).toEqual([]);
    expect(trades).toHaveLength(1);
    expect(trades[0].rowNumber).toBe(4);
    const brad = card(teams, 'Brad K');
    expect(brad.owned.map(formatOwnedPick)).toContain('2nd rounder (via Guppy)');
    expect(brad.owned.find(p => !p.isOwn)?.notes).toBe('pick swap');
  });

  it('sorts acquired picks in the same round by original team', () => {
    const { teams } = ownership([
      [2027, 1, 'Josh C', 'Guppy', ''],
      [2027, 1, 'Alex W', 'Guppy', ''],
      [2027, 1, 'Brad K', 'Guppy', '']
    ]);
    expect(ownedLabels(teams, 'Guppy').slice(0, 4)).toEqual([
      '1st rounder',
      '1st rounder (via Alex W)',
      '1st rounder (via Brad K)',
      '1st rounder (via Josh C)'
    ]);
  });
});
