import { CONFIG } from '../config';
import { lookupAdp } from './adp';
import type {
  DraftCell, Pick, OnClock, RankingEntry, RankingsByPosition,
  SlotInstance, Suggestion, SuggestionCandidate, Position, RosterSlotView
} from '../types';

// ---------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------

// "Saquon Barkley, PHI -RB" -> {player, nflTeam, position}
// "Pittsburgh Steelers, PIT -DST" also matches (team-name-as-player for D/ST)
//
// A cell can also be a TRADE MARKER instead of a player: the exact text of
// another team's row-1 name, in all caps (e.g. row 1 says "Guppy", the
// marker is "GUPPY", optionally with a trailing colon like "GUPPY:"). That
// means this pick — sitting in whichever column it's in — actually belongs
// to the marked team, not the column's own team. teamNames is CONFIG.TEAMS,
// passed in so this stays a pure function.
const PLAYER_CELL_PATTERN = /^(.*),\s*([A-Za-z]{2,4})\s*-\s*([A-Za-z]+)\s*$/;

export function parseDraftCell(raw: unknown, teamNames: string[] = []): DraftCell | null {
  const text = String(raw ?? '').trim();
  if (!text) return null;

  // Trade marker: a team name, optionally followed by ": <the actual pick
  // that landed in this column on that team's behalf>", e.g.
  // "BRAD K: Ashton Jeanty, LV -RB" or a bare "GUPPY:" with nothing after
  // it. Checked BEFORE the plain player-cell pattern below, because
  // "BRAD K: Ashton Jeanty, LV -RB" would otherwise satisfy that pattern on
  // its own (its comma is later in the string) and get treated as an
  // ordinary pick for whatever column it's sitting in -- "BRAD K: " baked
  // into the player name and no team attribution at all.
  const colonIdx = text.indexOf(':');
  if (colonIdx !== -1) {
    const prefix = text.slice(0, colonIdx).trim();
    const remainder = text.slice(colonIdx + 1).trim();
    const prefixIdx = teamNames.findIndex(t => t.toLowerCase() === prefix.toLowerCase());
    if (prefixIdx !== -1) {
      const remainderMatch = remainder.match(PLAYER_CELL_PATTERN);
      if (remainderMatch) {
        // The main case this handles: a marker prefix followed by a real
        // pick. Extract just the player -- don't keep the "TEAM: " text.
        return {
          player: remainderMatch[1].trim(),
          nflTeam: remainderMatch[2].trim().toUpperCase(),
          position: remainderMatch[3].trim().toUpperCase() as Position,
          raw: text,
          tradeMarkerTeamIndex: prefixIdx
        };
      }
      // A bare marker ("GUPPY:" with nothing after it) or a remainder that
      // doesn't parse as a player. Keep the team attribution either way --
      // don't lose it just because there's nothing clean to extract.
      return { player: text, nflTeam: null, position: 'UNKNOWN', raw: text, tradeMarkerTeamIndex: prefixIdx };
    }
  }

  const m = text.match(PLAYER_CELL_PATTERN);
  if (m) {
    return {
      player: m[1].trim(),
      nflTeam: m[2].trim().toUpperCase(),
      position: m[3].trim().toUpperCase() as Position,
      raw: text
    };
  }

  // Not a "Player, TEAM -POS" cell, and no colon-prefixed marker matched
  // above. Fall back to the older convention: the WHOLE cleaned cell
  // (trailing colon stripped) matching a team name exactly, e.g. a no-colon
  // "brad k".
  const cleaned = text.replace(/:\s*$/, '').trim();
  const markerIdx = teamNames.findIndex(t => t.toLowerCase() === cleaned.toLowerCase());
  if (markerIdx !== -1) {
    return { player: text, nflTeam: null, position: 'UNKNOWN', raw: text, tradeMarkerTeamIndex: markerIdx };
  }

  // Occupied but unparseable and not a recognized trade marker (a random
  // note, a nickname that doesn't match any team name exactly, etc). Still
  // counts as a used pick attributed to the column it's sitting in.
  return { player: text, nflTeam: null, position: 'UNKNOWN', raw: text };
}

