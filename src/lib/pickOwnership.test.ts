import { describe, expect, it } from 'vitest';
import {
  buildPickOwnership, currentPickOwner, formatOwnedPick, formatTradedAwayPick,
  ordinal, parseTradeRows, pickOwnerLookup, tradeTabName, tradeTabYears
} from './pickOwnership';
import type { PickTrade, TeamPickOwnership } from './pickOwnership';

const TEAMS = ['Guppy', 'Brad K', 'Alex W', 'Cohn'];
const ROUNDS = 3;
const HEADER = ['Type', 'Round', 'Original Team', 'New Owner', 'Notes'];

// rows are one "<year> Trades" tab
function ownership(rows: unknown[][], year = 2027) {
  const { trades, warnings } = parseTradeRows([HEADER, ...rows], TEAMS, ROUNDS, year);
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
    expect(teams.map(t => t.team)).toEqual(['Alex W', 'Brad K', 'Cohn', 'Guppy']);
    for (const team of teams) {
      expect(team.owned.map(formatOwnedPick)).toEqual(['1st rounder', '2nd rounder', '3rd rounder']);
      expect(team.tradedAway).toEqual([]);
    }
  });

  it('handles a completely empty sheet (no header row either)', () => {
    const { trades, warnings } = parseTradeRows([], TEAMS, ROUNDS, 2027);
    expect(trades).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it('applies a single trade', () => {
    const { teams } = ownership([['Trade', 3, 'Guppy', 'Brad K', '']]);
    expect(ownedLabels(teams, 'Brad K')).toEqual([
      '1st rounder', '2nd rounder', '3rd rounder', '3rd rounder (via Guppy)'
    ]);
    expect(ownedLabels(teams, 'Guppy')).toEqual(['1st rounder', '2nd rounder']);
    expect(tradedAwayLabels(teams, 'Guppy')).toEqual(['3rd rounder (to Brad K)']);
  });

  it('applies a multi-pick trade and keeps notes', () => {
    const { teams } = ownership([
      ['Trade', '1', 'Alex W', 'Cohn', 'top 3 protected'],
      ['Trade', '2', 'Cohn', 'Alex W', ''],
      ['Trade', '3', 'Cohn', 'Alex W', '']
    ]);
    const cohn = card(teams, 'Cohn');
    expect(cohn.owned.map(formatOwnedPick)).toEqual(['1st rounder', '1st rounder (via Alex W)']);
    expect(cohn.owned[1].notes).toBe('top 3 protected');
    expect(tradedAwayLabels(teams, 'Cohn')).toEqual(['2nd rounder (to Alex W)', '3rd rounder (to Alex W)']);
    expect(ownedLabels(teams, 'Alex W')).toEqual([
      '2nd rounder', '2nd rounder (via Cohn)', '3rd rounder', '3rd rounder (via Cohn)'
    ]);
  });

  it('lets the lowest row win when a pick is traded twice', () => {
    const { teams } = ownership([
      ['Trade', 1, 'Guppy', 'Brad K', 'first deal'],
      ['Trade', 1, 'Guppy', 'Alex W', 'flipped']
    ]);
    expect(ownedLabels(teams, 'Brad K')).toEqual(['1st rounder', '2nd rounder', '3rd rounder']);
    const alex = card(teams, 'Alex W');
    expect(alex.owned.map(formatOwnedPick)[1]).toBe('1st rounder (via Guppy)');
    expect(alex.owned[1].notes).toBe('flipped');
    expect(tradedAwayLabels(teams, 'Guppy')).toEqual(['1st rounder (to Alex W)']);
  });

  it('treats a pick traded back to its original team as an own pick', () => {
    const { teams } = ownership([
      ['Trade', 2, 'Brad K', 'Guppy', ''],
      ['Trade', 2, 'Brad K', 'Brad K', '']
    ]);
    expect(ownedLabels(teams, 'Brad K')).toEqual(['1st rounder', '2nd rounder', '3rd rounder']);
    expect(tradedAwayLabels(teams, 'Brad K')).toEqual([]);
    expect(ownedLabels(teams, 'Guppy')).toEqual(['1st rounder', '2nd rounder', '3rd rounder']);
  });

  it('still returns a card for a team that traded every pick away', () => {
    const { teams } = ownership([
      ['Trade', 1, 'Cohn', 'Guppy', ''],
      ['Trade', 2, 'Cohn', 'Brad K', ''],
      ['Trade', 3, 'Cohn', 'Guppy', '']
    ]);
    const cohn = card(teams, 'Cohn');
    expect(cohn.owned).toEqual([]);
    expect(tradedAwayLabels(teams, 'Cohn')).toEqual([
      '1st rounder (to Guppy)', '2nd rounder (to Brad K)', '3rd rounder (to Guppy)'
    ]);
  });

  it('takes a punished pick away from its team and gives it to nobody', () => {
    const { teams, trades } = ownership([['Punishment', 2, 'Cohn', '', 'late payment']]);
    expect(trades[0]).toMatchObject({ type: 'punishment', newOwner: null, notes: 'late payment' });
    expect(ownedLabels(teams, 'Cohn')).toEqual(['1st rounder', '3rd rounder']);
    expect(tradedAwayLabels(teams, 'Cohn')).toEqual(['2nd rounder (punishment)']);
    for (const other of ['Alex W', 'Brad K', 'Guppy']) {
      expect(ownedLabels(teams, other)).toHaveLength(3);
    }
  });

  it('ignores the new owner column on a punishment row, and a later trade row can still undo it', () => {
    const punished = ownership([['punishment', 1, 'Guppy', 'Brad K', '']]);
    expect(ownedLabels(punished.teams, 'Brad K')).toHaveLength(3);
    expect(ownedLabels(punished.teams, 'Guppy')).toHaveLength(2);

    const restored = ownership([
      ['Punishment', 1, 'Guppy', '', ''],
      ['Trade', 1, 'Guppy', 'Guppy', 'reinstated']
    ]);
    expect(ownedLabels(restored.teams, 'Guppy')).toHaveLength(3);
  });

  it('keeps each tab to its own year', () => {
    const current = parseTradeRows([HEADER], TEAMS, ROUNDS, 2027);
    const future = parseTradeRows([HEADER, ['Trade', 1, 'Guppy', 'Cohn', '']], TEAMS, ROUNDS, 2028);
    const trades: PickTrade[] = [...current.trades, ...future.trades];
    expect(future.trades[0].year).toBe(2028);

    const thisYear = buildPickOwnership(TEAMS, ROUNDS, 2027, trades);
    expect(ownedLabels(thisYear, 'Cohn')).toEqual(['1st rounder', '2nd rounder', '3rd rounder']);

    const nextYear = buildPickOwnership(TEAMS, ROUNDS, 2028, trades);
    expect(ownedLabels(nextYear, 'Cohn')).toEqual([
      '1st rounder', '1st rounder (via Guppy)', '2nd rounder', '3rd rounder'
    ]);
  });

  it('skips a typo team name with a warning', () => {
    const { teams, warnings } = ownership([
      ['Trade', 1, 'Gupy', 'Brad K', ''],
      ['Trade', 2, 'Guppy', 'Brad', '']
    ]);
    expect(warnings.map(w => w.rowNumber)).toEqual([2, 3]);
    expect(warnings[0].reason).toContain('unknown original team "Gupy"');
    expect(warnings[1].reason).toContain('unknown new owner "Brad"');
    expect(warnings[0].year).toBe(2027);
    expect(ownedLabels(teams, 'Brad K')).toEqual(['1st rounder', '2nd rounder', '3rd rounder']);
  });

  it('skips bad round and type values with a warning', () => {
    const { trades, warnings } = ownership([
      ['Trade', 0, 'Guppy', 'Brad K', ''],
      ['Trade', 4, 'Guppy', 'Brad K', ''],
      ['Trade', '1st', 'Guppy', 'Brad K', ''],
      ['Trade', 1.5, 'Guppy', 'Brad K', ''],
      ['Trade', '', 'Guppy', 'Brad K', ''],
      ['2027', 1, 'Guppy', 'Brad K', ''],
      ['Swap', 1, 'Guppy', 'Brad K', '']
    ]);
    expect(trades).toEqual([]);
    expect(warnings.map(w => w.rowNumber)).toEqual([2, 3, 4, 5, 6, 7, 8]);
    expect(warnings[0].reason).toContain('bad round "0"');
    expect(warnings[5].reason).toContain('bad type "2027"');
    expect(warnings[6].reason).toContain('bad type "Swap"');
  });

  it('matches types and team names regardless of case and extra spaces, and skips blank rows', () => {
    const { teams, warnings, trades } = ownership([
      [],
      ['', '', '', '', ''],
      ['  tRaDe ', ' 2 ', '  guPPY  ', 'BRAD   k', '  pick swap  ']
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
      ['Trade', 1, 'Cohn', 'Guppy', ''],
      ['Trade', 1, 'Alex W', 'Guppy', ''],
      ['Trade', 1, 'Brad K', 'Guppy', '']
    ]);
    expect(ownedLabels(teams, 'Guppy').slice(0, 4)).toEqual([
      '1st rounder',
      '1st rounder (via Alex W)',
      '1st rounder (via Brad K)',
      '1st rounder (via Cohn)'
    ]);
  });
});

