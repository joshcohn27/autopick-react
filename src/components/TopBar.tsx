interface Props {
  drafting: boolean;
  onToggleDrafting: (on: boolean) => void;
  onPullOnce: () => void;
  status: 'idle' | 'loading' | 'ok' | 'error';
  errorMessage: string | null;
  lastFetchAt: number | null;
}

// e.g. "8/24/2026 5:01PM" -- no leading zeros on month/day/hour, no space
// before AM/PM, to match how you'd casually write it.
function formatTimestamp(ms: number): string {
  const d = new Date(ms);
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const year = d.getFullYear();
  let hours = d.getHours();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  if (hours === 0) hours = 12;
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${month}/${day}/${year} ${hours}:${minutes}${ampm}`;
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
