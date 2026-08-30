import { describe, it, expect } from 'vitest';
import { CONFIG } from '../config';
import {
  parseDraftCell, parseRankingCell, colLetterToIndex,
  parseDraftGrid, parseTeamNames, snakeOrderForRound, analyzeGrid, computeOpenSlots, parseTradeNotes,
  computeSuggestion, narrowBenchPositions
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

describe('computeSuggestion — K/DST held back until round 14', () => {
  // Every dedicated slot but K and DST is already filled, so the only
  // priority-1 slots left open are K and DST themselves.
  function teamPicksWithOnlyKAndDstOpen(): Pick[] {
    return (['QB', 'RB', 'RB', 'WR', 'WR', 'TE'] as const).map((pos, i) => ({
      round: i + 1, teamIndex: 0, pickNumber: i + 1,
      cell: { player: `${pos} Guy ${i}`, nflTeam: null, position: pos, raw: '' }
    }));
  }

  it('round 13, K/DST are the only open slots: refuses to suggest either, even as a reach fallback', () => {
    const rankings: RankingsByPosition = {
      K: [{ rank: 1, position: 'K', player: 'Amazing Kicker', nflTeam: 'AAA' }],
      DST: [{ rank: 1, position: 'DST', player: 'Amazing Defense', nflTeam: 'AAA' }]
    };
    const suggestion = computeSuggestion(0, teamPicksWithOnlyKAndDstOpen(), rankings, 13, 999);
    // No non-K/DST position is eligible for these slots and K/DST are held
    // back this early -- nothing compliant to suggest.
    expect(suggestion.kind).toBe('noCandidates');
  });

  it('round 14, same setup: K/DST become eligible again', () => {
    const rankings: RankingsByPosition = {
      K: [{ rank: 1, position: 'K', player: 'Amazing Kicker', nflTeam: 'AAA' }],
      DST: [{ rank: 1, position: 'DST', player: 'Amazing Defense', nflTeam: 'AAA' }]
    };
    const suggestion = computeSuggestion(0, teamPicksWithOnlyKAndDstOpen(), rankings, 14, 999);
    expect(suggestion.kind).toBe('ok');
    if (suggestion.kind === 'ok') {
      expect(['K', 'DST']).toContain(suggestion.primary.position);
    }
  });

  it('round 1, empty roster: K/DST are excluded from the cross-position comparison entirely, even though real ADP would favor them', () => {
    const rankings: RankingsByPosition = {
      RB: [{ rank: 1, position: 'RB', player: 'Some RB', nflTeam: 'AAA' }],
      K: [{ rank: 1, position: 'K', player: 'Amazing Kicker', nflTeam: 'AAA' }],
      DST: [{ rank: 1, position: 'DST', player: 'Amazing Defense', nflTeam: 'AAA' }]
    };
    const suggestion = computeSuggestion(0, [], rankings, 1, 1);
    expect(suggestion.kind).toBe('ok');
    if (suggestion.kind === 'ok') {
      const allShown = [suggestion.primary, ...suggestion.primary.backups, ...suggestion.others];
      expect(allShown.every(c => c.position !== 'K' && c.position !== 'DST')).toBe(true);
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
