import { describe, it, expect } from 'vitest';
import { CONFIG } from '../config';
import {
  parseDraftCell, parseRankingCell, colLetterToIndex,
  parseDraftGrid, parseTeamNames, snakeOrderForRound, analyzeGrid, computeOpenSlots, parseTradeNotes,
  computeSuggestion, narrowBenchPositions, countRemainingPicks, resolveOnClockTeam,
  parseMarkerGrid, findMarkerConflicts
} from './draft';
import type { Pick, RankingsByPosition } from '../types';

describe('parseTeamNames', () => {
  it('reads team names live from the header row at the configured columns', () => {
    const header = ['Round', ...CONFIG.TEAMS];
    expect(parseTeamNames(header)).toEqual(CONFIG.TEAMS);
  });

  it('reflects a rename in the sheet without any code change', () => {
    const header = ['Round', ...CONFIG.TEAMS];
    const idx = CONFIG.TEAMS.indexOf('Eli P');
    header[idx + 1] = 'Eli Pincus';
    const names = parseTeamNames(header);
    expect(names[idx]).toBe('Eli Pincus');
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

  it('parses every real 2026 defense cell (no ", TEAM" part) as a DST', () => {
    const cells: [string, string, string][] = [
      ['Houston Texans -DST', 'Houston Texans', 'HOU'],
      ['Denver Broncos -DST', 'Denver Broncos', 'DEN'],
      ['Los Angeles Rams -DST', 'Los Angeles Rams', 'LAR'],
      ['Seattle Seahawks -DST', 'Seattle Seahawks', 'SEA'],
      ['New England Patriots -DST', 'New England Patriots', 'NE'],
      ['Pittsburgh Steelers -DST', 'Pittsburgh Steelers', 'PIT'],
      ['Philadelphia Eagles -DST', 'Philadelphia Eagles', 'PHI'],
      ['Minnesota Vikings -DST', 'Minnesota Vikings', 'MIN'],
      ['Baltimore Ravens -DST', 'Baltimore Ravens', 'BAL'],
      ['Jacksonville Jaguars -DST', 'Jacksonville Jaguars', 'JAX'],
      ['Los Angeles Chargers -DST', 'Los Angeles Chargers', 'LAC'],
      ['Kansas City Chiefs -DST', 'Kansas City Chiefs', 'KC'],
      ['Green Bay Packers -DST', 'Green Bay Packers', 'GB'],
      ['Detroit Lions -DST', 'Detroit Lions', 'DET']
    ];
    for (const [raw, player, nflTeam] of cells) {
      expect(parseDraftCell(raw)).toEqual({ player, nflTeam, position: 'DST', raw });
    }
  });

  it('reads loose defense labels the same way', () => {
    const variants = [
      'Houston Texans - D/ST', 'Houston Texans -d/st', 'Houston Texans -D-ST', 'Houston Texans -D.S.T.',
      'Houston Texans DST', 'Houston Texans (DST)', 'Houston Texans -DEF', 'Houston Texans Defense',
      'Texans D/ST', 'HOU DST', 'Houston Texans, HOU -D/ST', 'Houston Texans, HOU -DEF'
    ];
    for (const raw of variants) {
      const cell = parseDraftCell(raw);
      expect(cell?.position, raw).toBe('DST');
      expect(cell?.player, raw).toBe('Houston Texans');
    }
  });

  it('still parses real 2026 kicker cells, including no space after the comma', () => {
    expect(parseDraftCell('Brandon Aubrey,DAL -K')).toEqual({
      player: 'Brandon Aubrey', nflTeam: 'DAL', position: 'K', raw: 'Brandon Aubrey,DAL -K'
    });
  });

  it('reads a defense behind a trade marker', () => {
    const teams = ['Brad K', 'Guppy'];
    const cell = parseDraftCell('GUPPY: Houston Texans -DST', teams);
    expect(cell).toMatchObject({ player: 'Houston Texans', position: 'DST', tradeMarkerTeamIndex: 1 });
  });

  it('a drafted defense fills that team\'s DST slot', () => {
    const cell = parseDraftCell('Houston Texans -DST');
    if (!cell) {
      throw new Error('expected a cell');
    }
    const openSlots = computeOpenSlots([{ round: 13, teamIndex: 0, pickNumber: 1, cell }]);
    expect(openSlots.some(s => s.name === 'DST')).toBe(false);
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

  it('treats a marker-only cell as a pick not made yet, with or without the trailing space', () => {
    const teamNames = ['Josh C', 'Guppy', 'Brad K'];
    expect(parseDraftCell('BRAD K: ', teamNames)).toBeNull();
    expect(parseDraftCell('GUPPY:', teamNames)).toBeNull();
    expect(parseDraftCell('brad k', teamNames)).toBeNull();
  });

  it('reads a marker plus DST', () => {
    const teamNames = ['Josh C', 'Guppy', 'Brad K'];
    expect(parseDraftCell('BRAD K: Houston Texans -DST', teamNames)).toEqual({
      player: 'Houston Texans', nflTeam: 'HOU', position: 'DST',
      raw: 'BRAD K: Houston Texans -DST', tradeMarkerTeamIndex: 2
    });
  });

  it('reads the real 2026 marker cells', () => {
    const teams2026 = ['Leo L', 'JP', 'Josh C', 'Natalie P', 'Eli P', 'Colby L', 'Steven K', 'Noah K', 'Eli C', 'Brad K', 'Saul M', 'Guppy', 'Ben N', 'Mitchell H'];
    expect(parseDraftCell('GUPPY: Davante Adams, LAR -WR', teams2026)).toEqual({
      player: 'Davante Adams', nflTeam: 'LAR', position: 'WR',
      raw: 'GUPPY: Davante Adams, LAR -WR', tradeMarkerTeamIndex: 11
    });
    expect(parseDraftCell('BRAD K: Brian Robinson Jr.,ATL -RB', teams2026)).toEqual({
      player: 'Brian Robinson Jr.', nflTeam: 'ATL', position: 'RB',
      raw: 'BRAD K: Brian Robinson Jr.,ATL -RB', tradeMarkerTeamIndex: 9
    });
  });

  it('counts the punishment cell as a used pick for its own column', () => {
    const teamNames = ['Mitchell H', 'Guppy'];
    expect(parseDraftCell('NO PICK - Punishment ', teamNames)).toEqual({
      player: 'NO PICK - Punishment', nflTeam: null, position: 'UNKNOWN', raw: 'NO PICK - Punishment'
    });
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

  it('keeps team attribution for a marker followed by something that is not a player', () => {
    const teamNames = ['Josh C', 'Guppy', 'Brad K'];
    const result = parseDraftCell('GUPPY: Odell', teamNames);
    expect(result?.tradeMarkerTeamIndex).toBe(1);
    expect(result?.position).toBe('UNKNOWN');
    expect(result?.player).toBe('GUPPY: Odell');
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
    values[3][bradIdx + 1] = 'GUPPY: Davante Adams, LAR -WR';
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

  // None of these three pre-existing tests are about the round-based
  // guardrail itself -- round 16 makes maxAllowedGap(16) return null, so
  // the guardrail is inert and behavior matches exactly what these tests
  // originally asserted, pre-guardrail.
  const INERT_ROUND = 16;
  const INERT_PICK = 999;

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

    const suggestion = computeSuggestion(0, [], rankings, INERT_ROUND, INERT_PICK);
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

    const suggestion = computeSuggestion(0, teamPicks, rankings, INERT_ROUND, INERT_PICK);
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
    const suggestion = computeSuggestion(0, [], rankings, INERT_ROUND, INERT_PICK);
    expect(suggestion.kind).toBe('ok');
    if (suggestion.kind === 'ok') {
      // The unranked player must not beat a real, well-ranked player.
      expect(suggestion.primary.player).toBe('Jahmyr Gibbs');
    }
  });
});

describe('computeSuggestion — round-based anti-reach guardrail', () => {
  // Single open dedicated slot: TE only (QB/RB/RB/WR/WR/DST/K all filled --
  // FLEX and BENCH stay open too but are lower priority, so they don't
  // enter targetSlots). Mirrors the existing "skips ADP entirely" fixture.
  function teamPicksWithOnlyTeOpen(): Pick[] {
    return (['QB', 'RB', 'RB', 'WR', 'WR', 'DST', 'K'] as const).map((pos, i) => ({
      round: i + 1, teamIndex: 0, pickNumber: i + 1,
      cell: { player: `${pos} Guy ${i}`, nflTeam: null, position: pos, raw: '' }
    }));
  }

  // Single open dedicated slot: WR only (one of its two WR slots still
  // filled, the other left open; QB/RB/RB/TE/DST/K all filled).
  function teamPicksWithOnlyOneWrOpen(): Pick[] {
    return (['QB', 'RB', 'RB', 'WR', 'TE', 'DST', 'K'] as const).map((pos, i) => ({
      round: i + 1, teamIndex: 0, pickNumber: i + 1,
      cell: { player: `${pos} Guy ${i}`, nflTeam: null, position: pos, raw: '' }
    }));
  }

  it('round 2 (cap 10), single eligible position: skips a non-compliant rank-1 reach for a compliant real player at rank 2', () => {
    const rankings: RankingsByPosition = {
      TE: [
        { rank: 1, position: 'TE', player: 'Fake Reach Guy', nflTeam: 'AAA' },
        { rank: 2, position: 'TE', player: 'Trey McBride', nflTeam: 'ARI' } // real, adp 21.1
      ]
    };
    // Pick 15: fake player's gap (999 - 15 = 984) blows past the round
    // 1-4 cap of 10. McBride's gap (21.1 - 15 = 6.1) is well within it.
    const suggestion = computeSuggestion(0, teamPicksWithOnlyTeOpen(), rankings, 2, 15);
    expect(suggestion.kind).toBe('ok');
    if (suggestion.kind === 'ok') {
      expect(suggestion.multiPosition).toBe(false);
      expect(suggestion.primary.player).toBe('Trey McBride');
      // A compliant candidate WAS found, just not the top-ranked one.
      expect(suggestion.reachFlagged).toBeFalsy();
    }
  });

  it('round 12 (no cap), same fake-player-at-rank-1 setup: suggests the reach anyway, old behavior', () => {
    const rankings: RankingsByPosition = {
      TE: [
        { rank: 1, position: 'TE', player: 'Fake Reach Guy', nflTeam: 'AAA' },
        { rank: 2, position: 'TE', player: 'Trey McBride', nflTeam: 'ARI' }
      ]
    };
    const suggestion = computeSuggestion(0, teamPicksWithOnlyTeOpen(), rankings, 12, 15);
    expect(suggestion.kind).toBe('ok');
    if (suggestion.kind === 'ok') {
      expect(suggestion.primary.player).toBe('Fake Reach Guy');
      expect(suggestion.reachFlagged).toBeFalsy();
    }
  });

  it('round 1, every eligible position has only fake/unranked players: falls back to the original choice and flags it', () => {
    const rankings: RankingsByPosition = {
      QB: [{ rank: 1, position: 'QB', player: 'Fake QB Guy', nflTeam: 'AAA' }],
      RB: [{ rank: 1, position: 'RB', player: 'Fake RB Guy', nflTeam: 'AAA' }]
    };
    // Empty roster in round 1 -- every dedicated position is eligible
    // (multi-position). Neither fake player is in ADP_DATA, so both fall
    // back to the unranked value (999), whose gap to pick 1 is far beyond
    // round 1-4's cap of 10 -- nobody anywhere is compliant.
    const suggestion = computeSuggestion(0, [], rankings, 1, 1);
    expect(suggestion.kind).toBe('ok');
    if (suggestion.kind === 'ok') {
      expect(suggestion.multiPosition).toBe(true);
      expect(suggestion.reachFlagged).toBe(true);
      // Which of the tied (both ADP 999) fake players wins is an incidental
      // implementation detail (stable-sort tie order), not something this
      // guardrail promises -- just confirm a valid pick still came back.
      expect(['Fake QB Guy', 'Fake RB Guy']).toContain(suggestion.primary.player);
    }
  });

  it('round 6 uses the round 5-10 cap of 20, not 10 or unlimited: a gap of 15 passes', () => {
    const rankings: RankingsByPosition = {
      WR: [
        { rank: 1, position: 'WR', player: 'Fake Reach Guy', nflTeam: 'AAA' },
        { rank: 2, position: 'WR', player: 'DeVonta Smith', nflTeam: 'PHI' } // real, adp 39.0
      ]
    };
    // Pick 24: Smith's gap is 39.0 - 24 = 15, under the round 5-10 cap of 20.
    const suggestion = computeSuggestion(0, teamPicksWithOnlyOneWrOpen(), rankings, 6, 24);
    expect(suggestion.kind).toBe('ok');
    if (suggestion.kind === 'ok') {
      expect(suggestion.primary.player).toBe('DeVonta Smith');
      expect(suggestion.reachFlagged).toBeFalsy();
    }
  });

  it('round 6 uses the round 5-10 cap of 20, not 10 or unlimited: a gap of 25 fails, falls back and flags', () => {
    const rankings: RankingsByPosition = {
      WR: [
        { rank: 1, position: 'WR', player: 'Fake Reach Guy', nflTeam: 'AAA' },
        { rank: 2, position: 'WR', player: 'DeVonta Smith', nflTeam: 'PHI' }
      ]
    };
    // Pick 14: Smith's gap is 39.0 - 14 = 25, over the round 5-10 cap of 20
    // -- neither entry in the list is compliant.
    const suggestion = computeSuggestion(0, teamPicksWithOnlyOneWrOpen(), rankings, 6, 14);
    expect(suggestion.kind).toBe('ok');
    if (suggestion.kind === 'ok') {
      expect(suggestion.primary.player).toBe('Fake Reach Guy');
      expect(suggestion.reachFlagged).toBe(true);
    }
  });
});

describe('computeSuggestion — bench composition targets', () => {
  // QB/RB/RB/WR/WR/TE/DST/K fills every dedicated slot; the 9th pick (RB)
  // has nowhere dedicated left to go, so it flows into FLEX -- leaving
  // every priority-1/2 slot filled and all 7 bench slots open, zero bench
  // picks yet.
  function fillAllStartersAndFlex(): Pick[] {
    return (['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'DST', 'K', 'RB'] as const).map((pos, i) => ({
      round: i + 1, teamIndex: 0, pickNumber: i + 1,
      cell: { player: `${pos} Starter ${i}`, nflTeam: null, position: pos, raw: '' }
    }));
  }

  function benchPick(pos: 'QB' | 'RB' | 'WR' | 'TE', round: number, name: string): Pick {
    return { round, teamIndex: 0, pickNumber: round, cell: { player: name, nflTeam: null, position: pos, raw: '' } };
  }

  it('never suggests a bench K or DST, even when one would otherwise be the best available by ADP', () => {
    const teamPicks = fillAllStartersAndFlex();
    const rankings: RankingsByPosition = {
      K: [{ rank: 1, position: 'K', player: 'Amazing Kicker', nflTeam: 'AAA' }],
      DST: [{ rank: 1, position: 'DST', player: 'Amazing Defense', nflTeam: 'AAA' }],
      RB: [{ rank: 1, position: 'RB', player: 'Some Bench RB', nflTeam: 'AAA' }]
    };
    const suggestion = computeSuggestion(0, teamPicks, rankings, 16, 999);
    expect(suggestion.kind).toBe('ok');
    if (suggestion.kind === 'ok') {
      expect(suggestion.primary.position).not.toBe('K');
      expect(suggestion.primary.position).not.toBe('DST');
      expect(suggestion.primary.player).toBe('Some Bench RB');
      // K/DST must not even show up as a backup or other-position option --
      // they're structurally excluded from bench eligibility entirely, not
      // just outranked.
      const allShown = [suggestion.primary, ...suggestion.primary.backups, ...suggestion.others];
      expect(allShown.every(c => c.position !== 'K' && c.position !== 'DST')).toBe(true);
    }
  });

  it('excludes RB from a further bench suggestion once the team already has 3 bench RBs (at max)', () => {
    const teamPicks = [
      ...fillAllStartersAndFlex(),
      benchPick('RB', 10, 'Bench RB 1'),
      benchPick('RB', 11, 'Bench RB 2'),
      benchPick('RB', 12, 'Bench RB 3') // 3rd bench RB -- at BENCH_TARGETS.RB.max
    ];
    const rankings: RankingsByPosition = {
      RB: [{ rank: 1, position: 'RB', player: 'Jahmyr Gibbs', nflTeam: 'DET' }], // real, low ADP -- would win if allowed
      WR: [{ rank: 1, position: 'WR', player: 'Some Bench WR', nflTeam: 'AAA' }]
    };
    const suggestion = computeSuggestion(0, teamPicks, rankings, 16, 999);
    expect(suggestion.kind).toBe('ok');
    if (suggestion.kind === 'ok') {
      expect(suggestion.primary.position).not.toBe('RB');
      expect(suggestion.primary.player).toBe('Some Bench WR');
    }
  });

  it('reports zero remaining bench slots once all 7 are filled at target composition, regardless of the split', () => {
    const teamPicks = [
      ...fillAllStartersAndFlex(), // 9
      benchPick('RB', 10, 'Bench RB 1'), benchPick('RB', 11, 'Bench RB 2'), benchPick('RB', 12, 'Bench RB 3'),
      benchPick('WR', 13, 'Bench WR 1'), benchPick('WR', 14, 'Bench WR 2'),
      benchPick('TE', 15, 'Bench TE 1'),
      benchPick('QB', 16, 'Bench QB 1')
      // 3 RB + 2 WR + 1 TE + 1 QB = 7 bench, + 9 starters/flex = 16 total.
    ];
    const openSlots = computeOpenSlots(teamPicks);
    expect(openSlots.filter(s => s.name === 'BENCH').length).toBe(0);
    expect(openSlots.length).toBe(0);

    // Confirmed naturally handled, not forced: computeSuggestion's own
    // openSlots.length === 0 check returns rosterFull before bench
    // composition logic is ever consulted.
    const suggestion = computeSuggestion(0, teamPicks, {}, 16, 999);
    expect(suggestion.kind).toBe('rosterFull');
  });

  it('falls back to the unrestricted position set if every position were somehow already at its max (defensive; not reachable via real 7-slot bench data)', () => {
    // Hand-crafted counts a real 7-slot bench could never actually produce
    // (the four maxes sum to 8) -- tests the defensive fallback directly
    // rather than fighting the data model to reach an impossible state.
    const allAtMax: Record<string, number> = { QB: 5, RB: 5, WR: 5, TE: 5 };
    expect(narrowBenchPositions(['QB', 'RB', 'WR', 'TE'], allAtMax)).toEqual(['QB', 'RB', 'WR', 'TE']);
  });
});

describe('computeSuggestion — late-round K/DST and bench rules', () => {
  type Pos = 'QB' | 'RB' | 'WR' | 'TE' | 'K' | 'DST';

  function picksFor(positions: Pos[]): Pick[] {
    return positions.map((pos, i) => ({
      round: i + 1, teamIndex: 0, pickNumber: i + 1,
      cell: { player: `${pos} Guy ${i}`, nflTeam: null, position: pos, raw: '' }
    }));
  }

  // every starter + FLEX filled, K/DST and all 7 bench slots open
  const STARTERS: Pos[] = ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'RB'];
  // every starter, FLEX and bench slot filled -- only K/DST open
  const ALL_BUT_K_DST: Pos[] = [...STARTERS, 'RB', 'RB', 'WR', 'WR', 'WR', 'TE', 'QB'];

  function entry(player: string, position: Pos) {
    return { rank: 1, position, player, nflTeam: 'AAA' };
  }

  // real adp: Aubrey 155.0, Texans 155.4, Purdy 112.0, Ferguson 104.6, Gibbs 1.2.
  // "Fake ..." names aren't in the adp data, so they sit at 999.
  const KD: RankingsByPosition = {
    K: [entry('Brandon Aubrey', 'K')],
    DST: [entry('Houston Texans', 'DST')]
  };

  const RULES = CONFIG.LATE_ROUND_RULES;

  it('holds K/DST back before the DST allowed round when they are the only open slots', () => {
    const suggestion = computeSuggestion(0, picksFor(ALL_BUT_K_DST), KD, RULES.DST_ALLOWED_ROUND - 1, 999, 5);
    expect(suggestion.kind).toBe('kickerDefenseHeldBack');
    if (suggestion.kind === 'kickerDefenseHeldBack') {
      expect(suggestion.minRound).toBe(RULES.DST_ALLOWED_ROUND);
    }
  });

  it('suggests the DST, not the K, once the DST is allowed and the team has no DST yet', () => {
    const suggestion = computeSuggestion(0, picksFor(ALL_BUT_K_DST), KD, RULES.K_RECOMMENDED_ROUND, 999, 5);
    expect(suggestion.kind).toBe('ok');
    if (suggestion.kind === 'ok') {
      expect(suggestion.primary.position).toBe('DST');
      expect(suggestion.others.every(c => c.position !== 'K')).toBe(true);
      expect(suggestion.forcedByDeadline).toBeFalsy();
    }
  });

  it('ranks an allowed-but-not-recommended DST below bench players, but still lists it', () => {
    const rankings = { ...KD, RB: [entry('Fake Bench RB', 'RB')] };
    const suggestion = computeSuggestion(0, picksFor(STARTERS), rankings, RULES.DST_ALLOWED_ROUND, 999, 9);
    expect(suggestion.kind).toBe('ok');
    if (suggestion.kind === 'ok') {
      expect(suggestion.primary.player).toBe('Fake Bench RB');
      expect(suggestion.others.map(c => c.position)).toContain('DST');
    }
  });

  it('prefers the DST over any bench player from the DST recommended round', () => {
    const rankings = { ...KD, RB: [entry('Jahmyr Gibbs', 'RB')] };
    const suggestion = computeSuggestion(0, picksFor(STARTERS), rankings, RULES.DST_RECOMMENDED_ROUND, 999, 9);
    expect(suggestion.kind).toBe('ok');
    if (suggestion.kind === 'ok') {
      expect(suggestion.primary.position).toBe('DST');
      expect(suggestion.primary.slotName).toBe('DST');
    }
  });

  it('keeps the K out until the team has its DST', () => {
    const rankings = { ...KD, RB: [entry('Fake Bench RB', 'RB')] };
    const suggestion = computeSuggestion(0, picksFor(STARTERS), rankings, RULES.K_RECOMMENDED_ROUND, 999, 9);
    expect(suggestion.kind).toBe('ok');
    if (suggestion.kind === 'ok') {
      const shown = [suggestion.primary, ...suggestion.others];
      expect(shown.every(c => c.position !== 'K')).toBe(true);
    }
  });

  it('ranks the K below bench players before its recommended round, then prefers it', () => {
    const withDst = picksFor([...STARTERS, 'DST']);
    const rankings = { ...KD, RB: [entry('Fake Bench RB', 'RB')] };

    const early = computeSuggestion(0, withDst, rankings, RULES.K_ALLOWED_ROUND, 999, 8);
    expect(early.kind).toBe('ok');
    if (early.kind === 'ok') {
      expect(early.primary.player).toBe('Fake Bench RB');
      expect(early.others.map(c => c.position)).toContain('K');
    }

    const recommended = computeSuggestion(0, withDst, rankings, RULES.K_RECOMMENDED_ROUND, 999, 8);
    expect(recommended.kind).toBe('ok');
    if (recommended.kind === 'ok') {
      expect(recommended.primary.position).toBe('K');
    }
  });

  it('never lets K/DST jump ahead of an open starter, even late', () => {
    const noTe = picksFor(['QB', 'RB', 'RB', 'WR', 'WR', 'RB']);
    const rankings = { ...KD, TE: [entry('Fake Starting TE', 'TE')] };
    const suggestion = computeSuggestion(0, noTe, rankings, RULES.K_RECOMMENDED_ROUND, 999, 6);
    expect(suggestion.kind).toBe('ok');
    if (suggestion.kind === 'ok') {
      expect(suggestion.primary.slotName).toBe('TE');
      expect(suggestion.others).toEqual([]);
    }
  });

  it('forces DST then K once remaining picks equal the open K/DST slots, even early', () => {
    const rankings = { ...KD, RB: [entry('Jahmyr Gibbs', 'RB')] };
    const suggestion = computeSuggestion(0, picksFor(STARTERS), rankings, 5, 999, 2);
    expect(suggestion.kind).toBe('ok');
    if (suggestion.kind === 'ok') {
      expect(suggestion.forcedByDeadline).toBe(true);
      expect(suggestion.primary.position).toBe('DST');
      expect(suggestion.others.map(c => c.position)).toEqual(['K']);
    }
  });

  it('forces the K on the last pick once the DST is filled', () => {
    const suggestion = computeSuggestion(0, picksFor([...STARTERS, 'DST']), KD, 16, 999, 1);
    expect(suggestion.kind).toBe('ok');
    if (suggestion.kind === 'ok') {
      expect(suggestion.forcedByDeadline).toBe(true);
      expect(suggestion.primary.position).toBe('K');
    }
  });

  it('falls back to one pick per round when remaining picks are not passed', () => {
    // 14 picks made, K/DST open: 2 left for 2 slots, so the deadline kicks in
    const suggestion = computeSuggestion(0, picksFor(ALL_BUT_K_DST), KD, 15, 999);
    expect(suggestion.kind).toBe('ok');
    if (suggestion.kind === 'ok') {
      expect(suggestion.forcedByDeadline).toBe(true);
    }
  });

  it('ranks a backup QB lower before the backup QB round, but still suggests one if nothing else is there', () => {
    const withQb = { QB: [entry('Brock Purdy', 'QB')], RB: [entry('Fake Bench RB', 'RB')] };
    const early = computeSuggestion(0, picksFor(STARTERS), withQb, RULES.BACKUP_QB_ROUND - 1, 999, 9);
    expect(early.kind).toBe('ok');
    if (early.kind === 'ok') {
      expect(early.primary.player).toBe('Fake Bench RB');
    }

    const onTime = computeSuggestion(0, picksFor(STARTERS), withQb, RULES.BACKUP_QB_ROUND, 999, 9);
    expect(onTime.kind).toBe('ok');
    if (onTime.kind === 'ok') {
      expect(onTime.primary.player).toBe('Brock Purdy');
    }

    const onlyQb = computeSuggestion(0, picksFor(STARTERS), { QB: [entry('Brock Purdy', 'QB')] }, RULES.BACKUP_QB_ROUND - 1, 999, 9);
    expect(onlyQb.kind).toBe('ok');
    if (onlyQb.kind === 'ok') {
      expect(onlyQb.primary.player).toBe('Brock Purdy');
    }
  });

  it('ranks a backup TE lower before the backup TE round', () => {
    const withTe = { TE: [entry('Jake Ferguson', 'TE')], WR: [entry('Fake Bench WR', 'WR')] };
    const early = computeSuggestion(0, picksFor(STARTERS), withTe, RULES.BACKUP_TE_ROUND - 1, 999, 9);
    expect(early.kind).toBe('ok');
    if (early.kind === 'ok') {
      expect(early.primary.player).toBe('Fake Bench WR');
    }

    const onTime = computeSuggestion(0, picksFor(STARTERS), withTe, RULES.BACKUP_TE_ROUND, 999, 9);
    expect(onTime.kind).toBe('ok');
    if (onTime.kind === 'ok') {
      expect(onTime.primary.player).toBe('Jake Ferguson');
    }
  });

  it('leans RB/WR over QB/TE in the upside round', () => {
    const rankings = {
      QB: [entry('Brock Purdy', 'QB')],
      TE: [entry('Jake Ferguson', 'TE')],
      WR: [entry('Fake Upside WR', 'WR')]
    };
    const withKd = picksFor([...STARTERS, 'DST', 'K']);
    const suggestion = computeSuggestion(0, withKd, rankings, RULES.UPSIDE_ROUND, 999, 1);
    expect(suggestion.kind).toBe('ok');
    if (suggestion.kind === 'ok') {
      expect(suggestion.primary.player).toBe('Fake Upside WR');
    }
  });

  it('round 1, empty roster: K/DST are excluded from the cross-position comparison entirely', () => {
    const rankings = { ...KD, RB: [entry('Some RB', 'RB')] };
    const suggestion = computeSuggestion(0, [], rankings, 1, 1);
    expect(suggestion.kind).toBe('ok');
    if (suggestion.kind === 'ok') {
      const allShown = [suggestion.primary, ...suggestion.primary.backups, ...suggestion.others];
      expect(allShown.every(c => c.position !== 'K' && c.position !== 'DST')).toBe(true);
    }
  });

  it('round 5, only FLEX/K/DST open: suggests FLEX instead of stalling on held-back K/DST', () => {
    const rankings = { ...KD, RB: [entry('Flex RB', 'RB')] };
    const suggestion = computeSuggestion(0, picksFor(['QB', 'RB', 'RB', 'WR', 'WR', 'TE']), rankings, 5, 50);
    expect(suggestion.kind).toBe('ok');
    if (suggestion.kind === 'ok') {
      expect(suggestion.primary.player).toBe('Flex RB');
      expect(suggestion.primary.slotName).toBe('FLEX');
    }
  });

  it('round 5, only bench/K/DST open: suggests a bench pick instead of stalling on held-back K/DST', () => {
    const rankings = { ...KD, WR: [entry('Bench WR', 'WR')] };
    const suggestion = computeSuggestion(0, picksFor(STARTERS), rankings, 5, 70);
    expect(suggestion.kind).toBe('ok');
    if (suggestion.kind === 'ok') {
      expect(suggestion.primary.player).toBe('Bench WR');
      expect(suggestion.primary.slotName).toBe('BENCH');
    }
  });
});

describe('countRemainingPicks', () => {
  it('counts only owned picks whose cell is still blank', () => {
    const filled = { player: 'Someone', nflTeam: null, position: 'RB' as const, raw: 'x' };
    const grid = [
      [filled, null],
      [null, null],
      [null, filled]
    ];
    // owns round 1 and 2 of column 0, plus round 3 of column 1 (already used)
    const owned = [{ round: 1, teamIndex: 0 }, { round: 2, teamIndex: 0 }, { round: 3, teamIndex: 1 }];
    expect(countRemainingPicks(grid, owned)).toBe(1);
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

describe('who is on the clock with pick ownership', () => {
  // column 2 owns the slot on the clock, but the trades tab says team 5 has it now
  const onClock = { round: 3, teamIndex: 2, pickNumber: 31 };
  const tradedToFive = (round: number, col: number) => {
    if (round === 3 && col === 2) {
      return 5;
    }
    return col;
  };

  it('puts the current owner of a traded pick on the clock, via the original team', () => {
    expect(resolveOnClockTeam(onClock, null, tradedToFive)).toEqual({ teamIndex: 5, viaTeamIndex: 2 });
  });

  it('leaves an untraded pick with its own team and no via note', () => {
    expect(resolveOnClockTeam({ ...onClock, round: 4 }, null, tradedToFive)).toEqual({ teamIndex: 2, viaTeamIndex: null });
  });

  it('lets the manual override beat the ownership data', () => {
    expect(resolveOnClockTeam(onClock, 7, tradedToFive)).toEqual({ teamIndex: 7, viaTeamIndex: null });
  });

  it('falls back to the column team when the trades tab did not load', () => {
    expect(resolveOnClockTeam(onClock, null, undefined)).toEqual({ teamIndex: 2, viaTeamIndex: null });
  });

  it('builds the suggestion from the new owner: filled traded slots count toward their roster', () => {
    const values: unknown[][] = [];
    values[0] = ['Round', ...CONFIG.TEAMS];
    for (let r = 1; r <= 16; r++) {
      values[r] = ['Round' + r, ...CONFIG.TEAMS.map(() => '')];
    }
    // round 1, column 0 holds a QB, but that pick belongs to team 3 now
    values[1][1] = 'Josh Allen, BUF -QB';
    const grid = parseDraftGrid(values, CONFIG.TEAMS);
    const ownerOf = (round: number, col: number) => {
      if (round === 1 && col === 0) {
        return 3;
      }
      return col;
    };

    const { picks } = analyzeGrid(grid, ownerOf);
    expect(picks[0].teamIndex).toBe(3);

    const withoutOwnership = analyzeGrid(grid);
    expect(withoutOwnership.picks[0].teamIndex).toBe(0);
  });

  it('uses the trades tab over a marker typed in the cell, and flags the cell', () => {
    const values: unknown[][] = [];
    values[0] = ['Round', ...CONFIG.TEAMS];
    for (let r = 1; r <= 16; r++) {
      values[r] = ['Round' + r, ...CONFIG.TEAMS.map(() => '')];
    }
    // round 1, column B says team 6 owns it, the trades tab says team 3
    values[1][1] = `${CONFIG.TEAMS[6].toUpperCase()}: Josh Allen, BUF -QB`;
    // round 2, column C is marker-only and agrees with the trades tab
    values[2][2] = `${CONFIG.TEAMS[3].toUpperCase()}: `;
    const ownerOf = (round: number, col: number) => {
      if (round === 1 && col === 0) {
        return 3;
      }
      if (round === 2 && col === 1) {
        return 3;
      }
      return col;
    };

    const grid = parseDraftGrid(values, CONFIG.TEAMS);
    const { picks, onClock } = analyzeGrid(grid, ownerOf);
    expect(picks[0].teamIndex).toBe(3);

    // without the trades tab, the cell's own marker decides
    expect(analyzeGrid(grid).picks[0].teamIndex).toBe(6);

    // the marker-only cell is still an open pick
    expect(picks).toHaveLength(1);
    expect(onClock?.round).toBe(1);

    const conflicts = findMarkerConflicts(parseMarkerGrid(values, CONFIG.TEAMS), ownerOf);
    expect(conflicts).toEqual([
      { address: 'B3', round: 1, columnTeamIndex: 0, markerTeamIndex: 6, ownerTeamIndex: 3 }
    ]);
  });

  it('counts a marker-only cell as a pick still to make', () => {
    const values: unknown[][] = [];
    values[0] = ['Round', ...CONFIG.TEAMS];
    for (let r = 1; r <= 16; r++) {
      values[r] = ['Round' + r, ...CONFIG.TEAMS.map(() => '')];
    }
    values[3][1] = `${CONFIG.TEAMS[7].toUpperCase()}: `;
    const grid = parseDraftGrid(values, CONFIG.TEAMS);
    expect(grid[2][0]).toBeNull();
    expect(countRemainingPicks(grid, [{ round: 3, teamIndex: 0 }])).toBe(1);
  });
});
