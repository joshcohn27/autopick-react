// pick ownership = every team owns its own pick in every round, then the
// Trades tab rows get applied on top, top to bottom (lowest row wins).
// pure functions only, no fetching or react in here.

export interface PickTrade {
  rowNumber: number;
  year: number;
  round: number;
  originalTeam: string;
  newOwner: string;
  notes: string;
}

export interface TradeRowWarning {
  rowNumber: number;
  reason: string;
  rowText: string;
}

export interface OwnedPick {
  round: number;
  originalTeam: string;
  isOwn: boolean;
  notes: string;
}

export interface TradedAwayPick {
  round: number;
  newOwner: string;
  notes: string;
}

export interface TeamPickOwnership {
  team: string;
  owned: OwnedPick[];
  tradedAway: TradedAwayPick[];
}

function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

function cellText(row: unknown[], index: number): string {
  const value = row[index];
  if (value === undefined || value === null) {
    return '';
  }
  return String(value).trim();
}

function compareNames(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: 'base' });
}

function parseWholeNumber(text: string): number | null {
  if (!/^\d+$/.test(text)) {
    return null;
  }
  return Number(text);
}

export function parseTradeRows(
  values: unknown[][],
  teams: string[],
  totalRounds: number
): { trades: PickTrade[]; warnings: TradeRowWarning[] } {
  const teamByName = new Map<string, string>();
  for (const team of teams) {
    teamByName.set(normalizeName(team), team);
  }

  const trades: PickTrade[] = [];
  const warnings: TradeRowWarning[] = [];

  // row 1 is headers, so data starts at index 1 (sheet row 2)
  for (let i = 1; i < values.length; i++) {
    const row = values[i] ?? [];
    const rowNumber = i + 1;

    const yearText = cellText(row, 0);
    const roundText = cellText(row, 1);
    const originalText = cellText(row, 2);
    const newOwnerText = cellText(row, 3);
    const notes = cellText(row, 4);

    const cells = [yearText, roundText, originalText, newOwnerText, notes];
    const isBlank = cells.every(text => text === '');
    if (isBlank) {
      continue;
    }

    const problems: string[] = [];

    const year = parseWholeNumber(yearText);
    if (year === null) {
      problems.push(`bad year "${yearText}"`);
    }

    const round = parseWholeNumber(roundText);
    const roundInRange = round !== null && round >= 1 && round <= totalRounds;
    if (!roundInRange) {
      problems.push(`bad round "${roundText}" (should be 1-${totalRounds})`);
    }

    const originalTeam = teamByName.get(normalizeName(originalText));
    if (originalTeam === undefined) {
      problems.push(`unknown original team "${originalText}"`);
    }

    const newOwner = teamByName.get(normalizeName(newOwnerText));
    if (newOwner === undefined) {
      problems.push(`unknown new owner "${newOwnerText}"`);
    }

    if (problems.length > 0) {
      warnings.push({
        rowNumber,
        reason: problems.join(', '),
        rowText: cells.filter(text => text !== '').join(' | ')
      });
      continue;
    }

    // no problems means everything parsed, this just tells typescript that
    if (year === null || round === null) {
      continue;
    }
    if (originalTeam === undefined || newOwner === undefined) {
      continue;
    }

    trades.push({ rowNumber, year, round, originalTeam, newOwner, notes });
  }

  return { trades, warnings };
}

// the default year plus any later years that show up in the trades
export function availableYears(trades: PickTrade[], defaultYear: number): number[] {
  const years = new Set<number>();
  years.add(defaultYear);
  for (const trade of trades) {
    if (trade.year > defaultYear) {
      years.add(trade.year);
    }
  }
  return [...years].sort((a, b) => a - b);
}

function pickKey(round: number, originalTeam: string): string {
  return `${round}|${originalTeam}`;
}

export function buildPickOwnership(
  teams: string[],
  totalRounds: number,
  year: number,
  trades: PickTrade[]
): TeamPickOwnership[] {
  // later rows overwrite earlier ones, so the lowest row wins
  const latestTrade = new Map<string, PickTrade>();
  for (const trade of trades) {
    if (trade.year !== year) {
      continue;
    }
    latestTrade.set(pickKey(trade.round, trade.originalTeam), trade);
  }

  const ownedByTeam = new Map<string, OwnedPick[]>();
  const tradedAwayByTeam = new Map<string, TradedAwayPick[]>();
  for (const team of teams) {
    ownedByTeam.set(team, []);
    tradedAwayByTeam.set(team, []);
  }

  for (const originalTeam of teams) {
    for (let round = 1; round <= totalRounds; round++) {
      const trade = latestTrade.get(pickKey(round, originalTeam));

      let owner = originalTeam;
      let notes = '';
      if (trade) {
        owner = trade.newOwner;
        notes = trade.notes;
      }

      const isOwn = owner === originalTeam;
      ownedByTeam.get(owner)?.push({ round, originalTeam, isOwn, notes });

      if (!isOwn) {
        tradedAwayByTeam.get(originalTeam)?.push({ round, newOwner: owner, notes });
      }
    }
  }

  const sortedTeams = [...teams].sort(compareNames);

  return sortedTeams.map(team => {
    const owned = ownedByTeam.get(team) ?? [];
    owned.sort(compareOwnedPicks);

    const tradedAway = tradedAwayByTeam.get(team) ?? [];
    tradedAway.sort(compareTradedAwayPicks);

    return { team, owned, tradedAway };
  });
}

function compareOwnedPicks(a: OwnedPick, b: OwnedPick): number {
  if (a.round !== b.round) {
    return a.round - b.round;
  }
  if (a.isOwn !== b.isOwn) {
    if (a.isOwn) {
      return -1;
    }
    return 1;
  }
  return compareNames(a.originalTeam, b.originalTeam);
}

function compareTradedAwayPicks(a: TradedAwayPick, b: TradedAwayPick): number {
  if (a.round !== b.round) {
    return a.round - b.round;
  }
  return compareNames(a.newOwner, b.newOwner);
}

export function ordinal(n: number): string {
  const lastTwo = n % 100;
  if (lastTwo >= 11 && lastTwo <= 13) {
    return `${n}th`;
  }

  const last = n % 10;
  if (last === 1) {
    return `${n}st`;
  }
  if (last === 2) {
    return `${n}nd`;
  }
  if (last === 3) {
    return `${n}rd`;
  }
  return `${n}th`;
}

export function formatOwnedPick(pick: OwnedPick): string {
  const label = `${ordinal(pick.round)} rounder`;
  if (pick.isOwn) {
    return label;
  }
  return `${label} (via ${pick.originalTeam})`;
}

export function formatTradedAwayPick(pick: TradedAwayPick): string {
  return `${ordinal(pick.round)} rounder (to ${pick.newOwner})`;
}
