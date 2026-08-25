# Autopick

A live draft assistant for the 1T8 Dynasty League. It reads the league's
Google Sheet directly from the browser (no backend, no writes) and shows,
in real time during the draft:

- **Who's on the clock** and what round/pick it is
- **What Autopick would draft** for that team, with reasoning and runner-up
  options
- **Known pick trades**, surfaced as a standing reminder since column
  ownership in the sheet isn't reliable once trades happen
- **A manual override** for when the sheet's column doesn't reflect who
  actually owns a pick
- **An ADP board** of available players, filterable by name/position
- **Every team's roster**, split into starters and bench

See [SETUP.md](SETUP.md) for connecting it to your own Google Sheet
(API key, spreadsheet ID, sheet layout).

## Stack

React 19 + TypeScript, built with [Vite](https://vite.dev). Linted with
[Oxlint](https://oxc.rs), tested with [Vitest](https://vitest.dev). No
backend, no database -- all state lives in the browser tab.

## Quick start

```
npm install
cp .env.example .env.local   # then fill in your Sheets API key + spreadsheet ID
npm run dev
```

## Scripts

| Command | Does |
|---|---|
| `npm run dev` | Local dev server with HMR |
| `npm run build` | Type-checks (`tsc -b`) then builds to `dist/` |
| `npm run typecheck` | Type-checks only, no build output |
| `npm run lint` | Runs Oxlint |
| `npm test` | Runs the Vitest suite |
| `npm run preview` | Serves the last production build locally |

## Project structure

```
src/
  config.ts                 tabs, columns, roster slots, team list -- edit this
  types.ts                   shared types
  lib/
    draft.ts                  parsing + slot-assignment + suggestion logic (pure functions)
    draft.test.ts             vitest suite covering it
    roster.test.ts            vitest suite for buildTeamRoster specifically
    adp.ts                     ADP lookup + full board (pure functions)
    adp.test.ts                vitest suite covering it
    sheets.ts                  Google Sheets API fetch
    welcome.ts                  localStorage read/write for the one-time welcome modal
  data/
    adp-data.ts                the ADP dataset itself (see its header comment for provenance)
  hooks/
    useAutopick.ts             polling / auto-off / state orchestration
  components/
    WelcomeModal.tsx            one-time "flip the toggle on" popup (first visit only)
    TopBar.tsx                 status line + drafting toggle + manual pull
    DraftStatusPanel.tsx       on-the-clock + Autopick suggestion
    TradeNotesPanel.tsx        always-visible trade notes
    OverridePanel.tsx          manual "pick was traded" team override
    AdpBoardPanel.tsx          searchable/filterable ADP board
    RostersPanel.tsx           every team's starters + bench
  App.tsx
```

## How it behaves live

- **First visit ever** (per browser, tracked in `localStorage`): a one-time
  popup explains that the Drafting toggle defaults off and has to be
  switched on for anything to update live. Never shown again after it's
  dismissed.
- **Drafting toggle OFF** (default): no network calls at all.
- **Drafting toggle ON**: polls every 7 seconds. If the sheet goes 10
  straight minutes without a change, it flips itself back off and shows a
  dismissable banner.
- **Pull once**: a single fetch regardless of the toggle.
- **Trade override**: the "Pick was traded?" dropdown lets you manually
  point the suggestion at the real team when the grid's column doesn't
  reflect who actually owns that pick. Local only -- never touches the sheet.

## Known limitation, on purpose

Your rankings tab is six separate per-position lists, not one universal
big board. That's a non-issue most of the time -- a team's next need is
almost always one specific position. It only gets ambiguous once a team's
dedicated slots are full and it's down to FLEX or bench, where multiple
positions are eligible. There, the site compares each position's best
remaining player by ADP (not by depth within its own list) and picks the
better one -- it labels this explicitly on screen and shows the runner-up
positions right below so whoever's drafting can overrule it in two seconds.

## Deployment

Any static host that runs a Vite build works (Vercel, Netlify, etc). Set
`VITE_SHEETS_API_KEY` and `VITE_SPREADSHEET_ID` in that platform's env var
dashboard -- same names as `.env.local`. See [SETUP.md](SETUP.md) for
restricting the API key to your domain.
