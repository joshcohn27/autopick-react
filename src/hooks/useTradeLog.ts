import { useCallback, useEffect, useState } from 'react';
import { CONFIG } from '../config';
import { fetchTradeLogs } from '../lib/sheets';

export interface TradeLog {
  year: number;
  values: unknown[][];
}

// raw rows from every "<year> Trades" tab (this year and later), refetched on
// an interval for as long as the component using this is mounted
export function useTradeLog() {
  const [logs, setLogs] = useState<TradeLog[]>([]);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);

  // background loads stay quiet, only the refresh button shows "fetching"
  const load = useCallback(() => {
    function handleLogs(values: TradeLog[]) {
      setLogs(values);
      setLastUpdatedAt(Date.now());
      setErrorMessage(null);
    }

    // keep showing the last good rows, just flag the error
    function handleError(err: unknown) {
      if (err instanceof Error) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage(String(err));
      }
    }

    function finish() {
      setHasLoaded(true);
      setIsRefreshing(false);
    }

    return fetchTradeLogs().then(handleLogs, handleError).then(finish);
  }, []);

  const refresh = useCallback(() => {
    setIsRefreshing(true);
    load();
  }, [load]);

  useEffect(() => {
    load();
    const handle = window.setInterval(load, CONFIG.TRADE_LOG_POLL_INTERVAL_MS);
    return () => window.clearInterval(handle);
  }, [load]);

  return { logs, hasLoaded, isRefreshing, errorMessage, lastUpdatedAt, refresh };
}
