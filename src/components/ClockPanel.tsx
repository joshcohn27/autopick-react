import { CONFIG } from '../config';
import type { OnClock } from '../types';

interface Props {
  onClock: OnClock | null;
  activeTeamIndex: number | null;
  overrideActive: boolean;
  draftComplete: boolean;
}

export function ClockPanel({ onClock, activeTeamIndex, overrideActive, draftComplete }: Props) {
  if (draftComplete) {
    return (
      <section className="clock-panel">
        <div className="eyebrow">Every round is filled</div>
        <div className="on-clock">Draft complete</div>
      </section>
    );
  }

  const teamName = activeTeamIndex !== null ? CONFIG.TEAMS[activeTeamIndex] : '—';
  const meta = overrideActive
    ? 'Manual selection'
    : onClock
      ? `Round ${onClock.round} · Pick ${onClock.pickNumber}`
      : '—';

  return (
    <section className="clock-panel">
      <div className="eyebrow">{meta}</div>
      <div className="on-clock">{teamName}</div>
    </section>
  );
}
