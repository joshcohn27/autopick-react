import { useAutopick } from './hooks/useAutopick';
import { TopBar } from './components/TopBar';
import { ClockPanel } from './components/ClockPanel';
import { SuggestionPanel } from './components/SuggestionPanel';
import { OverridePanel } from './components/OverridePanel';
import { TradeNotesPanel } from './components/TradeNotesPanel';

export default function App() {
  const {
    drafting, setDrafting,
    status, errorMessage, lastFetchAt,
    banner, dismissBanner,
    refreshOnce,
    overrideTeam, setOverrideTeam,
    onClock, activeTeamIndex, draftComplete,
    suggestion,
    tradeNotes
  } = useAutopick();

  return (
    <div className={drafting ? 'is-drafting' : ''}>
      {banner && (
        <div className="banner" role="status" onClick={dismissBanner}>
          {banner}
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

      <main className="board">
        <ClockPanel
          onClock={onClock}
          activeTeamIndex={activeTeamIndex}
          overrideActive={overrideTeam !== null}
          draftComplete={draftComplete}
        />

        <TradeNotesPanel notes={tradeNotes} />

        {!draftComplete && <SuggestionPanel suggestion={suggestion} />}

        <OverridePanel overrideTeam={overrideTeam} onChange={setOverrideTeam} />
      </main>
    </div>
  );
}
