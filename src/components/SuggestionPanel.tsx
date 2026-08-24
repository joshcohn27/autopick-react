import type { Suggestion } from '../types';

function positionLabel(pos: string) {
  return pos === 'UNKNOWN' ? '?' : pos;
}

export function SuggestionPanel({ suggestion }: { suggestion: Suggestion | null }) {
  return (
    <section className="suggestion-panel">
      <div className="eyebrow">Autopick would be</div>
      {renderBody(suggestion)}
    </section>
  );
}

function renderBody(suggestion: Suggestion | null) {
  if (!suggestion) {
    return <div className="empty-state">Waiting for data…</div>;
  }

  if (suggestion.kind === 'rosterFull') {
    return <div className="empty-state">This roster (including bench) is already full.</div>;
  }

  if (suggestion.kind === 'noCandidates') {
    return (
      <div className="empty-state">
        No available players found for the open slot(s): {Object.keys(suggestion.openSlotSummary).join(', ')}.
        Check the rankings tab is filled in.
      </div>
    );
  }

  const { primary, others, openSlotSummary, multiPosition } = suggestion;
  const slotsLine = Object.entries(openSlotSummary).map(([n, c]) => `${n} \u00d7${c}`).join(' · ');
  const backups = [
    ...primary.backups.map(b => ({ ...b, position: primary.position })),
    ...others
  ].slice(0, 5);

  return (
    <>
      <div className="slots-line">Open slots — {slotsLine}</div>

      <div className="rec-card">
        <div className={`rec-pos pos-${primary.position}`}>{positionLabel(primary.position)}</div>
        <div className="rec-body">
          <div className="rec-name">{primary.player}</div>
          <div className="rec-meta">
            {primary.nflTeam || ''} · Position rank #{primary.rank} of {primary.totalAtPosition} · fills {primary.slotName}
          </div>
        </div>
      </div>

      {multiPosition && (
        <div className="note">
          Multiple positions were eligible for this slot — ranked by how deep each player is into their
          own position's list, since ranks aren't on one shared scale. Runners-up below.
        </div>
      )}

      {backups.length > 0 && (
        <>
          <div className="backups-label">Other options</div>
          <div className="backups">
            {backups.map((b, i) => (
              <div className="backup-row" key={`${b.player}-${i}`}>
                <span className={`pos-tag pos-${b.position}`}>{positionLabel(b.position)}</span>
                <span>{b.player}</span>
                <span className="backup-rank">#{b.rank}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