// "Josh Allen, BUF" -> {player, nflTeam} (position comes from the column)
export function parseRankingCell(raw: unknown): { player: string; nflTeam: string | null } | null {
  const text = String(raw ?? '').trim();
  if (!text) return null;
  const m = text.match(/^(.*),\s*([A-Za-z]{2,4})\s*$/);
  if (!m) return { player: text, nflTeam: null };
  return { player: m[1].trim(), nflTeam: m[2].trim().toUpperCase() };
}

export function colLetterToIndex(letter: string): number {
  return letter.toUpperCase().charCodeAt(0) - 65;
}

// Reads team names LIVE from the sheet's own header row (row 1) rather than
// from a hardcoded list — so a rename in the sheet (e.g. "Team 16" becoming
// a real owner's name) shows up on refresh without a code change. Falls
// back to a generic "Team N" placeholder for a column whose header cell is
// blank, so a half-finished header row never crashes anything.
export function parseTeamNames(headerRow: unknown[] | undefined): string[] {
  const teamColIdx = CONFIG.TEAM_COLUMNS.map(colLetterToIndex);
  return teamColIdx.map((ci, i) => {
    const raw = String(headerRow?.[ci] ?? '').trim();
    return raw || `Team ${i + 1}`;
  });
}

export function parseDraftGrid(values: unknown[][], teamNames: string[]): (DraftCell | null)[][] {
  const teamColIdx = CONFIG.TEAM_COLUMNS.map(colLetterToIndex);
  const rounds: (DraftCell | null)[][] = [];

  for (let r = 0; r < CONFIG.TOTAL_ROUNDS; r++) {
    const rowIdx = r + 1; // skip header row
    const row = values[rowIdx] || [];
    const cells = teamColIdx.map(ci => parseDraftCell(row[ci], teamNames));
    rounds.push(cells);
  }
  return rounds; // rounds[roundIndex][teamIndex]
}

export function parseRankings(values: unknown[][]): RankingsByPosition {
  const byPos: RankingsByPosition = {};
  const startColIdx = colLetterToIndex(CONFIG.RANKINGS_START_COL);

  for (const pos of Object.keys(CONFIG.RANKINGS_COLUMNS)) {
    const colIdx = colLetterToIndex(CONFIG.RANKINGS_COLUMNS[pos]) - startColIdx;
    const list: RankingEntry[] = [];
    for (let r = 1; r < values.length; r++) {
      const row = values[r] || [];
      const parsed = parseRankingCell(row[colIdx]);
      if (parsed) list.push({ rank: list.length + 1, position: pos as Position, ...parsed });
    }
    byPos[pos] = list;
  }
  return byPos;
}

// ---------------------------------------------------------------
// Draft-state computation
// ---------------------------------------------------------------

export function snakeOrderForRound(roundIndexZeroBased: number): number[] {
  const order = CONFIG.TEAM_COLUMNS.map((_, i) => i);
  const roundNum = roundIndexZeroBased + 1;
  if (CONFIG.REVERSE_EVEN_ROUNDS && roundNum % 2 === 0) order.reverse();
  return order;
}

