import { CONFIG } from '../config';

const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';

class SheetsApiError extends Error {
  status: number;
  body: string;

  constructor(status: number, body: string) {
    super(`Sheets API error (${status}): ${body.slice(0, 200)}`);
    this.status = status;
    this.body = body;
  }
}

async function fetchRange(tab: string, range: string): Promise<unknown[][]> {
  const encodedRange = encodeURIComponent(`${tab}!${range}`);
  const url = `${SHEETS_API}/${CONFIG.SPREADSHEET_ID}/values/${encodedRange}?key=${CONFIG.API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text();
    throw new SheetsApiError(res.status, body);
  }
  const data = await res.json();
  return data.values || [];
}

// just the team-name header row, for when the draft isn't active
export async function fetchDraftHeaderRow(): Promise<unknown[] | undefined> {
  const values = await fetchRange(CONFIG.DRAFT_TAB, CONFIG.DRAFT_RANGE);
  return values[0];
}

export async function fetchSheetData(): Promise<{ draftValues: unknown[][]; rankingValues: unknown[][]; tradeValues: unknown[][] }> {
  const [draftValues, rankingValues, tradeValues] = await Promise.all([
    fetchRange(CONFIG.DRAFT_TAB, CONFIG.DRAFT_RANGE),
    fetchRange(CONFIG.RANKINGS_TAB, CONFIG.RANKINGS_RANGE),
    fetchRange(CONFIG.DRAFT_TAB, CONFIG.TRADES_RANGE)
  ]);
  return { draftValues, rankingValues, tradeValues };
}

// a tab that doesn't exist yet comes back as a 400 "unable to parse range"
function isMissingTabError(err: unknown): boolean {
  if (!(err instanceof SheetsApiError)) {
    return false;
  }
  if (err.status !== 400) {
    return false;
  }
  return err.body.includes('Unable to parse range');
}

// no Trades tab yet just means no trades logged yet
export async function fetchTradeLog(): Promise<unknown[][]> {
  try {
    return await fetchRange(CONFIG.TRADE_LOG_TAB, CONFIG.TRADE_LOG_RANGE);
  } catch (err) {
    if (isMissingTabError(err)) {
      return [];
    }
    throw err;
  }
}
