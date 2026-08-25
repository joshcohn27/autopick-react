interface Props {
  teams: string[];
  overrideTeam: number | null;
  onChange: (teamIndex: number | null) => void;
}

export function OverridePanel({ teams, overrideTeam, onChange }: Props) {
  return (
    <section className="override-panel">
      <details>
        <summary>Pick was traded? Override the team on the clock</summary>
        <div className="override-controls">
          <select
            value={overrideTeam ?? ''}
            onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))}
          >
            <option value="">Auto-detected</option>
            {teams.map((t, i) => (
              <option key={`${t}-${i}`} value={i}>{t}</option>
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