// Walks the whole grid (not just up to the first gap) because keepers and
// pre-entered picks often land in later rounds while earlier rounds/teams
// are still blank — e.g. a round-7 keeper for a team that hasn't picked in
// rounds 1-6 yet. "On the clock" is still just the first empty cell found
// in true snake order; every other filled cell, wherever it sits, still
// counts toward that team's roster for slot-need purposes.
//
// A pick's TEAM for roster purposes is its trade-marker team when the cell
// is a marker, otherwise the column it's sitting in. "On the clock" always
// advances by column/round position, unaffected by trade attribution — the
// draft slot order itself doesn't change when a pick's rights get traded.
export function analyzeGrid(rounds: (DraftCell | null)[][]): { picks: Pick[]; onClock: OnClock | null } {
  const picks: Pick[] = [];
  let onClock: OnClock | null = null;

  for (let r = 0; r < rounds.length; r++) {
    const order = snakeOrderForRound(r);
    for (const teamIdx of order) {
      const cell = rounds[r][teamIdx];
      if (cell) {
        const effectiveTeamIndex = cell.tradeMarkerTeamIndex ?? teamIdx;
        picks.push({ round: r + 1, teamIndex: effectiveTeamIndex, cell, pickNumber: picks.length + 1 });
      } else if (onClock === null) {
        onClock = { round: r + 1, teamIndex: teamIdx, pickNumber: picks.length + 1 };
      }
    }
  }

  return { picks, onClock };
}

export function buildSlotInstances(): SlotInstance[] {
  const instances: SlotInstance[] = [];
  CONFIG.ROSTER_SLOTS.forEach(slotType => {
    for (let i = 0; i < slotType.count; i++) {
      instances.push({ name: slotType.name, eligible: slotType.eligible, priority: slotType.priority, filledBy: null });
    }
  });
  instances.sort((a, b) => a.priority - b.priority);
  return instances;
}

export function slotAccepts(slot: SlotInstance, position: string): boolean {
  return slot.eligible.includes('ANY') || slot.eligible.includes(position);
}

export function computeOpenSlots(teamPicksInOrder: Pick[]): SlotInstance[] {
  const slots = buildSlotInstances();
  teamPicksInOrder.forEach(pick => {
    const slot = slots.find(s => s.filledBy === null && slotAccepts(s, pick.cell.position));
    if (slot) slot.filledBy = pick.cell.player;
  });
  return slots.filter(s => s.filledBy === null);
}

export function draftedNameSet(picks: Pick[]): Set<string> {
  const set = new Set<string>();
  picks.forEach(p => set.add(p.cell.player.toLowerCase().trim()));
  return set;
}

function summarizeSlots(openSlots: SlotInstance[]): Record<string, number> {
  return openSlots.reduce<Record<string, number>>((acc, s) => {
    acc[s.name] = (acc[s.name] || 0) + 1;
    return acc;
  }, {});
}

// Round-based anti-reach guardrail: how far past the current overall pick
// number a player's ADP is allowed to sit before that pick counts
// as too much of a reach to suggest as the primary. Tighter early (rounds
// 1-4), looser mid-draft (5-10), off entirely late (11-16, null = no cap)
// -- by then bench/depth picks are inherently unpredictable and shouldn't
// be second-guessed by ADP.
// K/DST are structurally priority-1 slots (see CONFIG.ROSTER_SLOTS) so they
// become eligible targets from round 1 like any other dedicated slot -- but
// nobody actually drafts a kicker or defense that early in this league.
// Autopick must never suggest either position before this round, no matter
// what else is going on (open slots, ADP, reach guardrails, etc).
const KICKER_DEFENSE_MIN_ROUND = 14;

function maxAllowedGap(round: number): number | null {
  if (round <= 4) return 10;
  if (round <= 10) return 20;
  return null;
}

// Scans a position's own rank-ordered list (already drafted players
// filtered out) for the first entry whose ADP gap is within the cap.
// maxGap === null means the guardrail is off for this round -- return
// rank #1 immediately without even looking at ADP, so a late-round pick
// behaves exactly as it did before this guardrail existed. Returns null if
// nobody in the list satisfies the cap (caller decides the fallback).
function findCompliantCandidate(list: RankingEntry[], maxGap: number | null, currentPickNumber: number): RankingEntry | null {
  if (maxGap === null) return list[0] ?? null;
  for (const candidate of list) {
    const { adp } = lookupAdp(candidate.player);
    if (adp - currentPickNumber <= maxGap) return candidate;
  }
  return null;
}

