# Autopick — setup

React + TypeScript, built with Vite. Reads your Google Sheet directly from
the browser and never writes anything back to it.

```
src/
  config.ts              tabs, columns, roster, team list — edit this
  types.ts                shared types
  lib/
    draft.ts               all the parsing + slot-assignment logic (pure functions)
    draft.test.ts          vitest suite covering it
    sheets.ts               Google Sheets API fetch
  hooks/
    useAutopick.ts          polling / auto-off / state orchestration
  components/
    TopBar.tsx, ClockPanel.tsx, SuggestionPanel.tsx, OverridePanel.tsx
  App.tsx
```

## 1. Share the sheet
File → Share → change to "Anyone with the link" → Viewer.

## 2. Get a Google Sheets API key
1. In the [Google Cloud Console](https://console.cloud.google.com/), create
   a project (or reuse one).
2. APIs & Services → Library → enable **Google Sheets API**.
3. APIs & Services → Credentials → Create Credentials → API key.
4. Click into the key → **Application restrictions** → HTTP referrers →
   add `https://autopick.joshbcohn.com/*`.
5. **API restrictions** → restrict to Google Sheets API only.

## 3. Configure
```
cp .env.example .env.local
```
Fill in `.env.local`:
```
VITE_SHEETS_API_KEY=your-key
VITE_SPREADSHEET_ID=your-sheet-id   # the long string in the sheet's URL between /d/ and /edit
```
`.env.local` is gitignored — never commit it.

Then check `src/config.ts` — `DRAFT_TAB`, `RANKINGS_TAB`, and the column
letters were set from what I saw in your upload; give them a quick eyeball
against your actual 2026 tabs before draft day.

## 4. Run it
```
npm install
npm run dev        # local dev server
npm test           # run the logic test suite
npm run build      # production build -> dist/
```

## 5. Deploy
Push to whatever's hosting your other `*.joshbcohn.com` sites (Vercel and
Netlify both auto-detect Vite). Set the two `VITE_*` env vars in that
platform's dashboard — same names as `.env.local`. Point the `autopick`
subdomain at it.

## How it behaves live
- **Drafting toggle OFF** (default): no network calls at all.
- **Drafting toggle ON**: polls every 7 seconds. If the sheet goes 10
  straight minutes without a change, it flips itself back off and shows a
  banner.
- **Pull once**: a single fetch regardless of the toggle.
- **Trade override**: the "Pick was traded?" dropdown lets you manually
  point the suggestion at the real team when the grid's column doesn't
  reflect who actually owns that pick. Local only — never touches the sheet.

## Known limitation, on purpose
Your rankings tab is six separate per-position lists, not one universal
big board. That's a non-issue most of the time — a team's next need is
almost always one specific position. It only gets ambiguous once a team's
dedicated slots are full and it's down to FLEX or bench, where multiple
positions are eligible. There, the site compares each position's best
remaining player by how far into their own list they are (e.g. RB #3 of
150 vs. WR #5 of 198) and picks the better percentile — it labels this
explicitly on screen and shows the runner-up positions right below so
whoever's drafting can overrule it in two seconds.

## Trade notes
Column ownership in the draft grid isn't reliable once picks get traded —
e.g. Brad and Guppy swapped picks last season, so a pick sitting in Brad's
column may actually be Guppy's. The site reads whatever's in the sheet's
"Traded Draft Picks" section (`TRADES_RANGE` in `config.ts`, defaults to
`S15:S40` on the 2026 Draft tab) and always displays it on screen — not
tucked away, since it's safety information rather than an optional action.
It's just read as free text; the site never tries to auto-resolve who
really owns a slot from it. Use the "Pick was traded?" override for that.
