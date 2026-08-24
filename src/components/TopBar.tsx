import { useEffect, useState } from 'react';

interface Props {
  drafting: boolean;
  onToggleDrafting: (on: boolean) => void;
  onPullOnce: () => void;
  status: 'idle' | 'loading' | 'ok' | 'error';
  errorMessage: string | null;
  lastFetchAt: number | null;
}

export function TopBar({ drafting, onToggleDrafting, onPullOnce, status, errorMessage, lastFetchAt }: Props) {
  const [, forceTick] = useState(0);

  // Re-render once a second so "Updated Xs ago" stays live.
  useEffect(() => {
    const id = window.setInterval(() => forceTick(n => n + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  let statusText = '—';
  if (status === 'loading') statusText = 'Fetching…';
  else if (status === 'error') statusText = `Error: ${errorMessage}`;
  else if (status === 'ok' && lastFetchAt) {
    const secs = Math.round((Date.now() - lastFetchAt) / 1000);
    statusText = secs < 2 ? 'Just updated' : `Updated ${secs}s ago`;
  }

  return (
    <header className="topbar">
      <div className="wordmark">
        <span className="wordmark-main">AUTOPICK</span>
        <span className="wordmark-sub">1T8 Dynasty League</span>
      </div>

      <div className="controls">
        <div className="status-line">{statusText}</div>
        <button className="btn-ghost" onClick={onPullOnce} title="Fetch the sheet once">
          Pull once
        </button>
        <label className="toggle">
          <input
            type="checkbox"
            checked={drafting}
            onChange={e => onToggleDrafting(e.target.checked)}
          />
          <span className="toggle-track">
            <span className="toggle-thumb" />
          </span>
          <span className={`toggle-label${drafting ? ' is-on' : ''}`}>Drafting</span>
        </label>
      </div>
    </header>
  );
}
