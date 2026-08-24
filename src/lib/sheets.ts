import { CONFIG } from '../config';

const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';

async function fetchRange(tab: string, range: string): Promise<unknown[][]> {
  const encodedRange = encodeURIComponent(`${tab}!${range}`);
  const url = `${SHEETS_API}/${CONFIG.SPREADSHEET_ID}/values/${encodedRange}?key=${CONFIG.API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Sheets API error (${res.status}): ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.values || [];
}

export async function fetchSheetData(): Promise<{ draftValues: unknown[][]; rankingValues: unknown[][]; tradeValues: unknown[][] }> {
  const [draftValues, rankingValues, tradeValues] = await Promise.all([
    fetchRange(CONFIG.DRAFT_TAB, CONFIG.DRAFT_RANGE),
    fetchRange(CONFIG.RANKINGS_TAB, CONFIG.RANKINGS_RANGE),
    fetchRange(CONFIG.DRAFT_TAB, CONFIG.TRADES_RANGE)
  ]);
  return { draftValues, rankingValues, tradeValues };
}
