import { describe, it, expect } from 'vitest';
import { CONFIG } from '../config';
import {
  parseDraftCell, parseRankingCell, colLetterToIndex,
  parseDraftGrid, parseTeamNames, snakeOrderForRound, analyzeGrid, computeOpenSlots, parseTradeNotes,
  computeSuggestion
} from './draft';
import type { Pick, RankingsByPosition } from '../types';

describe('parseTeamNames', () => {
  it('reads team names live from the header row at the configured columns', () => {
    const header = ['Round', ...CONFIG.TEAMS];
    expect(parseTeamNames(header)).toEqual(CONFIG.TEAMS);
  });

  it('reflects a rename in the sheet without any code change', () => {
    const header = ['Round', ...CONFIG.TEAMS];
    const idx = CONFIG.TEAMS.indexOf('Team 16');
    header[idx + 1] = 'Eli P';
    const names = parseTeamNames(header);
    expect(names[idx]).toBe('Eli P');
  });

  it('falls back to a generic placeholder for a blank header cell instead of crashing', () => {
    const header = ['Round', ...CONFIG.TEAMS];
    header[1] = '';
    const names = parseTeamNames(header);
    expect(names[0]).toBe('Team 1');
  });

  it('falls back to placeholders for every column when the header row is missing entirely', () => {
    const names = parseTeamNames(undefined);
    expect(names.length).toBe(CONFIG.TEAM_COLUMNS.length);
    expect(names[0]).toBe('Team 1');
  });
});

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

  it('falls back to UNKNOWN for freeform notes (unrecognized, no team list given)', () => {
    const result = parseDraftCell('COHN: Tyrone');
    expect(result?.position).toBe('UNKNOWN');
    expect(result?.player).toBe('COHN: Tyrone');
    expect(result?.tradeMarkerTeamIndex).toBeUndefined();
  });

  it('recognizes a trade marker matching a team name, case-insensitive, with a trailing colon', () => {
    const teamNames = ['Josh C', 'Guppy', 'Brad K'];
    const result = parseDraftCell('GUPPY:', teamNames);
    expect(result?.tradeMarkerTeamIndex).toBe(1);
    expect(result?.position).toBe('UNKNOWN');
  });

  it('recognizes a trade marker with no colon and mixed case', () => {
    const teamNames = ['Josh C', 'Guppy', 'Brad K'];
    const result = parseDraftCell('brad k', teamNames);
    expect(result?.tradeMarkerTeamIndex).toBe(2);
  });

  it('does not treat a real player cell as a trade marker even if a team list is passed', () => {
    const teamNames = ['Josh C', 'Guppy', 'Brad K'];
    const result = parseDraftCell('Saquon Barkley, PHI -RB', teamNames);
    expect(result?.tradeMarkerTeamIndex).toBeUndefined();
    expect(result?.position).toBe('RB');
  });

  it('does not match a nickname that is not an exact team-name spelling', () => {
    // "GUP" is not an exact match for "Guppy" -- this is the whole reason
    // the sheet convention requires exact spelling, just upper-cased.
    const teamNames = ['Josh C', 'Guppy', 'Brad K'];
    const result = parseDraftCell('GUP:', teamNames);
    expect(result?.tradeMarkerTeamIndex).toBeUndefined();
    expect(result?.position).toBe('UNKNOWN');
  });

  it('extracts the real player from a trade-marker prefix followed by a pick', () => {
    // The marker's whole point is that the pick sitting in this column
    // belongs to another team -- the "BRAD K: " prefix is bookkeeping, not
    // part of the player's name, and must not end up on the Rosters tab.
    const teamNames = ['Josh C', 'Guppy', 'Brad K'];
    const result = parseDraftCell('BRAD K: Ashton Jeanty, LV -RB', teamNames);
    expect(result).toEqual({
      player: 'Ashton Jeanty',
      nflTeam: 'LV',
      position: 'RB',
      raw: 'BRAD K: Ashton Jeanty, LV -RB',
      tradeMarkerTeamIndex: 2
    });
  });

  it('extracts a marked pick case-insensitively on the marker prefix', () => {
    const teamNames = ['Josh C', 'Guppy', 'Brad K'];
    const result = parseDraftCell("GUPPY: Ja'Marr Chase, CIN -WR", teamNames);
    expect(result).toEqual({
      player: "Ja'Marr Chase",
      nflTeam: 'CIN',
      position: 'WR',
      raw: "GUPPY: Ja'Marr Chase, CIN -WR",
      tradeMarkerTeamIndex: 1
    });
  });

  it('keeps team attribution for a bare marker prefix with nothing after it', () => {
    // Real historical data in the sheet: a trade marker entered before the
    // pick itself was known/entered. Must keep working.
    const teamNames = ['Josh C', 'Guppy', 'Brad K'];
    const result = parseDraftCell('GUPPY:', teamNames);
    expect(result?.tradeMarkerTeamIndex).toBe(1);
    expect(result?.position).toBe('UNKNOWN');
    expect(result?.player).toBe('GUPPY:');
  });

  it('falls through to the freeform-note fallback when the colon prefix is not a team name', () => {
    // Real historical data: "COHN" doesn't match any current team name, so
    // this is just a note, not a marker -- no team attribution, whole text
    // kept as-is.
    const teamNames = ['Josh C', 'Guppy', 'Brad K'];
    const result = parseDraftCell('COHN: Tyrone', teamNames);
    expect(result?.tradeMarkerTeamIndex).toBeUndefined();
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

    const grid = parseDraftGrid(values, parseTeamNames(values[0]));
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

    const grid = parseDraftGrid(values, parseTeamNames(values[0]));
    const { picks, onClock } = analyzeGrid(grid);

    expect(picks.length).toBe(2);
    expect(picks.map(p => p.cell.player)).toEqual(expect.arrayContaining(['Keeper Guy', 'Round Seven Guy']));
    // First team is still on the clock for round 1, despite the later picks existing.
    expect(onClock).not.toBeNull();
    expect(onClock!.round).toBe(1);
    expect(onClock!.teamIndex).toBe(0);
  });

  it('attributes a trade-marker pick to the marked team, not the column it sits in', () => {
    const values: unknown[][] = [];
    values[0] = ['Round', ...CONFIG.TEAMS];
    for (let r = 1; r <= 16; r++) values[r] = ['Round' + r, ...CONFIG.TEAMS.map(() => '')];

    // Find real indices for two teams from CONFIG so this stays correct if
    // TEAMS ever changes order.
    const bradIdx = CONFIG.TEAMS.indexOf('Brad K');
    const guppyIdx = CONFIG.TEAMS.indexOf('Guppy');

    // A pick sits in Brad's column (round 3) but is marked as Guppy's.
    values[3][bradIdx + 1] = 'GUPPY:';
    // A normal pick for Guppy himself, elsewhere.
    values[5][guppyIdx + 1] = cell('Guppys Real Pick', 'XX', 'WR');

    const grid = parseDraftGrid(values, parseTeamNames(values[0]));
    const { picks } = analyzeGrid(grid);

    const guppysPicks = picks.filter(p => p.teamIndex === guppyIdx);
    const bradsPicks = picks.filter(p => p.teamIndex === bradIdx);

    // Guppy gets credit for both — his own pick and the marker sitting in Brad's column.
    expect(guppysPicks.length).toBe(2);
    // Brad gets credit for neither of these two cells.
    expect(bradsPicks.length).toBe(0);
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

describe('computeSuggestion — ADP cross-position comparison', () => {
  function ranking(player: string, nflTeam: string, position: 'QB' | 'RB' | 'WR' | 'TE' | 'K' | 'DST') {
    return { rank: 1, position, player, nflTeam };
  }

  it('does NOT reach for a thin-list position on an empty roster (the pick-2 TE-reach bug)', () => {
    // Mirrors the real bug report: an empty roster's first pick was
    // comparing "percentile within your own list" across positions, and a
    // short TE list could out-rank an elite RB/WR by that broken math.
    // With real ADP driving the comparison, the actual highest-value player
    // (lowest/best ADP) must win regardless of how deep each position's
    // list is.
    const rankings: RankingsByPosition = {
      QB: [ranking('Some QB', 'AAA', 'QB'), { rank: 2, position: 'QB', player: 'QB Two', nflTeam: 'AAA' }],
      RB: [ranking('Jahmyr Gibbs', 'DET', 'RB')], // real ADP ~1.0, should win
      WR: [ranking('Some WR', 'AAA', 'WR')],
      TE: [
        ranking('Some Deep-List TE', 'AAA', 'TE'),
        { rank: 2, position: 'TE', player: 'TE Two', nflTeam: 'AAA' },
        { rank: 3, position: 'TE', player: 'TE Three', nflTeam: 'AAA' }
      ], // artificially short list used to break the old percentile math
      K: [ranking('Some K', 'AAA', 'K')],
      DST: [ranking('Some DST', 'AAA', 'DST')]
    };

    const suggestion = computeSuggestion(0, [], rankings);
    expect(suggestion.kind).toBe('ok');
    if (suggestion.kind === 'ok') {
      expect(suggestion.primary.player).toBe('Jahmyr Gibbs');
      expect(suggestion.multiPosition).toBe(true);
    }
  });

  it('skips ADP entirely when only one position is eligible', () => {
    // A team that already has QB/RB/RB/WR/WR/DST/K filled, needs only TE.
    const teamPicks: Pick[] = (['QB', 'RB', 'RB', 'WR', 'WR', 'DST', 'K'] as const).map((pos, i) => ({
      round: i + 1, teamIndex: 0, pickNumber: i + 1,
      cell: { player: `${pos} Guy ${i}`, nflTeam: null, position: pos, raw: '' }
    }));

    const rankings: RankingsByPosition = {
      TE: [ranking('Deep List TE', 'AAA', 'TE')] // would lose on ADP, but it's the only option
    };

    const suggestion = computeSuggestion(0, teamPicks, rankings);
    expect(suggestion.kind).toBe('ok');
    if (suggestion.kind === 'ok') {
      expect(suggestion.multiPosition).toBe(false);
      expect(suggestion.primary.player).toBe('Deep List TE');
    }
  });

  it('falls back gracefully for a player missing from the ADP table (never wins by default)', () => {
    const rankings: RankingsByPosition = {
      RB: [ranking('Jahmyr Gibbs', 'DET', 'RB')], // real, low ADP
      WR: [ranking('Totally Made Up Rookie Nobody Has Heard Of', 'AAA', 'WR')] // not in ADP table
    };
    const suggestion = computeSuggestion(0, [], rankings);
    expect(suggestion.kind).toBe('ok');
    if (suggestion.kind === 'ok') {
      // The unranked player must not beat a real, well-ranked player.
      expect(suggestion.primary.player).toBe('Jahmyr Gibbs');
    }
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
