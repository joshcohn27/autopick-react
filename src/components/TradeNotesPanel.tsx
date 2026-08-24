interface Props {
  notes: string[];
}

// Always visible (not tucked in a <details>, unlike the override control) —
// this is safety information, not an optional action. Column ownership in
// the grid isn't reliable once trades happen, so anyone drafting should see
// this every time, not just when something looks off.
export function TradeNotesPanel({ notes }: Props) {
  if (notes.length === 0) return null;

  return (
    <section className="trade-notes-panel">
      <div className="eyebrow">Known pick trades — verify before trusting the team above</div>
      <ul>
        {notes.map((note, i) => (
          <li key={i}>{note}</li>
        ))}
      </ul>
    </section>
  );
}
