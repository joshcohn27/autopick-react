import { useCallback, useEffect, useRef, useState } from 'react';
import { CONFIG } from '../config';
import { fetchSheetData } from '../lib/sheets';
import {
  parseDraftGrid, parseRankings, parseTeamNames, gridSignature,
  analyzeGrid, computeSuggestion, parseTradeNotes, draftedNameSet, buildTeamRoster
} from '../lib/draft';
import { computeAdpBoard } from '../lib/adp';
import type { AdpBoardEntry } from '../lib/adp';
import type { DraftCell, OnClock, Pick, RankingsByPosition, Suggestion, TeamRoster } from '../types';

type FetchStatus = 'idle' | 'loading' | 'ok' | 'error';

export function useAutopick() {
  const [drafting, setDraftingState] = useState(false);
  const [status, setStatus] = useState<FetchStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastFetchAt, setLastFetchAt] = useState<number | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [overrideTeam, setOverrideTeam] = useState<number | null>(null);

  const [teams, setTeams] = useState<string[]>(CONFIG.TEAMS);
  const [grid, setGrid] = useState<(DraftCell | null)[][] | null>(null);
  const [rankings, setRankings] = useState<RankingsByPosition | null>(null);
  const [tradeNotes, setTradeNotes] = useState<string[]>([]);

  const pollHandle = useRef<number | null>(null);
  const lastSignature = useRef<string | null>(null);
  const lastChangeAt = useRef<number | null>(null);
  // Mirror `drafting` into a ref so the interval callback (captured once)
  // always reads the current value instead of a stale closure.
  const draftingRef = useRef(drafting);
  draftingRef.current = drafting;

  const refreshOnce = useCallback(async () => {
    setStatus('loading');
    try {
      const { draftValues, rankingValues, tradeValues } = await fetchSheetData();
      // Team names come live from the sheet's own header row every fetch —
      // never hardcoded — so a rename in the sheet shows up automatically.
      const liveTeams = parseTeamNames(draftValues[0]);
      const rounds = parseDraftGrid(draftValues, liveTeams);
      const parsedRankings = parseRankings(rankingValues);

      setTeams(liveTeams);
      setGrid(rounds);
      setRankings(parsedRankings);
      setTradeNotes(parseTradeNotes(tradeValues));
      setLastFetchAt(Date.now());
      setStatus('ok');
      setErrorMessage(null);

      const sig = gridSignature(rounds);
      if (lastSignature.current === null || sig !== lastSignature.current) {
        lastChangeAt.current = Date.now();
        lastSignature.current = sig;
      }

      if (draftingRef.current && lastChangeAt.current !== null) {
        const idleFor = Date.now() - lastChangeAt.current;
        if (idleFor > CONFIG.AUTO_OFF_AFTER_MS) {
          stopPolling();
          setDraftingState(false);
          setBanner('Auto-paused. No picks entered in the last 10 minutes. Flip Drafting back on when the draft resumes.');
        }
      }
    } catch (err) {
      setStatus('error');
      setErrorMessage(err instanceof Error ? err.message : String(err));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function stopPolling() {
    if (pollHandle.current !== null) {
      window.clearInterval(pollHandle.current);
      pollHandle.current = null;
    }
  }

  const setDrafting = useCallback((on: boolean) => {
    setDraftingState(on);
    setBanner(null);
    if (on) {
      if (lastChangeAt.current === null) lastChangeAt.current = Date.now();
      refreshOnce();
      pollHandle.current = window.setInterval(refreshOnce, CONFIG.POLL_INTERVAL_MS);
    } else {
      stopPolling();
    }
  }, [refreshOnce]);

  // Initial load on mount, regardless of the toggle.
  useEffect(() => {
    refreshOnce();
    return () => stopPolling();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Derived draft state
  let onClock: OnClock | null = null;
  let picks: Pick[] = [];
  if (grid) {
    const analyzed = analyzeGrid(grid);
    onClock = analyzed.onClock;
    picks = analyzed.picks;
  }

  const activeTeamIndex = overrideTeam !== null ? overrideTeam : onClock ? onClock.teamIndex : null;

  let suggestion: Suggestion | null = null;
  if (rankings && activeTeamIndex !== null) {
    suggestion = computeSuggestion(activeTeamIndex, picks, rankings);
  }

  // Straight ADP board (not roster-aware) for reference, same as scrolling
  // the player pool in a Sleeper/ESPN draft room. Always available once
  // we've fetched at least once, regardless of whose turn it is.
  const adpBoard: AdpBoardEntry[] = grid ? computeAdpBoard(draftedNameSet(picks)) : [];

  // Full roster (starters + bench) per team, for the Rosters tab. One entry
  // per team in `teams` order, each built from that team's own picks sorted
  // into round order (picks is already produced in round order by
  // analyzeGrid, but sorting here doesn't depend on that staying true).
  const rosters: TeamRoster[] = teams.map((teamName, teamIndex) => {
    const teamPicks = picks
      .filter(p => p.teamIndex === teamIndex)
      .sort((a, b) => a.round - b.round);
    const { starters, bench, unassigned } = buildTeamRoster(teamPicks);
    return { teamName, starters, bench, unassigned };
  });

  return {
    drafting,
    setDrafting,
    status,
    errorMessage,
    lastFetchAt,
    banner,
    dismissBanner: () => setBanner(null),
    refreshOnce,
    teams,
    overrideTeam,
    setOverrideTeam,
    onClock,
    activeTeamIndex,
    draftComplete: grid !== null && onClock === null && overrideTeam === null,
    suggestion,
    tradeNotes,
    adpBoard,
    picks,
    rosters
  };
}
