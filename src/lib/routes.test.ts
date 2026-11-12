import { describe, expect, it } from 'vitest';
import { tabFromPath } from './routes';

describe('tabFromPath', () => {
  it('maps each path to its tab', () => {
    expect(tabFromPath('/')).toBe('draft');
    expect(tabFromPath('/rosters')).toBe('rosters');
    expect(tabFromPath('/picks')).toBe('picks');
  });

  it('ignores trailing slashes and case', () => {
    expect(tabFromPath('/picks/')).toBe('picks');
    expect(tabFromPath('/Picks')).toBe('picks');
  });

  it('falls back to the draft tab for anything else', () => {
    expect(tabFromPath('/nope')).toBe('draft');
    expect(tabFromPath('')).toBe('draft');
  });
});
