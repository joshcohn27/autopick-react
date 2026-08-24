import { CONFIG } from '../config';

interface Props {
  overrideTeam: number | null;
  onChange: (teamIndex: number | null) => void;
}

export function OverridePanel({ overrideTeam, onChange }: Props) {
  return (
    <section className="override-panel">
      <details>
        <summary>Pick was traded? Override the team on the clock</summary>
        <div className="override-controls">
          <select
            value={overrideTeam ?? ''}
            onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))}
          >
            <option value="">— Auto-detected —</option>
            {CONFIG.TEAMS.map((t, i) => (
              <option key={t} value={i}>{t}</option>
            ))}
          </select>
          <button className="btn-ghost" onClick={() => onChange(null)}>
            Clear override
          </button>
        </div>
      </details>
    </section>
  );
}
