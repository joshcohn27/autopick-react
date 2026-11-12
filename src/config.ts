import type { RosterSlotType } from './types';

/**
 * AUTOPICK CONFIG
 * ----------------
 * Everything you're likely to need to change lives in this file.
 * The site never writes to the sheet — read-only, always.
 *
 * API_KEY and SPREADSHEET_ID are read from environment variables so you
 * don't commit them to git. Put them in a `.env.local` file (see .env.example):
 *   VITE_SHEETS_API_KEY=xxxxx
 *   VITE_SPREADSHEET_ID=xxxxx
 */

// the draft year everything keys off of. bump this once a year.
export const DRAFT_YEAR = 2027;

export const CONFIG = {
  // Falls back to process.env so config.ts can also be imported from plain
  // Node scripts (tests, validation scripts) outside of Vite.
  API_KEY: (import.meta.env?.VITE_SHEETS_API_KEY ?? '') as string,
  SPREADSHEET_ID: (import.meta.env?.VITE_SPREADSHEET_ID ?? '') as string,

  DRAFT_YEAR,

  // off during the season. the draft and rosters tabs just say the draft
  // isn't active, and only the team names get read from the draft tab.
  // flip to true once the rankings tab is ready for draft day.
  DRAFT_ACTIVE: false,

  // --- Draft board tab --------------------------------------------
  DRAFT_TAB: `${DRAFT_YEAR} Draft`,
  // sheet row 1 is the "Paid?" row, so the range starts at row 2:
  // row 2 = team names, rows 3-18 = rounds 1-16.
  DRAFT_RANGE: 'A2:O18',
  // Free-text "traded picks" notes living in the same tab (see the
  // "Traded Draft Picks" section, column R in 2027, S in past years). Column
  // ownership in the grid is NOT reliable once trades happen — a pick
  // sitting in Brad's column may actually belong to Guppy, etc. These
  // notes get surfaced on-screen as a standing reminder to check before
  // trusting the auto-detected team.
  TRADES_RANGE: 'R15:R40',
  // Column letters (within DRAFT_RANGE) for each team, in the same
  // left-to-right order they're drafting in round 1.
  TEAM_COLUMNS: ['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O'],
  TEAMS: [
    'Leo L', 'JP', 'Cohn', 'Natalie P', 'Eli P', 'Colby L', 'Steven K',
    'Noah K', 'Eli C', 'Brad K', 'Saul M', 'Guppy', 'Ben N', 'Mitchell H'
  ],
  TOTAL_ROUNDS: 16,
  REVERSE_EVEN_ROUNDS: true,

  // --- Rankings tab -------------------------------------------------
  // Per-position ranked cheat sheets. You maintain this tab yourself;
  // the site just reads whatever's there, top to bottom = best to worst.
  RANKINGS_TAB: `${DRAFT_YEAR} Players Background Eqs`,
  RANKINGS_RANGE: 'P1:U1000',
  RANKINGS_START_COL: 'P', // first column letter in RANKINGS_RANGE
  RANKINGS_COLUMNS: {
    QB: 'P',
    RB: 'Q',
    WR: 'R',
    TE: 'S',
    K: 'T',
    DST: 'U'
  } as Record<string, string>,

  // --- Pick ownership (Trades tab) ---------------------------------
  // one row per pick moving: Year | Round | Original Team | New Owner | Notes.
  // future-year dynasty trades go in this same tab, Year column says which draft.
  TRADE_LOG_TAB: `${DRAFT_YEAR} Trades`,
  TRADE_LOG_RANGE: 'A1:E2000',
  TRADE_LOG_POLL_INTERVAL_MS: 60 * 1000,

  // --- Roster construction ------------------------------------------
  ROSTER_SLOTS: [
    { name: 'QB',    eligible: ['QB'],            count: 1, priority: 1 },
    { name: 'RB',    eligible: ['RB'],             count: 2, priority: 1 },
    { name: 'WR',    eligible: ['WR'],             count: 2, priority: 1 },
    { name: 'TE',    eligible: ['TE'],             count: 1, priority: 1 },
    { name: 'FLEX',  eligible: ['RB', 'WR', 'TE'], count: 1, priority: 2 },
    { name: 'DST',   eligible: ['DST'],            count: 1, priority: 1 },
    { name: 'K',     eligible: ['K'],              count: 1, priority: 1 },
    // K/DST are deliberately excluded here (not 'ANY') -- real leagues
    // stream those off waivers, nobody rosters a backup one. See
    // BENCH_TARGETS in draft.ts for the further QB/RB/WR/TE composition
    // target Autopick suggests toward within this eligible set.
    { name: 'BENCH', eligible: ['QB', 'RB', 'WR', 'TE'], count: 7, priority: 3 }
  ] as RosterSlotType[],

  // --- Late-round rules --------------------------------------------
  // round numbers only, tune these after pasting fresh adp.
  // "allowed" = can show up as an option, "recommended" = preferred over
  // bench players. a team's last spare picks force k/dst no matter what.
  LATE_ROUND_RULES: {
    DST_ALLOWED_ROUND: 12,
    DST_RECOMMENDED_ROUND: 13,
    // k also waits until the team has its dst
    K_ALLOWED_ROUND: 13,
    K_RECOMMENDED_ROUND: 14,
    // backup qbs/tes rank lower on the bench before these rounds
    BACKUP_QB_ROUND: 12,
    BACKUP_TE_ROUND: 14,
    // from this round on, the bench leans rb/wr over qb/te
    UPSIDE_ROUND: 16
  },

  // --- Live behavior --------------------------------------------------
  POLL_INTERVAL_MS: 7000,
  AUTO_OFF_AFTER_MS: 10 * 60 * 1000
};
