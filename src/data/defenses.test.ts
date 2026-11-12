import { describe, expect, it } from 'vitest';
import { DEFENSES, canonicalDefenseName, findDefense, isDefenseLabel } from './defenses';

describe('defense name matching', () => {
  it('covers all 32 teams with unique names, nicknames and abbreviations', () => {
    expect(DEFENSES).toHaveLength(32);
    expect(new Set(DEFENSES.map(d => d.name)).size).toBe(32);
    expect(new Set(DEFENSES.map(d => d.nickname)).size).toBe(32);
    expect(new Set(DEFENSES.map(d => d.abbr)).size).toBe(32);
  });

  it('matches espn-style "Nickname D/ST" for every team', () => {
    for (const d of DEFENSES) {
      expect(canonicalDefenseName(`${d.nickname} D/ST`)).toBe(d.name);
    }
  });

  it('matches full names, abbreviations and loose labels for every team', () => {
    for (const d of DEFENSES) {
      expect(canonicalDefenseName(d.name)).toBe(d.name);
      expect(canonicalDefenseName(`${d.abbr} DST`)).toBe(d.name);
      expect(canonicalDefenseName(`${d.name.toUpperCase()} - DEF`)).toBe(d.name);
      expect(canonicalDefenseName(`  ${d.nickname.toLowerCase()}   defense `)).toBe(d.name);
    }
  });

  it('knows the other abbreviations sites use', () => {
    expect(findDefense('JAC D/ST')?.name).toBe('Jacksonville Jaguars');
    expect(findDefense('WAS DST')?.name).toBe('Washington Commanders');
  });

  it('leaves non-defense names alone', () => {
    expect(findDefense('Josh Allen')).toBeNull();
    expect(canonicalDefenseName('Josh Allen')).toBe('Josh Allen');
  });

  it('recognizes loose defense labels', () => {
    for (const label of ['DST', 'D/ST', 'd/st', 'D-ST', 'D.S.T.', 'D ST', 'DEF', 'Defense', 'defence']) {
      expect(isDefenseLabel(label), label).toBe(true);
    }
    for (const label of ['RB', 'K', 'TE', 'D', 'DS']) {
      expect(isDefenseLabel(label), label).toBe(false);
    }
  });
});
