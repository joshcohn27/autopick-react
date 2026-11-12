export type Tab = 'draft' | 'rosters' | 'picks';

export const TABS: { tab: Tab; path: string; label: string }[] = [
  { tab: 'draft', path: '/', label: 'Draft' },
  { tab: 'rosters', path: '/rosters', label: 'Rosters' },
  { tab: 'picks', path: '/picks', label: 'Pick Ownership' }
];

// unknown paths just land on the draft tab
export function tabFromPath(pathname: string): Tab {
  const trimmed = pathname.replace(/\/+$/, '').toLowerCase();
  const match = TABS.find(t => t.path === trimmed);
  if (match) {
    return match.tab;
  }
  return 'draft';
}
