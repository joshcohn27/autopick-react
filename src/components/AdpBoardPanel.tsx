import { useMemo, useState, type CSSProperties } from 'react';
import type { AdpBoardEntry } from '../lib/adp';

type PositionFilter = AdpBoardEntry['position'] | 'ALL';

const POSITION_FILTERS: PositionFilter[] = ['ALL', 'QB', 'RB', 'WR', 'TE', 'K', 'DST'];

// Inline styles rather than new index.css rules -- this component's new
// search/filter row is scoped entirely to this file. Values still reference
// the site's existing CSS variables (nothing new introduced), modeled on
// the look of .override-controls select for the input and reusing the
// already-defined .tab-btn/.tab-btn.is-active classes for the filter chips.
const controlsStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  marginBottom: 14
};

const searchInputStyle: CSSProperties = {
  background: 'var(--panel-2)',
  color: 'var(--text)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  padding: '8px 10px',
  fontFamily: 'var(--body)',
  fontSize: 13,
  width: '100%'
};

const filtersStyle: CSSProperties = {
  display: 'flex',
  gap: 6,
  flexWrap: 'wrap'
};

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

      <div style={controlsStyle}>
        <input
          type="text"
          style={searchInputStyle}
          placeholder="Search players…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <div style={filtersStyle}>
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

      {/* Same .adp-board-list scroll container as before (max-height +
          overflow-y: auto in index.css, untouched) -- still applies
          regardless of how many rows the filtered set comes out to. */}
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
