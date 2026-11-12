// pick ownership = every team owns its own pick in every round, then the
// "<year> Trades" tab rows get applied on top, top to bottom (lowest row wins).
// columns: A Type (Trade or Punishment), B Round, C Original Team,
// D New Owner (blank for a punishment), E Notes.
// pure functions only, no fetching or react in here.

export type TradeType = 'trade' | 'punishment';

export interface PickTrade {
  rowNumber: number;
  year: number;
  type: TradeType;
  round: number;
  originalTeam: string;
  // null when the pick was taken away as a punishment: nobody owns it
  newOwner: string | null;
  notes: string;
}

export interface TradeRowWarning {
  year: number;
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
  // null for a punishment
  newOwner: string | null;
  notes: string;
}

export interface TeamPickOwnership {
  team: string;
  owned: OwnedPick[];
  tradedAway: TradedAwayPick[];
}

const TRADE_TAB_PATTERN = /^(\d{4}) Trades$/i;

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

function parseTradeType(text: string): TradeType | null {
  const lowered = text.toLowerCase();
  if (lowered === 'trade') {
    return 'trade';
  }
  if (lowered === 'punishment') {
    return 'punishment';
  }
  return null;
}

export function tradeTabName(year: number): string {
  return `${year} Trades`;
}

// years to show: the current draft year, plus any later year that has its own trades tab
export function tradeTabYears(sheetTitles: string[], defaultYear: number): number[] {
  const years = new Set<number>();
  years.add(defaultYear);
  for (const title of sheetTitles) {
    const match = title.trim().match(TRADE_TAB_PATTERN);
    if (match) {
      const year = Number(match[1]);
      if (year > defaultYear) {
        years.add(year);
      }
    }
  }
  return [...years].sort((a, b) => a - b);
}

// one "<year> Trades" tab's rows. the year comes from the tab, not a column.
export function parseTradeRows(
  values: unknown[][],
  teams: string[],
  totalRounds: number,
  year: number
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

    const typeText = cellText(row, 0);
    const roundText = cellText(row, 1);
    const originalText = cellText(row, 2);
    const newOwnerText = cellText(row, 3);
    const notes = cellText(row, 4);

    const cells = [typeText, roundText, originalText, newOwnerText, notes];
    const isBlank = cells.every(text => text === '');
    if (isBlank) {
      continue;
    }

    const problems: string[] = [];

    const type = parseTradeType(typeText);
    if (type === null) {
      problems.push(`bad type "${typeText}" (should be Trade or Punishment)`);
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

    // a punishment sends the pick to nobody, so the new owner column is ignored
    let newOwner: string | null = null;
    if (type === 'trade') {
      const found = teamByName.get(normalizeName(newOwnerText));
      if (found === undefined) {
        problems.push(`unknown new owner "${newOwnerText}"`);
      } else {
        newOwner = found;
      }
    }

    if (problems.length > 0) {
      warnings.push({
        year,
        rowNumber,
        reason: problems.join(', '),
        rowText: cells.filter(text => text !== '').join(' | ')
      });
      continue;
    }

    // no problems means everything parsed, this just tells typescript that
    if (type === null || round === null || originalTeam === undefined) {
      continue;
    }

    trades.push({ rowNumber, year, type, round, originalTeam, newOwner, notes });
  }

  return { trades, warnings };
}

// who owns one pick right now: the lowest matching row wins, otherwise it's
// still the original team's. null means it was taken away as a punishment.
export function currentPickOwner(trades: PickTrade[], year: number, round: number, originalTeam: string): string | null {
  let owner: string | null = originalTeam;
  for (const trade of trades) {
    const samePick = trade.year === year && trade.round === round && trade.originalTeam === originalTeam;
    if (samePick) {
      owner = trade.newOwner;
    }
  }
  return owner;
}

// the same thing by team index, for the draft board. null = nobody (punishment).
export function pickOwnerLookup(
  teams: string[],
  year: number,
  trades: PickTrade[]
): (round: number, columnTeamIndex: number) => number | null {
  return (round, columnTeamIndex) => {
    const owner = currentPickOwner(trades, year, round, teams[columnTeamIndex]);
    if (owner === null) {
      return null;
    }
    const ownerIndex = teams.indexOf(owner);
    if (ownerIndex === -1) {
      return columnTeamIndex;
    }
    return ownerIndex;
  };
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

      let owner: string | null = originalTeam;
      let notes = '';
      if (trade) {
        owner = trade.newOwner;
        notes = trade.notes;
      }

      const isOwn = owner === originalTeam;
      if (owner !== null) {
        ownedByTeam.get(owner)?.push({ round, originalTeam, isOwn, notes });
      }

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
  return compareNames(a.newOwner ?? '', b.newOwner ?? '');
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
  const label = `${ordinal(pick.round)} rounder`;
  if (pick.newOwner === null) {
    return `${label} (punishment)`;
  }
  return `${label} (to ${pick.newOwner})`;
}
