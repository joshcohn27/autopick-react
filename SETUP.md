# Autopick — setup

Connecting the app to your own Google Sheet. See [README.md](README.md) for
the project overview, scripts, and file structure.

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

Then check `src/config.ts`. `DRAFT_YEAR` drives the tab names
(`DRAFT_TAB` = "<year> Draft", `RANKINGS_TAB` = "<year> Players Background
Eqs", `TRADE_LOG_TAB` = "<year> Trades"), so a new season is a one-line
change. `DRAFT_RANGE` starts at row 2 because row 1 of the draft tab is the
"Paid?" row; team names are row 2. Give the tab names and column
letters a quick eyeball against the sheet before draft day.

## 4. Run it
```
npm install
npm run dev        # local dev server
npm test           # run the logic test suite
npm run build      # production build -> dist/
```
See [README.md](README.md) for the full script list and deployment notes.

## 5. Deploy
Push to whatever's hosting your other `*.joshbcohn.com` sites (Vercel and
Netlify both auto-detect Vite). Set the two `VITE_*` env vars in that
platform's dashboard — same names as `.env.local`. Point the `autopick`
subdomain at it.

## Trade notes
Column ownership in the draft grid isn't reliable once picks get traded —
e.g. Brad and Guppy swapped picks last season, so a pick sitting in Brad's
column may actually be Guppy's. The site reads whatever's in the sheet's
"Traded Draft Picks" section (`TRADES_RANGE` in `config.ts`, defaults to
`R15:R40` on the current year's Draft tab) and always displays it on screen — not
tucked away, since it's safety information rather than an optional action.
It's just read as free text; the site never tries to auto-resolve who
really owns a slot from it. Use the "Pick was traded?" override for that.

## Pick ownership (Trades tab)
The Pick Ownership tab starts every team with its own pick in every round
and applies trades logged in the "<year> Trades" tab, e.g. `2027 Trades`
(`TRADE_LOG_TAB` in `config.ts`). Future-year picks traded now go in the same
tab with a later Year; when `DRAFT_YEAR` gets bumped, carry those rows over to
the new year's Trades tab. Header row to paste into row 1:

```
Year	Round	Original Team	New Owner	Notes
```

One row = one pick moving, so a 3-pick trade is 3 rows. Rows apply top to
bottom; if the same pick (year + round + original team) shows up again, the
lowest row wins, so a re-flipped pick just gets a new row at the bottom.
Team names have to match the draft tab's row-2 names (case and extra spaces
don't matter). Rows with an unknown team or a bad round/year are skipped and
listed in a warning on the page. The tab refetches every 60 seconds while
open, and a missing or empty Trades tab just shows everyone's own picks.
