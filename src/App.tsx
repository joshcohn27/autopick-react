import { useEffect, useState } from 'react';
import type { MouseEvent } from 'react';
import { useAutopick } from './hooks/useAutopick';
import { TopBar } from './components/TopBar';
import { DraftStatusPanel } from './components/DraftStatusPanel';
import { OverridePanel } from './components/OverridePanel';
import { TradeNotesPanel } from './components/TradeNotesPanel';
import { AdpBoardPanel } from './components/AdpBoardPanel';
import { RostersPanel } from './components/RostersPanel';
import { PickOwnershipPanel } from './components/PickOwnershipPanel';
import { WelcomeModal } from './components/WelcomeModal';
import { hasSeenWelcome, markWelcomeSeen } from './lib/welcome';
import { CONFIG } from './config';
import { TABS, tabFromPath } from './lib/routes';
import type { Tab } from './lib/routes';

export default function App() {
  const [tab, setTab] = useState<Tab>(() => tabFromPath(window.location.pathname));

  // keeps the back/forward buttons in sync with the tab
  useEffect(() => {
    function onPopState() {
      setTab(tabFromPath(window.location.pathname));
    }
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  function goToTab(e: MouseEvent<HTMLAnchorElement>, next: Tab, path: string) {
    // let ctrl/cmd/shift-click open a new tab like a normal link
    const isModifiedClick = e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0;
    if (isModifiedClick) {
      return;
    }
    e.preventDefault();
    window.history.pushState(null, '', path);
    setTab(next);
  }
  // Lazy initializer so localStorage is only read once, on mount -- not on
  // every render.
  const [showWelcome, setShowWelcome] = useState(() => !hasSeenWelcome());

  function dismissWelcome() {
    markWelcomeSeen();
    setShowWelcome(false);
  }

  const {
    drafting, setDrafting,
    status, errorMessage, lastFetchAt,
    banner, dismissBanner,
    refreshOnce,
    teams,
    overrideTeam, setOverrideTeam,
    onClock, activeTeamIndex, viaTeamIndex, draftComplete,
    tradeLogError,
    markerConflicts,
    suggestion,
    tradeNotes,
    adpBoard,
    rosters
  } = useAutopick();

  return (
    <div className={drafting ? 'is-drafting' : ''}>
      {CONFIG.DRAFT_ACTIVE && showWelcome && <WelcomeModal onDismiss={dismissWelcome} />}

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
        {TABS.map(t => (
          <a
            key={t.tab}
            href={t.path}
            className={tab === t.tab ? 'is-active' : ''}
            aria-current={tab === t.tab ? 'page' : undefined}
            onClick={e => goToTab(e, t.tab, t.path)}
          >
            {t.label}
          </a>
        ))}
      </nav>

      {!CONFIG.DRAFT_ACTIVE && tab !== 'picks' && (
        <main>
          <section>
            <p>Draft not active yet, in season.</p>
          </section>
        </main>
      )}

      {CONFIG.DRAFT_ACTIVE && tab === 'draft' && (
        <main>
          <DraftStatusPanel
            teams={teams}
            onClock={onClock}
            activeTeamIndex={activeTeamIndex}
            viaTeamIndex={viaTeamIndex}
            overrideActive={overrideTeam !== null}
            draftComplete={draftComplete}
            suggestion={suggestion}
          />

          {tradeLogError && (
            <div className="trade-notes-panel">
              Couldn't load the {CONFIG.TRADE_LOG_TAB} tab, so traded picks aren't applied. Use the override below if a
              pick was traded.
            </div>
          )}

          {markerConflicts.length > 0 && (
            <section className="trade-notes-panel">
              <div className="eyebrow">Board markers that don't match the {CONFIG.TRADE_LOG_TAB} tab (using the Trades tab)</div>
              <ul>
                {markerConflicts.map(c => (
                  <li key={c.address}>
                    {c.address} ({teams[c.columnTeamIndex]}, round {c.round}) says {teams[c.markerTeamIndex]}, but the
                    Trades tab says {teams[c.ownerTeamIndex]}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <TradeNotesPanel notes={tradeNotes} />

          <OverridePanel teams={teams} overrideTeam={overrideTeam} onChange={setOverrideTeam} />

          <AdpBoardPanel entries={adpBoard} />
        </main>
      )}

      {CONFIG.DRAFT_ACTIVE && tab === 'rosters' && (
        <main>
          <RostersPanel rosters={rosters} />
        </main>
      )}

      {tab === 'picks' && (
        <main>
          <PickOwnershipPanel teams={teams} />
        </main>
      )}
    </div>
  );
}
