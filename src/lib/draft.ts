import { CONFIG } from '../config';
import type {
  DraftCell, Pick, OnClock, RankingEntry, RankingsByPosition,
  SlotInstance, Suggestion, SuggestionCandidate, Position
} from '../types';

// ---------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------

// "Saquon Barkley, PHI -RB" -> {player, nflTeam, position}
// "Pittsburgh Steelers, PIT -DST" also matches (team-name-as-player for D/ST)
export function parseDraftCell(raw: unknown): DraftCell | null {
  const text = String(raw ?? '').trim();
  if (!text) return null;
  const m = text.match(/^(.*),\s*([A-Za-z]{2,4})\s*-\s*([A-Za-z]+)\s*$/);
  if (!m) {
    // Occupied but not a clean "Player, TEAM -POS" entry (a trade note,
    // a joke entry, etc). Still counts as a used pick; position unknown.
    return { player: text, nflTeam: null, position: 'UNKNOWN', raw: text };
  }
  return {
    player: m[1].trim(),
    nflTeam: m[2].trim().toUpperCase(),
    position: m[3].trim().toUpperCase() as Position,
    raw: text
  };
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

export function parseDraftGrid(values: unknown[][]): (DraftCell | null)[][] {
  const teamColIdx = CONFIG.TEAM_COLUMNS.map(colLetterToIndex);
  const rounds: (DraftCell | null)[][] = [];

  for (let r = 0; r < CONFIG.TOTAL_ROUNDS; r++) {
    const rowIdx = r + 1; // skip header row
    const row = values[rowIdx] || [];
    const cells = teamColIdx.map(ci => parseDraftCell(row[ci]));
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
  const order = CONFIG.TEAMS.map((_, i) => i);
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
export function analyzeGrid(rounds: (DraftCell | null)[][]): { picks: Pick[]; onClock: OnClock | null } {
  const picks: Pick[] = [];
  let onClock: OnClock | null = null;

  for (let r = 0; r < rounds.length; r++) {
    const order = snakeOrderForRound(r);
    for (const teamIdx of order) {
      const cell = rounds[r][teamIdx];
      if (cell) {
        picks.push({ round: r + 1, teamIndex: teamIdx, cell, pickNumber: picks.length + 1 });
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

function draftedNameSet(picks: Pick[]): Set<string> {
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

// Core: given a team index, work out what to suggest.
export function computeSuggestion(teamIndex: number, picks: Pick[], rankings: RankingsByPosition): Suggestion {
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
  const positionsToCheck = eligiblePositions.has('ANY')
    ? Object.keys(CONFIG.RANKINGS_COLUMNS)
    : [...eligiblePositions];

  const candidatesByPosition: SuggestionCandidate[] = positionsToCheck
    .map(pos => {
      const list = (rankings[pos] || []).filter(p => !drafted.has(p.player.toLowerCase().trim()));
      if (list.length === 0) return null;
      const totalAtPosition = (rankings[pos] || []).length;
      const top = list[0];
      const slot = targetSlots.find(s => slotAccepts(s, pos));
      return {
        ...top,
        percentile: top.rank / totalAtPosition,
        totalAtPosition,
        slotName: slot ? slot.name : '',
        backups: list.slice(1, 3)
      };
    })
    .filter((c): c is SuggestionCandidate => c !== null);

  if (candidatesByPosition.length === 0) {
    return { kind: 'noCandidates', openSlotSummary: summarizeSlots(openSlots) };
  }

  candidatesByPosition.sort((a, b) => a.percentile - b.percentile);
  const [primary, ...others] = candidatesByPosition;

  return {
    kind: 'ok',
    openSlotSummary: summarizeSlots(openSlots),
    multiPosition: positionsToCheck.length > 1,
    primary,
    others
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