// Builds the full SuggestionCandidate shape for whichever entry was chosen
// from `list` (the position's own compliant pick, or a fallback rank #1).
// Backups are "next best in this position's rank order, excluding whoever
// was actually chosen" -- NOT filtered by the compliance rule, so a human
// reviewing them still sees real reach options, per design. Reference
// equality (not name matching) to exclude `chosen`, since it's always
// literally one of `list`'s own entries.
function buildSuggestionCandidate(
  pos: string,
  chosen: RankingEntry,
  list: RankingEntry[],
  totalAtPosition: number,
  targetSlots: SlotInstance[]
): SuggestionCandidate {
  const slot = targetSlots.find(s => slotAccepts(s, pos));
  const { adp, source } = lookupAdp(chosen.player);
  return {
    ...chosen,
    adp,
    adpSource: source,
    totalAtPosition,
    slotName: slot ? slot.name : '',
    backups: list.filter(p => p !== chosen).slice(0, 2)
  };
}

// Ideal bench composition Autopick suggests toward -- NOT a hard cap on
// what a team can actually roster (a team's real bench is whatever they
// draft), only a target shaping which position gets suggested for an open
// bench slot. K/DST aren't listed at all: they're excluded from bench
// entirely and structurally, via CONFIG.ROSTER_SLOTS' BENCH.eligible no
// longer including them -- that's a hard rule, independent of this target.
export const BENCH_TARGETS: Record<'QB' | 'RB' | 'WR' | 'TE', { min: number; max: number }> = {
  RB: { min: 2, max: 3 },
  WR: { min: 2, max: 3 },
  TE: { min: 1, max: 1 },
  QB: { min: 1, max: 1 }
};

// Team's current bench composition broken down by position (filled slots
// only -- an open bench slot doesn't count toward anything). Reuses
// buildTeamRoster's own priority-fill simulation (the same one
// computeOpenSlots relies on) rather than re-deriving it a third time, so
// this always agrees with what's actually shown on the Rosters tab.
function benchCompositionByPosition(teamPicksInOrder: Pick[]): Record<string, number> {
  const { bench } = buildTeamRoster(teamPicksInOrder);
  const counts: Record<string, number> = {};
  bench.forEach(slot => {
    if (slot.position) counts[slot.position] = (counts[slot.position] || 0) + 1;
  });
  return counts;
}

// Narrows a bench slot's eligible positions down to ones still under their
// BENCH_TARGETS max, given the team's current bench counts. Exported and
// kept as a small pure function specifically so the defensive fallback
// (every position already at its max) can be unit-tested directly with a
// hand-crafted counts object -- a real 7-slot bench can never actually
// reach that state on its own (the four maxes sum to 8), so there's no way
// to construct it through real Pick[] data.
export function narrowBenchPositions(positionsToCheck: string[], benchCounts: Record<string, number>): string[] {
  const underMax = positionsToCheck.filter(pos => {
    const target = BENCH_TARGETS[pos as keyof typeof BENCH_TARGETS];
    return !target || (benchCounts[pos] ?? 0) < target.max;
  });
  return underMax.length > 0 ? underMax : positionsToCheck;
}

