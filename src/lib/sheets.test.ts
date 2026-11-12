import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchSheetData } from './sheets';

function okResponse(values: unknown[][]) {
  return { ok: true, status: 200, json: async () => ({ values }), text: async () => '' };
}

function errorResponse(status: number, body: string) {
  return { ok: false, status, json: async () => ({}), text: async () => body };
}

describe('fetchSheetData', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('still returns the draft data, with a trades error, when the trades tab fails to load', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('Trades')) {
        return errorResponse(500, 'backend error');
      }
      return okResponse([['header']]);
    }));

    const result = await fetchSheetData();
    expect(result.draftValues).toEqual([['header']]);
    expect(result.tradeLogValues).toBeNull();
    expect(result.tradeLogError).toContain('500');
  });

  it('treats a missing trades tab as no trades, not an error', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('Trades')) {
        return errorResponse(400, '{"error":{"message":"Unable to parse range: 2027 Trades!A1:E2000"}}');
      }
      return okResponse([]);
    }));

    const result = await fetchSheetData();
    expect(result.tradeLogValues).toEqual([]);
    expect(result.tradeLogError).toBeNull();
  });
});
