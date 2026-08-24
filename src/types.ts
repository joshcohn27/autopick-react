export type Position = 'QB' | 'RB' | 'WR' | 'TE' | 'K' | 'DST' | 'UNKNOWN';

export interface DraftCell {
  player: string;
  nflTeam: string | null;
  position: Position;
  raw: string;
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

export interface SuggestionCandidate extends RankingEntry {
  percentile: number;
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