// Core: given a team index, work out what to suggest.
//
// Your own per-position rank lists always decide who's best AT a position —
// that part never changes. ADP comes in two ways:
//  1. Cross-position comparison, when more than one position is eligible for
//     the open slot (an empty roster's very first pick, or FLEX/bench, where
//     every dedicated slot is open at once): comparing "percentile within
//     your own list" was arbitrary and could suggest a reach (e.g. a TE at
//     pick 2 just because the TE list happened to be shorter). ADP is a
//     real, external signal of when players actually go, so it replaces
//     that comparison.
//  2. The round-based anti-reach guardrail (maxAllowedGap/
//     findCompliantCandidate above): even with a single eligible position,
//     a player whose ADP sits far past the current pick is skipped in favor
//     of the next compliant name on the SAME rank list -- the list's own
//     order still decides who's best, ADP here is a gate, not a re-sort.
// Missing/unranked players fall back to a high ADP value so they never
// win a comparison, and never count as "compliant," by default.
export function computeSuggestion(
  teamIndex: number,
  picks: Pick[],
  rankings: RankingsByPosition,
  currentRound: number,
  currentPickNumber: number
): Suggestion {
  const teamPicks = picks.filter(p => p.teamIndex === teamIndex);
  const openSlots = computeOpenSlots(teamPicks);

  if (openSlots.length === 0) {
    return { kind: 'rosterFull' };
  }

  const minPriority = Math.min(...openSlots.map(s => s.priority));
  const targetSlots = openSlots.filter(s => s.priority === minPriority);
  const eligiblePositions = new Set<string>();
  targetSlots.forEach(s => s.eligible.forEach(p => eligiblePositions.add(p)));

  const drafted = draftedNameSet(picks);
  let positionsToCheck = eligiblePositions.has('ANY')
    ? Object.keys(CONFIG.RANKINGS_COLUMNS)
    : [...eligiblePositions];

  // Hold K/DST back until round 14, regardless of open slots or priority --
  // see KICKER_DEFENSE_MIN_ROUND above.
  if (currentRound < KICKER_DEFENSE_MIN_ROUND) {
    positionsToCheck = positionsToCheck.filter(pos => pos !== 'K' && pos !== 'DST');
  }

  // Bench slots specifically (priority 3, i.e. every dedicated + FLEX slot
  // is already filled and only bench remains open): narrow further to
  // positions still under their BENCH_TARGETS max. K/DST are already
  // excluded structurally (BENCH.eligible doesn't list them at all) -- this
  // only shapes the QB/RB/WR/TE split. Dedicated slots and FLEX are
  // completely untouched by this.
  if (minPriority === 3) {
    positionsToCheck = narrowBenchPositions(positionsToCheck, benchCompositionByPosition(teamPicks));
  }

  const maxGap = maxAllowedGap(currentRound);

  const perPosition = positionsToCheck
    .map(pos => {
      const list = (rankings[pos] || []).filter(p => !drafted.has(p.player.toLowerCase().trim()));
      if (list.length === 0) return null;
      const totalAtPosition = (rankings[pos] || []).length;
      const compliant = findCompliantCandidate(list, maxGap, currentPickNumber);
      return { pos, list, totalAtPosition, compliant };
    })
    .filter((p): p is NonNullable<typeof p> => p !== null);

  if (perPosition.length === 0) {
    return { kind: 'noCandidates', openSlotSummary: summarizeSlots(openSlots) };
  }

  let candidatesByPosition: SuggestionCandidate[];
  let reachFlagged = false;

  if (positionsToCheck.length === 1) {
    // Single eligible position: no cross-position comparison needed, your
    // own rank list already decides order -- the guardrail only gates
    // WHICH entry from that same list gets suggested.
    const p = perPosition[0];
    const chosen = p.compliant ?? p.list[0];
    reachFlagged = p.compliant === null;
    candidatesByPosition = [buildSuggestionCandidate(p.pos, chosen, p.list, p.totalAtPosition, targetSlots)];
  } else {
    const compliantPositions = perPosition.filter(p => p.compliant !== null);
    if (compliantPositions.length > 0) {
      // Compare only among positions that DID have a compliant candidate --
      // a position with nothing compliant doesn't get its rank #1 back into
      // the running just because other positions came up empty too.
      candidatesByPosition = compliantPositions.map(p =>
        buildSuggestionCandidate(p.pos, p.compliant!, p.list, p.totalAtPosition, targetSlots)
      );
    } else {
      // Nobody anywhere satisfied the cap -- fall back to the ORIGINAL,
      // unfiltered behavior (each position's own rank #1, cross-position
      // ADP sort) exactly as before this guardrail existed, and flag it.
      reachFlagged = true;
      candidatesByPosition = perPosition.map(p =>
        buildSuggestionCandidate(p.pos, p.list[0], p.list, p.totalAtPosition, targetSlots)
      );
    }
    candidatesByPosition.sort((a, b) => a.adp - b.adp);
  }

  const [primary, ...others] = candidatesByPosition;

  return {
    kind: 'ok',
    openSlotSummary: summarizeSlots(openSlots),
    multiPosition: positionsToCheck.length > 1,
    primary,
    others,
    ...(reachFlagged ? { reachFlagged: true } : {})
  };
}

