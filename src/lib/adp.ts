import { ADP_DATA } from '../data/adp-data';
import type { AdpEntry } from '../data/adp-data';

// Very high fallback so anyone missing from the ADP table (deep bench
// players, K/DST, names that don't match exactly) sorts last in a
// cross-position comparison rather than winning by default.
const UNRANKED_FALLBACK = 999;

// Build a case-insensitive lookup once.
const NORMALIZED: Record<string, { blended: number; espn: number | null; sleeper: number | null }> = {};
for (const [name, entry] of Object.entries(ADP_DATA)) {
  NORMALIZED[name.toLowerCase().trim()] = entry;
}

export interface AdpLookup {
  adp: number;
  source: 'blended' | 'espn-only' | 'sleeper-only' | 'unranked';
}

export function lookupAdp(playerName: string): AdpLookup {
  const entry = NORMALIZED[playerName.toLowerCase().trim()];
  if (!entry) return { adp: UNRANKED_FALLBACK, source: 'unranked' };

  if (entry.espn !== null && entry.sleeper !== null) {
    return { adp: entry.blended, source: 'blended' };
  }
  if (entry.espn !== null) return { adp: entry.espn, source: 'espn-only' };
  if (entry.sleeper !== null) return { adp: entry.sleeper, source: 'sleeper-only' };
  return { adp: UNRANKED_FALLBACK, source: 'unranked' };
}

export interface AdpBoardEntry {
  player: string;
  position: AdpEntry['position'];
  adp: number;
}

// The full blended ADP list ordered ascending (best/earliest first), the
// same shape you'd see scrolling a Sleeper/ESPN draft room's player pool.
// Doesn't know about your league's roster rules or slot needs at all —
// this is just "who's gone, in what order, league-wide" for reference.
const FULL_BOARD: AdpBoardEntry[] = Object.entries(ADP_DATA)
  .map(([player, entry]) => ({ player, position: entry.position, adp: entry.blended }))
  .sort((a, b) => a.adp - b.adp);

// Available players by ADP, with anyone already drafted (by exact name
// match, case-insensitive) filtered out. Pass every drafted player's name
// from the current grid state. No default cap -- returns the full sorted
// list unless a caller explicitly passes a limit; the board itself now
// handles search/position filtering client-side over the full set.
export function computeAdpBoard(draftedNames: Set<string>, limit?: number): AdpBoardEntry[] {
  const available = FULL_BOARD.filter(e => !draftedNames.has(e.player.toLowerCase().trim()));
  return limit === undefined ? available : available.slice(0, limit);
}
