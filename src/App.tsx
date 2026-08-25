import { useState } from 'react';
import { useAutopick } from './hooks/useAutopick';
import { TopBar } from './components/TopBar';
import { DraftStatusPanel } from './components/DraftStatusPanel';
import { OverridePanel } from './components/OverridePanel';
import { TradeNotesPanel } from './components/TradeNotesPanel';
import { AdpBoardPanel } from './components/AdpBoardPanel';
import { RostersPanel } from './components/RostersPanel';

type Tab = 'draft' | 'rosters';

export default function App() {
  const [tab, setTab] = useState<Tab>('draft');
  const {
    drafting, setDrafting,
    status, errorMessage, lastFetchAt,
    banner, dismissBanner,
    refreshOnce,
    teams,
    overrideTeam, setOverrideTeam,
    onClock, activeTeamIndex, draftComplete,
    suggestion,
    tradeNotes,
    adpBoard,
    rosters
  } = useAutopick();

  return (
    <div className={drafting ? 'is-drafting' : ''}>
      {banner && (
        <div className="banner" role="status">
          {banner}
          <button type="button" className="banner-dismiss" onClick={dismissBanner} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}

      <TopBar
        drafting={drafting}
        onToggleDrafting={setDrafting}
        onPullOnce={refreshOnce}
        status={status}
        errorMessage={errorMessage}
        lastFetchAt={lastFetchAt}
      />

      <nav className="tab-nav">
        <button className={`tab-btn${tab === 'draft' ? ' is-active' : ''}`} onClick={() => setTab('draft')}>
          Draft
        </button>
        <button className={`tab-btn${tab === 'rosters' ? ' is-active' : ''}`} onClick={() => setTab('rosters')}>
          Rosters
        </button>
      </nav>

      {tab === 'draft' ? (
        <main className="board">
          <DraftStatusPanel
            teams={teams}
            onClock={onClock}
            activeTeamIndex={activeTeamIndex}
            overrideActive={overrideTeam !== null}
            draftComplete={draftComplete}
            suggestion={suggestion}
          />

          <TradeNotesPanel notes={tradeNotes} />

          <OverridePanel teams={teams} overrideTeam={overrideTeam} onChange={setOverrideTeam} />

          <AdpBoardPanel entries={adpBoard} />
        </main>
      ) : (
        <main className="board board-wide">
          <RostersPanel rosters={rosters} />
        </main>
      )}
    </div>
  );
}
