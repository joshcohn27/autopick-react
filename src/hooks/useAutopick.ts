import { useCallback, useEffect, useRef, useState } from 'react';
import { CONFIG } from '../config';
import { fetchDraftHeaderRow, fetchSheetData } from '../lib/sheets';
import {
  parseDraftGrid, parseRankings, parseTeamNames, gridSignature,
  analyzeGrid, computeSuggestion, parseTradeNotes, draftedNameSet, buildTeamRoster,
  countRemainingPicks, resolveOnClockTeam, parseMarkerGrid, findMarkerConflicts
} from '../lib/draft';
import type { MarkerConflict } from '../lib/draft';
import { buildPickOwnership, parseTradeRows, pickOwnerLookup } from '../lib/pickOwnership';
import type { PickTrade } from '../lib/pickOwnership';
import { computeAdpBoard } from '../lib/adp';
import type { AdpBoardEntry } from '../lib/adp';
import type { DraftCell, OnClock, Pick, PickOwnerLookup, RankingsByPosition, Suggestion, TeamRoster } from '../types';

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
  const [markerGrid, setMarkerGrid] = useState<(number | null)[][]>([]);
  const [rankings, setRankings] = useState<RankingsByPosition | null>(null);
  const [tradeNotes, setTradeNotes] = useState<string[]>([]);
  // null when the trades tab couldn't load
  const [tradeLogRows, setTradeLogRows] = useState<unknown[][] | null>([]);
  const [tradeLogError, setTradeLogError] = useState<string | null>(null);

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
      const { draftValues, rankingValues, tradeValues, tradeLogValues, tradeLogError: logError } = await fetchSheetData();
      // Team names come live from the sheet's own header row every fetch —
      // never hardcoded — so a rename in the sheet shows up automatically.
      const liveTeams = parseTeamNames(draftValues[0]);
      const rounds = parseDraftGrid(draftValues, liveTeams);
      const parsedRankings = parseRankings(rankingValues);

      setTeams(liveTeams);
      setGrid(rounds);
      setMarkerGrid(parseMarkerGrid(draftValues, liveTeams));
      setRankings(parsedRankings);
      setTradeNotes(parseTradeNotes(tradeValues));
      setTradeLogRows(tradeLogValues);
      setTradeLogError(logError);
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
    if (!CONFIG.DRAFT_ACTIVE) {
      // off-season: only grab team names, and if that fails the
      // CONFIG.TEAMS fallback is already in state
      fetchDraftHeaderRow()
        .then(headerRow => setTeams(parseTeamNames(headerRow)))
        .catch(() => undefined);
      return;
    }
    refreshOnce();
    return () => stopPolling();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Derived draft state. without the trades tab, ownership falls back to
  // the column each pick sits in (the old behavior).
  let trades: PickTrade[] | null = null;
  let ownerOf: PickOwnerLookup | undefined;
  if (tradeLogRows) {
    trades = parseTradeRows(tradeLogRows, teams, CONFIG.TOTAL_ROUNDS).trades;
    ownerOf = pickOwnerLookup(teams, CONFIG.DRAFT_YEAR, trades);
  }

  let onClock: OnClock | null = null;
  let picks: Pick[] = [];
  if (grid) {
    const analyzed = analyzeGrid(grid, ownerOf);
    onClock = analyzed.onClock;
    picks = analyzed.picks;
  }

  const onClockTeam = resolveOnClockTeam(onClock, overrideTeam, ownerOf);

  let markerConflicts: MarkerConflict[] = [];
  if (ownerOf) {
    markerConflicts = findMarkerConflicts(markerGrid, ownerOf);
  }
  const activeTeamIndex = onClockTeam.teamIndex;

  let suggestion: Suggestion | null = null;
  if (rankings && activeTeamIndex !== null) {
    // The anti-reach guardrail needs to know the current round/overall pick
    // number. onClock is normally where that comes from; it can be null
    // while a suggestion is still requested -- e.g. a manual override
    // selected after the auto-detected draft state already reads as
    // complete. Round 16 + Infinity makes maxAllowedGap(16) return null (no
    // cap), so the guardrail goes inert rather than gating against a
    // meaningless pick number.
    const round = onClock ? onClock.round : 16;
    const pickNumber = onClock ? onClock.pickNumber : Infinity;
    const remainingPicks = remainingPicksFor(activeTeamIndex, teams, grid, trades);
    suggestion = computeSuggestion(activeTeamIndex, picks, rankings, round, pickNumber, remainingPicks);
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
    viaTeamIndex: onClockTeam.viaTeamIndex,
    tradeLogError,
    markerConflicts,
    draftComplete: grid !== null && onClock === null && overrideTeam === null,
    suggestion,
    tradeNotes,
    adpBoard,
    picks,
    rosters
  };
}

// picks this team still has to make this draft, from pick ownership (trades
// tab on top of everyone owning their own) and which of those cells are
// still blank. always at least 1, since the team is picking right now.
// undefined (one pick per round) when the trades tab didn't load.
function remainingPicksFor(
  teamIndex: number,
  teams: string[],
  grid: (DraftCell | null)[][] | null,
  trades: PickTrade[] | null
): number | undefined {
  if (!grid || !trades) {
    return undefined;
  }

  const ownership = buildPickOwnership(teams, CONFIG.TOTAL_ROUNDS, CONFIG.DRAFT_YEAR, trades);
  const teamCard = ownership.find(card => card.team === teams[teamIndex]);
  if (!teamCard) {
    return undefined;
  }

  const ownedPicks = teamCard.owned.map(pick => ({
    round: pick.round,
    teamIndex: teams.indexOf(pick.originalTeam)
  }));
  const remaining = countRemainingPicks(grid, ownedPicks);
  return Math.max(remaining, 1);
}
