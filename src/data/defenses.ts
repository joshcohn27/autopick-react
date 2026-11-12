// every nfl defense, in the sheet's naming style ("Houston Texans").
// used to match other spellings like espn's "Texans D/ST" or "HOU DST".
export interface Defense {
  name: string;
  nickname: string;
  abbr: string;
}

export const DEFENSES: Defense[] = [
  { name: 'Arizona Cardinals', nickname: 'Cardinals', abbr: 'ARI' },
  { name: 'Atlanta Falcons', nickname: 'Falcons', abbr: 'ATL' },
  { name: 'Baltimore Ravens', nickname: 'Ravens', abbr: 'BAL' },
  { name: 'Buffalo Bills', nickname: 'Bills', abbr: 'BUF' },
  { name: 'Carolina Panthers', nickname: 'Panthers', abbr: 'CAR' },
  { name: 'Chicago Bears', nickname: 'Bears', abbr: 'CHI' },
  { name: 'Cincinnati Bengals', nickname: 'Bengals', abbr: 'CIN' },
  { name: 'Cleveland Browns', nickname: 'Browns', abbr: 'CLE' },
  { name: 'Dallas Cowboys', nickname: 'Cowboys', abbr: 'DAL' },
  { name: 'Denver Broncos', nickname: 'Broncos', abbr: 'DEN' },
  { name: 'Detroit Lions', nickname: 'Lions', abbr: 'DET' },
  { name: 'Green Bay Packers', nickname: 'Packers', abbr: 'GB' },
  { name: 'Houston Texans', nickname: 'Texans', abbr: 'HOU' },
  { name: 'Indianapolis Colts', nickname: 'Colts', abbr: 'IND' },
  { name: 'Jacksonville Jaguars', nickname: 'Jaguars', abbr: 'JAX' },
  { name: 'Kansas City Chiefs', nickname: 'Chiefs', abbr: 'KC' },
  { name: 'Las Vegas Raiders', nickname: 'Raiders', abbr: 'LV' },
  { name: 'Los Angeles Chargers', nickname: 'Chargers', abbr: 'LAC' },
  { name: 'Los Angeles Rams', nickname: 'Rams', abbr: 'LAR' },
  { name: 'Miami Dolphins', nickname: 'Dolphins', abbr: 'MIA' },
  { name: 'Minnesota Vikings', nickname: 'Vikings', abbr: 'MIN' },
  { name: 'New England Patriots', nickname: 'Patriots', abbr: 'NE' },
  { name: 'New Orleans Saints', nickname: 'Saints', abbr: 'NO' },
  { name: 'New York Giants', nickname: 'Giants', abbr: 'NYG' },
  { name: 'New York Jets', nickname: 'Jets', abbr: 'NYJ' },
  { name: 'Philadelphia Eagles', nickname: 'Eagles', abbr: 'PHI' },
  { name: 'Pittsburgh Steelers', nickname: 'Steelers', abbr: 'PIT' },
  { name: 'San Francisco 49ers', nickname: '49ers', abbr: 'SF' },
  { name: 'Seattle Seahawks', nickname: 'Seahawks', abbr: 'SEA' },
  { name: 'Tampa Bay Buccaneers', nickname: 'Buccaneers', abbr: 'TB' },
  { name: 'Tennessee Titans', nickname: 'Titans', abbr: 'TEN' },
  { name: 'Washington Commanders', nickname: 'Commanders', abbr: 'WSH' }
];

// loose match for the defense label: DST, D/ST, D-ST, D.S.T., D ST, DEF,
// Defense, Defence, any case
export const DEFENSE_LABEL_SOURCE = /d\s*[/\-.]?\s*s\s*\.?\s*t\.?|def\.?|defen[cs]e/.source;

const DEFENSE_LABEL = new RegExp(String.raw`^(?:${DEFENSE_LABEL_SOURCE})$`, 'i');

// a trailing label, after a dash, inside parens, or after a plain space
const TRAILING_DEFENSE_LABEL = new RegExp(String.raw`(?:\s*[-–—]\s*|\s*\(\s*|\s+)(?:${DEFENSE_LABEL_SOURCE})\s*\)?$`, 'i');

export function isDefenseLabel(text: string): boolean {
  return DEFENSE_LABEL.test(text.trim());
}

// other abbreviations sites use for the same teams
const EXTRA_ABBRS: Record<string, string> = {
  JAC: 'JAX',
  WAS: 'WSH',
  LA: 'LAR'
};

function cleanDefenseText(text: string): string {
  return text
    .trim()
    .replace(/\s+/g, ' ')
    .replace(TRAILING_DEFENSE_LABEL, '')
    .trim()
    .toLowerCase();
}

export function findDefense(text: string): Defense | null {
  const cleaned = cleanDefenseText(text);
  if (cleaned === '') {
    return null;
  }

  let abbr = cleaned.toUpperCase();
  const mapped = EXTRA_ABBRS[abbr];
  if (mapped) {
    abbr = mapped;
  }

  const match = DEFENSES.find(d => {
    const byName = d.name.toLowerCase() === cleaned;
    const byNickname = d.nickname.toLowerCase() === cleaned;
    return byName || byNickname || d.abbr === abbr;
  });
  return match ?? null;
}

// the sheet-style name for a defense, or the text unchanged if it isn't one
export function canonicalDefenseName(text: string): string {
  const defense = findDefense(text);
  if (defense) {
    return defense.name;
  }
  return text.trim();
}
