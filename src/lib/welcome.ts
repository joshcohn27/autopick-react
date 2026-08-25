const SEEN_KEY = 'autopick:seenWelcome';

// localStorage can throw (private browsing, storage disabled, etc) -- in
// every case here the safe fallback is "treat it as not seen yet," so the
// worst outcome is the welcome modal reappearing on a later visit, never a
// crash.
export function hasSeenWelcome(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

export function markWelcomeSeen(): void {
  try {
    localStorage.setItem(SEEN_KEY, '1');
  } catch {
    // Nothing to do if storage is unavailable -- it just shows again next visit.
  }
}
