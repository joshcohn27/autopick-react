import { useMemo, useState } from 'react';
import { CONFIG } from '../config';
import { useTradeLog } from '../hooks/useTradeLog';
import {
  availableYears, buildPickOwnership, formatOwnedPick, formatTradedAwayPick, parseTradeRows
} from '../lib/pickOwnership';
import type { TeamPickOwnership, TradeRowWarning } from '../lib/pickOwnership';
import { formatTimestamp } from '../lib/time';

interface Props {
  teams: string[];
}

function pickCountLabel(count: number): string {
  if (count === 1) {
    return '1 pick';
  }
  return `${count} picks`;
}

function WarningsPanel({ warnings }: { warnings: TradeRowWarning[] }) {
  if (warnings.length === 0) {
    return null;
  }

  return (
    <section className="trade-notes-panel">
      <div className="eyebrow">Skipped {warnings.length} row(s) in the {CONFIG.TRADE_LOG_TAB} tab</div>
      <ul>
        {warnings.map(warning => (
          <li key={warning.rowNumber}>
            Row {warning.rowNumber}: {warning.reason}
            <span className="pick-ownership-row-text"> ({warning.rowText})</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function TeamCard({ ownership }: { ownership: TeamPickOwnership }) {
  const tradedAwayText = ownership.tradedAway.map(formatTradedAwayPick).join(', ');

  return (
    <section className="roster-card">
      <div className="pick-card-header">
        <span className="roster-card-header">{ownership.team}</span>
        <span className="pick-count">{pickCountLabel(ownership.owned.length)}</span>
      </div>

      {ownership.owned.length === 0 ? (
        <div className="roster-empty pick-list">no picks</div>
      ) : (
        <ul className="pick-list">
          {ownership.owned.map(pick => (
            <li key={`${pick.round}-${pick.originalTeam}`}>
              {formatOwnedPick(pick)}
              {pick.notes && <span className="pick-notes"> {pick.notes}</span>}
            </li>
          ))}
        </ul>
      )}

      {ownership.tradedAway.length > 0 && (
        <div className="pick-traded-away">traded away: {tradedAwayText}</div>
      )}
    </section>
  );
}

export function PickOwnershipPanel({ teams }: Props) {
  const tradeLog = useTradeLog();
  const [year, setYear] = useState(CONFIG.DRAFT_YEAR);

  const parsed = useMemo(
    () => parseTradeRows(tradeLog.rows, teams, CONFIG.TOTAL_ROUNDS),
    [tradeLog.rows, teams]
  );

  const years = availableYears(parsed.trades, CONFIG.DRAFT_YEAR);

  // if the picked year's trades got removed from the sheet, fall back
  let selectedYear = year;
  if (!years.includes(year)) {
    selectedYear = CONFIG.DRAFT_YEAR;
  }

  const ownership = buildPickOwnership(teams, CONFIG.TOTAL_ROUNDS, selectedYear, parsed.trades);

  let statusText = '-';
  if (tradeLog.isRefreshing) {
    statusText = 'Fetching…';
  } else if (tradeLog.lastUpdatedAt !== null) {
    statusText = `Last updated ${formatTimestamp(tradeLog.lastUpdatedAt)}`;
  }

  return (
    <>
      <div className="pick-ownership-controls">
        <label>
          Draft year{' '}
          <select value={selectedYear}onChange={e => setYear(Number(e.target.value))}>
            {years.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </label>
        <div className="controls">
          <div className="status-line">{statusText}</div>
          <button className="btn-ghost" onClick={tradeLog.refresh} disabled={tradeLog.isRefreshing}>
            Refresh
          </button>
        </div>
      </div>

      {tradeLog.errorMessage && (
        <div className="trade-notes-panel">Couldn't load the {CONFIG.TRADE_LOG_TAB} tab: {tradeLog.errorMessage}</div>
      )}

      <WarningsPanel warnings={parsed.warnings} />

      {tradeLog.hasLoaded ? (
        <div className="rosters-grid">
          {ownership.map(team => (
            <TeamCard ownership={team} key={team.team} />
          ))}
        </div>
      ) : (
        <div className="empty-state">Loading trades…</div>
      )}
    </>
  );
}
