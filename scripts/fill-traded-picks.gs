// autopick: writes trade markers like "BRAD K: " into the draft board from
// the trades tab. paste into the sheet via extensions > apps script.
// it only ever writes plain values into the board cells (B3:O18), nothing else.
// run it from the sheet (autopick > fill traded picks) or pick fillTradedPicks
// next to the run button in the editor. it's first in the file so it's the default.
// autopick > turn on auto-fill makes it run by itself after every change.

const DRAFT_YEAR = 2027;
const DRAFT_TAB = DRAFT_YEAR + ' Draft';
const TRADES_TAB = DRAFT_YEAR + ' Trades';

const HEADER_ROW = 2;
const FIRST_ROUND_ROW = 3;
const TOTAL_ROUNDS = 16;
const FIRST_TEAM_COLUMN = 2;
const TEAM_COUNT = 14;

// owner value for a pick taken away as a punishment
const PUNISHED = -1;

function fillTradedPicks() {
  fillBoard(false);
}

// quiet = no popup, just the execution log (used by auto-fill)
function fillBoard(quiet) {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) {
    throw new Error('Open this from the draft sheet itself: Extensions > Apps Script inside the sheet.');
  }

  const board = spreadsheet.getSheetByName(DRAFT_TAB);
  if (!board) {
    showResult('No "' + DRAFT_TAB + '" tab found.', quiet);
    return;
  }

  const teamNames = board
    .getRange(HEADER_ROW, FIRST_TEAM_COLUMN, 1, TEAM_COUNT)
    .getDisplayValues()[0]
    .map(name => String(name).trim());
  const teamIndexByName = {};
  teamNames.forEach((name, i) => {
    if (name !== '') {
      teamIndexByName[normalizeName(name)] = i;
    }
  });

  const badRows = [];
  let trades = [];
  const tradesSheet = spreadsheet.getSheetByName(TRADES_TAB);
  if (tradesSheet) {
    trades = tradesSheet.getDataRange().getDisplayValues();
  }
  // the old layout had a year in column A. bail out instead of wiping every marker.
  const hasOldYearColumn = trades.slice(1).some(row => /^\d{4}$/.test(String(row[0]).trim()));
  if (hasOldYearColumn) {
    showResult(
      'Nothing was changed. Column A of "' + TRADES_TAB + '" still has years in it. ' +
      'Change the header to "Type" and each year to "Trade" (or "Punishment"), then run this again.',
      quiet
    );
    return;
  }

  const { owners, punishments } = readOwners(trades, teamNames, teamIndexByName, badRows);

  const cells = board.getRange(FIRST_ROUND_ROW, FIRST_TEAM_COLUMN, TOTAL_ROUNDS, TEAM_COUNT);
  const values = cells.getDisplayValues();
  const formulas = cells.getFormulas();

  const written = [];
  const cleared = [];
  const skipped = [];

  for (let r = 0; r < TOTAL_ROUNDS; r++) {
    for (let c = 0; c < TEAM_COUNT; c++) {
      if (teamNames[c] === '') {
        continue;
      }

      const trimmed = String(values[r][c]).trim();
      const address = columnLetter(FIRST_TEAM_COLUMN + c) + (FIRST_ROUND_ROW + r);
      const label = address + ' (' + teamNames[c] + ', round ' + (r + 1) + ')';
      const owner = owners[r][c];
      const isPunished = owner === PUNISHED;
      const isTraded = !isPunished && owner !== c;

      // only empty, marker-only, or "NO PICK ..." cells are ours to change
      const hasFormula = formulas[r][c] !== '';
      const isScriptText = isMarkerOnly(trimmed, teamIndexByName) || isPunishmentText(trimmed);
      const isOurs = !hasFormula && (trimmed === '' || isScriptText);

      let wanted = '';
      if (isPunished) {
        wanted = punishments[r][c];
      }
      if (isTraded) {
        wanted = markerFor(teamNames[owner]);
      }

      if (isOurs) {
        if (trimmed === wanted.trim()) {
          continue;
        }
        cells.getCell(r + 1, c + 1).setValue(wanted);
        if (wanted === '') {
          cleared.push(label);
        } else {
          written.push(label + ' -> "' + wanted + '"');
        }
        continue;
      }

      // someone typed something here, like a retired player autopicked into a
      // punished slot. only mention it when its marker doesn't match the trades tab.
      if (isPunished) {
        continue;
      }
      const typedOwner = markerTeam(trimmed, teamIndexByName);
      const matches = (isTraded && typedOwner === owner) || (!isTraded && typedOwner === -1);
      if (!matches) {
        let reason = 'has "' + trimmed + '"';
        if (isTraded) {
          reason += ', trades tab says ' + teamNames[owner];
        } else {
          reason += ', trades tab says it is not traded';
        }
        skipped.push(label + ' ' + reason);
      }
    }
  }

  const lines = [];
  lines.push('Wrote ' + written.length + ' marker(s), cleared ' + cleared.length + '.');
  if (written.length > 0) {
    lines.push('', 'Written:', ...written);
  }
  if (cleared.length > 0) {
    lines.push('', 'Cleared:', ...cleared);
  }
  if (skipped.length > 0) {
    lines.push('', 'Left alone (already has something typed in it):', ...skipped);
  }
  if (badRows.length > 0) {
    lines.push('', 'Skipped trade rows in ' + TRADES_TAB + ':', ...badRows);
  }
  if (!tradesSheet) {
    lines.push('', 'No "' + TRADES_TAB + '" tab found, so nothing counts as traded.');
  }
  showResult(lines.join('\n'), quiet);
}

