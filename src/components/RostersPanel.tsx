import type { RosterSlotView, TeamRoster } from '../types';

function positionLabel(pos: string | null) {
  if (!pos) return '';
  return pos === 'UNKNOWN' ? '?' : pos;
}

function RosterRow({ view }: { view: RosterSlotView }) {
  return (
    <div className="roster-row">
      <span className="roster-slot-name">{view.slotName}</span>
      {view.player ? (
        <>
          <span className="roster-player-name">{view.player}</span>
          <span className={`pos-tag pos-${view.position ?? 'UNKNOWN'}`}>{positionLabel(view.position)}</span>
        </>
      ) : (
        <span className="roster-empty">-</span>
      )}
    </div>
  );
}

// One card per team, all visible at once (a scrollable page, not a
// dropdown) -- this is meant as a during-draft reference for the whole
// table, not just whoever's currently on the clock.
export function RostersPanel({ rosters }: { rosters: TeamRoster[] }) {
  if (rosters.length === 0) {
    return <div className="empty-state">Waiting for data…</div>;
  }

  return (
    <div className="rosters-grid">
      {rosters.map(roster => (
        <section className="roster-card" key={roster.teamName}>
          <div className="roster-card-header">{roster.teamName}</div>

          <div className="roster-group-label">Starters</div>
          <div className="roster-list">
            {roster.starters.map((view, i) => (
              <RosterRow view={view} key={`s-${i}`} />
            ))}
          </div>

          <div className="roster-group-label">Bench</div>
          <div className="roster-list">
            {roster.bench.map((view, i) => (
              <RosterRow view={view} key={`b-${i}`} />
            ))}
          </div>

          {roster.unassigned.length > 0 && (
            <div className="note roster-unassigned-note">
              {roster.unassigned.length} pick(s) didn't fit any roster slot. Check the sheet for a data issue.
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
