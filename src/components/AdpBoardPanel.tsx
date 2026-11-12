import { useMemo, useState } from 'react';
import type { AdpBoardEntry } from '../lib/adp';

type PositionFilter = AdpBoardEntry['position'] | 'ALL';

const POSITION_FILTERS: PositionFilter[] = ['ALL', 'QB', 'RB', 'WR', 'TE', 'K', 'DST'];

// This is plain ADP -- who's going in what order league-wide, same as
// scrolling the player pool in a Sleeper/ESPN draft room. It does NOT know
// your roster needs, unlike the Autopick suggestion above. The two can and
// will disagree on purpose -- Autopick might suggest a QB you need even
// though three WRs are sitting higher on this list.
export function AdpBoardPanel({ entries }: { entries: AdpBoardEntry[] }) {
  const [search, setSearch] = useState('');
  const [positionFilter, setPositionFilter] = useState<PositionFilter>('ALL');

  // Client-side over the full entries prop, whatever its current size --
  // adp.ts no longer caps the board itself, so search/position narrow it
  // down here.
  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return entries.filter(e => {
      const matchesPosition = positionFilter === 'ALL' || e.position === positionFilter;
      const matchesSearch = !needle || e.player.toLowerCase().includes(needle);
      return matchesPosition && matchesSearch;
    });
  }, [entries, search, positionFilter]);

  if (entries.length === 0) return null;

  return (
    <section className="adp-board-panel">
      <div className="eyebrow">Available players by Average Draft Position (ADP)</div>
      <div className="note adp-board-note">
        ADP Board from ESPN
      </div>

      <div className="adp-board-controls">
        <input
          type="text"
          placeholder="Search players…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <div className="adp-board-filters">
          {POSITION_FILTERS.map(pos => (
            <button
              key={pos}
              type="button"
              className={`tab-btn${positionFilter === pos ? ' is-active' : ''}`}
              onClick={() => setPositionFilter(pos)}
            >
              {pos === 'ALL' ? 'All' : pos}
            </button>
          ))}
        </div>
      </div>

      {/* scrolls on its own (max-height in index.css) so the page doesn't get huge */}
      <div className="adp-board-list">
        {filtered.length === 0 ? (
          <div className="empty-state">No players match your search.</div>
        ) : (
          filtered.map((e, i) => (
            <div className="adp-board-row" key={`${e.player}-${i}`}>
              <span className="adp-board-rank">{i + 1}</span>
              <span className={`pos-tag pos-${e.position}`}>{e.position}</span>
              <span className="adp-board-name">
                {e.player}
                {e.nflTeam ? ` · ${e.nflTeam}` : ''}
              </span>
              <span className="backup-rank">{e.adp.toFixed(1)}</span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