// runs by itself after any change to the sheet once auto-fill is on. rows
// deleted from the trades tab only show up as a "change", not an "edit",
// which is why this is an on-change trigger. a run with nothing to fix writes nothing.
function autoFillTradedPicks() {
  const lock = LockService.getDocumentLock();
  const gotLock = lock.tryLock(20000);
  if (!gotLock) {
    return;
  }
  try {
    fillBoard(true);
  } finally {
    lock.releaseLock();
  }
}

function removeAutoFillTriggers() {
  ScriptApp.getProjectTriggers().forEach(trigger => {
    if (trigger.getHandlerFunction() === 'autoFillTradedPicks') {
      ScriptApp.deleteTrigger(trigger);
    }
  });
}

function turnOnAutoFill() {
  removeAutoFillTriggers();
  ScriptApp.newTrigger('autoFillTradedPicks')
    .forSpreadsheet(SpreadsheetApp.getActiveSpreadsheet())
    .onChange()
    .create();
  fillBoard(true);
  showResult('Auto-fill is on. Trade markers now update by themselves whenever the sheet changes.', false);
}

function turnOffAutoFill() {
  removeAutoFillTriggers();
  showResult('Auto-fill is off. Use Autopick > Fill traded picks to update markers.', false);
}

// popup when run from the sheet's menu. run from the editor there's no popup,
// so the same text goes to the execution log instead.
function showResult(text, quiet) {
  // save the writes now, so they land even while the popup waits for ok
  SpreadsheetApp.flush();
  console.log(text);
  if (quiet) {
    return;
  }
  try {
    const ui = SpreadsheetApp.getUi();
    ui.alert('Fill traded picks', text, ui.ButtonSet.OK);
  } catch (err) {
    console.log('(no popup when run from the editor, see the log above)');
  }
}

function normalizeName(name) {
  return String(name).trim().replace(/\s+/g, ' ').toLowerCase();
}

function columnLetter(column) {
  return String.fromCharCode(64 + column);
}

function markerFor(teamName) {
  return teamName.toUpperCase() + ': ';
}

// the team index named before the colon, or -1. works on "GUPPY: " and "GUPPY: Davante Adams, LAR -WR"
function markerTeam(text, teamIndexByName) {
  const colonIndex = text.indexOf(':');
  if (colonIndex === -1) {
    return -1;
  }
  const prefix = normalizeName(text.slice(0, colonIndex));
  if (prefix in teamIndexByName) {
    return teamIndexByName[prefix];
  }
  return -1;
}

// an all-caps team name, a colon, and nothing else
function isMarkerOnly(text, teamIndexByName) {
  const colonIndex = text.indexOf(':');
  if (colonIndex === -1) {
    return false;
  }
  const prefix = text.slice(0, colonIndex).trim();
  const rest = text.slice(colonIndex + 1).trim();
  if (rest !== '') {
    return false;
  }
  if (prefix !== prefix.toUpperCase()) {
    return false;
  }
  return markerTeam(text, teamIndexByName) !== -1;
}

// a punishment cell the script wrote, like "NO PICK - Punishment"
function isPunishmentText(text) {
  return /^no pick\b/i.test(text);
}

function punishmentText(notes) {
  if (notes === '') {
    return 'NO PICK - Punishment';
  }
  return 'NO PICK - ' + notes;
}

function isWholeNumber(text) {
  return /^\d+$/.test(text);
}

// columns: A Type (Trade or Punishment), B Round, C Original Team,
// D New Owner (blank for a punishment), E Notes.
// owners[round - 1][column] = team index that owns the pick now, or PUNISHED.
// punishments[round - 1][column] = the "NO PICK - ..." text for a punished pick.
function readOwners(trades, teamNames, teamIndexByName, badRows) {
  const owners = [];
  const punishments = [];
  for (let r = 0; r < TOTAL_ROUNDS; r++) {
    owners.push(teamNames.map((name, i) => i));
    punishments.push(teamNames.map(() => ''));
  }

  // row 1 is headers. rows go top to bottom, so the lowest row wins.
  for (let i = 1; i < trades.length; i++) {
    const row = trades[i].map(cell => String(cell).trim());
    const type = (row[0] || '').toLowerCase();
    const round = row[1] || '';
    const original = row[2] || '';
    const newOwner = row[3] || '';
    const notes = row[4] || '';

    const isBlank = row.every(cell => cell === '');
    if (isBlank) {
      continue;
    }

    const problems = [];
    const isTrade = type === 'trade';
    const isPunishment = type === 'punishment';
    if (!isTrade && !isPunishment) {
      problems.push('bad type "' + row[0] + '" (should be Trade or Punishment)');
    }
    const roundNumber = Number(round);
    const roundOk = isWholeNumber(round) && roundNumber >= 1 && roundNumber <= TOTAL_ROUNDS;
    if (!roundOk) {
      problems.push('bad round "' + round + '"');
    }
    if (!(normalizeName(original) in teamIndexByName)) {
      problems.push('unknown original team "' + original + '"');
    }
    if (isTrade && !(normalizeName(newOwner) in teamIndexByName)) {
      problems.push('unknown new owner "' + newOwner + '"');
    }

    if (problems.length > 0) {
      badRows.push('Row ' + (i + 1) + ': ' + problems.join(', '));
      continue;
    }

    const column = teamIndexByName[normalizeName(original)];
    if (isPunishment) {
      owners[roundNumber - 1][column] = PUNISHED;
      punishments[roundNumber - 1][column] = punishmentText(notes);
    } else {
      owners[roundNumber - 1][column] = teamIndexByName[normalizeName(newOwner)];
    }
  }
  return { owners, punishments };
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Autopick')
    .addItem('Fill traded picks', 'fillTradedPicks')
    .addSeparator()
    .addItem('Turn on auto-fill', 'turnOnAutoFill')
    .addItem('Turn off auto-fill', 'turnOffAutoFill')
    .addToUi();
}
