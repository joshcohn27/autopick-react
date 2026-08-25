export type Position = 'QB' | 'RB' | 'WR' | 'TE' | 'K' | 'DST' | 'UNKNOWN';

export interface DraftCell {
  player: string;
  nflTeam: string | null;
  position: Position;
  raw: string;
  // Present only when this cell is a trade marker (the exact text of
  // another team's row-1 name, all-caps) rather than a player -- the index
  // into TEAM_COLUMNS/teamNames of the team this pick actually belongs to.
  tradeMarkerTeamIndex?: number;
}

export interface RankingEntry {
  rank: number;
  position: Position;
  player: string;
  nflTeam: string | null;
}

export type RankingsByPosition = Record<string, RankingEntry[]>;

export interface Pick {
  round: number;
  teamIndex: number;
  cell: DraftCell;
  pickNumber: number;
}

export interface OnClock {
  round: number;
  teamIndex: number;
  pickNumber: number;
}

export interface RosterSlotType {
  name: string;
  eligible: string[]; // position codes, or 'ANY'
  count: number;
  priority: number; // 1 = dedicated, 2 = flex, 3 = bench
}

export interface SlotInstance {
  name: string;
  eligible: string[];
  priority: number;
  filledBy: string | null;
}

// One roster slot as shown on the Rosters tab -- unlike SlotInstance (which
// only tracks the drafted player's name string, discarded after the fill
// simulation), this keeps enough of the pick to render a position tag and
// NFL team. player/position/nflTeam are null for a slot the team hasn't
// filled yet, rendered as an empty placeholder rather than omitted.
export interface RosterSlotView {
  slotName: string;
  player: string | null;
  position: Position | null;
  nflTeam: string | null;
}

// One team's full roster, split the same way buildTeamRoster's priority
// simulation splits it: starters = priority 1 (dedicated) and 2 (FLEX)
// slots, bench = priority 3. unassigned holds any pick that didn't fit any
// slot -- a data anomaly (more picks than roster spots) that shouldn't
// normally happen with 16 rounds = 16 slots, surfaced instead of dropped.
export interface TeamRoster {
  teamName: string;
  starters: RosterSlotView[];
  bench: RosterSlotView[];
  unassigned: Pick[];
}

export interface SuggestionCandidate extends RankingEntry {
  adp: number;
  adpSource: 'blended' | 'espn-only' | 'sleeper-only' | 'unranked';
  totalAtPosition: number;
  slotName: string;
  backups: RankingEntry[];
}

export type Suggestion =
  | { kind: 'rosterFull' }
  | { kind: 'noCandidates'; openSlotSummary: Record<string, number> }
  | {
      kind: 'ok';
      openSlotSummary: Record<string, number>;
      multiPosition: boolean;
      primary: SuggestionCandidate;
      others: SuggestionCandidate[];
    };