export function gridSignature(rounds: (DraftCell | null)[][]): string {
  return JSON.stringify(rounds.map(round => round.map(c => (c ? c.raw : ''))));
}

// The "Traded Draft Picks" section is free text, not structured data — no
// attempt to resolve who actually owns a slot. Just surface every non-empty
// line (minus the section header itself) so it stays visible at the table.
export function parseTradeNotes(values: unknown[][]): string[] {
  return values
    .map(row => String(row?.[0] ?? '').trim())
    .filter(text => text && text.toLowerCase() !== 'traded draft picks');
}

// ---------------------------------------------------------------
// Rosters tab
// ---------------------------------------------------------------

// Same priority-fill simulation as computeOpenSlots (dedicated slots fill
// first, then FLEX, then bench) -- reuses buildSlotInstances/slotAccepts
// rather than reimplementing that fill order -- but keeps the full Pick
// that filled each slot instead of discarding it down to just a player-name
// string, since the Rosters tab needs to show who's in each slot.
//
// buildSlotInstances() sorts its output by priority so the fill loop below
// tries dedicated slots before FLEX before bench; for display we want
// CONFIG.ROSTER_SLOTS's own definition order instead (QB/RB/WR/TE/FLEX/DST/
// K/BENCH), so after filling we walk ROSTER_SLOTS in its declared order and
// pull each name's next unfilled instance from a per-name queue. That queue
// preserves fill order because Array.prototype.sort is stable: instances
// sharing a name keep their relative order whether or not the priority sort
// reordered other names around them.
export function buildTeamRoster(teamPicksInOrder: Pick[]): {
  starters: RosterSlotView[];
  bench: RosterSlotView[];
  unassigned: Pick[];
} {
  const prioritySlots = buildSlotInstances();
  const filledPick: (Pick | null)[] = prioritySlots.map(() => null);
  const unassigned: Pick[] = [];

  teamPicksInOrder.forEach(pick => {
    const idx = prioritySlots.findIndex(s => s.filledBy === null && slotAccepts(s, pick.cell.position));
    if (idx === -1) {
      unassigned.push(pick);
      return;
    }
    prioritySlots[idx].filledBy = pick.cell.player;
    filledPick[idx] = pick;
  });

  const queueByName = new Map<string, number[]>();
  prioritySlots.forEach((slot, i) => {
    const queue = queueByName.get(slot.name) ?? [];
    queue.push(i);
    queueByName.set(slot.name, queue);
  });

  const starters: RosterSlotView[] = [];
  const bench: RosterSlotView[] = [];

  CONFIG.ROSTER_SLOTS.forEach(slotType => {
    for (let i = 0; i < slotType.count; i++) {
      const queue = queueByName.get(slotType.name);
      const slotIdx = queue?.shift();
      const pick = slotIdx !== undefined ? filledPick[slotIdx] : null;
      const view: RosterSlotView = {
        slotName: slotType.name,
        player: pick ? pick.cell.player : null,
        position: pick ? pick.cell.position : null,
        nflTeam: pick ? pick.cell.nflTeam : null
      };
      (slotType.priority <= 2 ? starters : bench).push(view);
    }
  });

  return { starters, bench, unassigned };
}
