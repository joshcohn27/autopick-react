import { CONFIG } from '../config';
import { formatTimestamp } from '../lib/time';

interface Props {
  drafting: boolean;
  onToggleDrafting: (on: boolean) => void;
  onPullOnce: () => void;
  status: 'idle' | 'loading' | 'ok' | 'error';
  errorMessage: string | null;
  lastFetchAt: number | null;
}

export function TopBar({ drafting, onToggleDrafting, onPullOnce, status, errorMessage, lastFetchAt }: Props) {
  // No ticking interval here on purpose -- a fixed timestamp that only
  // changes when a fetch actually happens, instead of a live "Xs ago"
  // counter re-rendering forever in the background.
  let statusText = '-';
  if (status === 'loading') statusText = 'Fetching…';
  else if (status === 'error') statusText = `Error: ${errorMessage}`;
  else if (status === 'ok' && lastFetchAt) statusText = `Updated ${formatTimestamp(lastFetchAt)}`;

  return (
    <header className="topbar">
      <div className="wordmark">
        <span className="wordmark-main">AUTOPICK</span>
        <span className="wordmark-sub">1T8 Dynasty League · {CONFIG.DRAFT_YEAR} Draft</span>
      </div>

      {CONFIG.DRAFT_ACTIVE && (
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
            {' '}Drafting
          </label>
        </div>
      )}
    </header>
  );
}
