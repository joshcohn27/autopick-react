import type { OnClock, Suggestion } from '../types';

function positionLabel(pos: string) {
  return pos === 'UNKNOWN' ? '?' : pos;
}

interface Props {
  teams: string[];
  onClock: OnClock | null;
  activeTeamIndex: number | null;
  overrideActive: boolean;
  draftComplete: boolean;
  suggestion: Suggestion | null;
}

// Merges what used to be two separate bordered cards (ClockPanel and
// SuggestionPanel) into one -- the "autopick would be" side used to nest a
// further bordered/left-accent sub-card around the primary pick, plus a
// hairline divider between each backup row. All of that inner boxing is
// gone; hierarchy now comes from typography and spacing (see index.css's
// .draft-status-panel/.clock-block/.rec-row/.backups rules), not extra
// borders. Every conditional branch from both original components is
// preserved as-is, just laid out flatter.
export function DraftStatusPanel({ teams, onClock, activeTeamIndex, overrideActive, draftComplete, suggestion }: Props) {
  return (
    <section className="draft-status-panel">
      {renderClockBlock(teams, onClock, activeTeamIndex, overrideActive, draftComplete)}
      {!draftComplete && renderSuggestionBlock(suggestion)}
    </section>
  );
}

function renderClockBlock(
  teams: string[],
  onClock: OnClock | null,
  activeTeamIndex: number | null,
  overrideActive: boolean,
  draftComplete: boolean
) {
  if (draftComplete) {
    return (
      <div className="clock-block">
        <div className="eyebrow">Every round is filled</div>
        <div className="on-clock">Draft complete</div>
      </div>
    );
  }

  const teamName = activeTeamIndex !== null ? teams[activeTeamIndex] : '-';
  const meta = overrideActive
    ? 'Manual selection'
    : onClock
      ? `Round ${onClock.round} · Pick ${onClock.pickNumber}`
      : '-';

  return (
    <div className="clock-block">
      <div className="eyebrow">{meta}</div>
      <div className="on-clock">{teamName}</div>
    </div>
  );
}

function renderSuggestionBlock(suggestion: Suggestion | null) {
  return (
    <div className="suggestion-block">
      {renderSuggestionBody(suggestion)}
    </div>
  );
}

function renderSuggestionBody(suggestion: Suggestion | null) {
  if (!suggestion) {
    return (
      <>
        <div className="eyebrow">Autopick would be</div>
        <div className="empty-state">Waiting for data…</div>
      </>
    );
  }

  if (suggestion.kind === 'rosterFull') {
    return (
      <>
        <div className="eyebrow">Autopick would be</div>
        <div className="empty-state">This roster (including bench) is already full.</div>
      </>
    );
  }

  if (suggestion.kind === 'noCandidates') {
    return (
      <>
        <div className="eyebrow">Autopick would be</div>
        <div className="empty-state">
          No available players found for the open slot(s): {Object.keys(suggestion.openSlotSummary).join(', ')}.
          Check the rankings tab is filled in.
        </div>
      </>
    );
  }

  const { primary, others, openSlotSummary, multiPosition, reachFlagged } = suggestion;
  const slotsLine = Object.entries(openSlotSummary).map(([n, c]) => `${n} ×${c}`).join(' · ');
  const backups = [
    ...primary.backups.map(b => ({ ...b, position: primary.position })),
    ...others
  ].slice(0, 5);

  return (
    <>
      {/* Swapped: open-slots line now reads first, "Autopick would be" second. */}
      <div className="slots-line">Open slots: {slotsLine}</div>
      <div className="eyebrow">Autopick would be</div>

      <div className="rec-row">
        <span className={`pos-tag pos-${primary.position}`}>{positionLabel(primary.position)}</span>
        <span className="rec-name">{primary.player}</span>
      </div>
      <div className="rec-meta">
        {primary.nflTeam || ''} · Position rank #{primary.rank} of {primary.totalAtPosition} · fills {primary.slotName}
        {multiPosition && (
          <>
            {' '}· ADP {primary.adp.toFixed(1)}
            {primary.adpSource === 'unranked' ? ' (unranked, fallback value)' : ''}
          </>
        )}
      </div>

      {multiPosition && (
        <div className="note">
          Multiple positions were eligible for this slot, so the top candidate at each was compared by
          blended ADP (ESPN + Sleeper) instead of by depth within its own position's list. Runners-up below.
        </div>
      )}

      {reachFlagged && (
        <div className="note">
          No option satisfied this round's reach limit, so the best available is shown anyway.
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