describe('trade tab years', () => {
  it('lists the draft year plus later "<year> Trades" tabs only', () => {
    const titles = ['2027 Draft', '2027 Trades', '2026 Trades', '2029 Trades', ' 2028 trades ', 'Trades', 'Background Stuff'];
    expect(tradeTabYears(titles, 2027)).toEqual([2027, 2028, 2029]);
  });

  it('still lists the draft year when its tab does not exist yet', () => {
    expect(tradeTabYears(['2027 Draft'], 2027)).toEqual([2027]);
  });

  it('names a year\'s tab', () => {
    expect(tradeTabName(2028)).toBe('2028 Trades');
  });
});

describe('current pick owner', () => {
  const rows = [
    ['Trade', 3, 'Guppy', 'Brad K', ''],
    ['Trade', 3, 'Guppy', 'Alex W', 'flipped'],
    ['Punishment', 2, 'Cohn', '', '']
  ];

  it('uses the lowest matching row and defaults to the original team', () => {
    const { trades } = parseTradeRows([HEADER, ...rows], TEAMS, ROUNDS, 2027);
    expect(currentPickOwner(trades, 2027, 3, 'Guppy')).toBe('Alex W');
    expect(currentPickOwner(trades, 2027, 1, 'Cohn')).toBe('Cohn');
    expect(currentPickOwner(trades, 2027, 2, 'Brad K')).toBe('Brad K');
    expect(currentPickOwner(trades, 2028, 3, 'Guppy')).toBe('Guppy');
  });

  it('says nobody owns a punished pick', () => {
    const { trades } = parseTradeRows([HEADER, ...rows], TEAMS, ROUNDS, 2027);
    expect(currentPickOwner(trades, 2027, 2, 'Cohn')).toBeNull();
  });

  it('maps column indexes to owner indexes for the draft board, null for a punishment', () => {
    const { trades } = parseTradeRows([HEADER, ...rows], TEAMS, ROUNDS, 2027);
    const ownerOf = pickOwnerLookup(TEAMS, 2027, trades);
    expect(ownerOf(3, TEAMS.indexOf('Guppy'))).toBe(TEAMS.indexOf('Alex W'));
    expect(ownerOf(1, TEAMS.indexOf('Guppy'))).toBe(TEAMS.indexOf('Guppy'));
    expect(ownerOf(2, TEAMS.indexOf('Cohn'))).toBeNull();
  });
});
