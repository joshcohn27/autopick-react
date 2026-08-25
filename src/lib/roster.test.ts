import { describe, it, expect } from 'vitest';
import { buildTeamRoster } from './draft';
import type { Pick, Position } from '../types';

// CONFIG.ROSTER_SLOTS gives 9 starter slots (QB1 + RB2 + WR2 + TE1 + FLEX1
// + DST1 + K1) and 7 bench slots -- 16 total, matching 16 draft rounds.

function pick(round: number, position: Position, player: string): Pick {
  return {
    round,
    teamIndex: 0,
    pickNumber: round,
    cell: { player, nflTeam: 'AAA', position, raw: `${player}, AAA -${position}` }
  };
}

describe('buildTeamRoster', () => {
  it('splits a partially-filled team into the right starters/open slots', () => {
    const picks: Pick[] = [
      pick(1, 'QB', 'Some QB'),
      pick(2, 'RB', 'Some RB')
    ];

    const { starters, bench, unassigned } = buildTeamRoster(picks);

    expect(starters).toHaveLength(9);
    expect(bench).toHaveLength(7);
    expect(unassigned).toHaveLength(0);

    const qbSlots = starters.filter(s => s.slotName === 'QB');
    expect(qbSlots).toHaveLength(1);
    expect(qbSlots[0].player).toBe('Some QB');

    const rbSlots = starters.filter(s => s.slotName === 'RB');
    expect(rbSlots).toHaveLength(2);
    expect(rbSlots[0].player).toBe('Some RB');
    expect(rbSlots[1].player).toBeNull();

    // Untouched positions stay fully open.
    expect(starters.filter(s => s.slotName === 'WR').every(s => s.player === null)).toBe(true);
    expect(starters.filter(s => s.slotName === 'TE').every(s => s.player === null)).toBe(true);
    expect(starters.filter(s => s.slotName === 'FLEX').every(s => s.player === null)).toBe(true);
    expect(bench.every(s => s.player === null)).toBe(true);
  });

  it('separates starters from bench when there are more bench-eligible picks than starting slots', () => {
    const picks: Pick[] = [
      pick(1, 'QB', 'QB Guy'),
      pick(2, 'RB', 'RB Guy 1'),
      pick(3, 'RB', 'RB Guy 2'),
      pick(4, 'WR', 'WR Guy 1'),
      pick(5, 'WR', 'WR Guy 2'),
      pick(6, 'TE', 'TE Guy'),
      pick(7, 'DST', 'DST Guy'),
      pick(8, 'K', 'K Guy'),
      // 9th starter-eligible pick: dedicated WR slots are already full, so
      // this one flows into FLEX.
      pick(9, 'WR', 'FLEX Guy'),
      // 10 more picks, all bench-eligible ('RB' has no dedicated or FLEX
      // slots left open) -- more than the 7 available bench slots, so 3
      // must land in `unassigned` rather than silently vanish.
      ...Array.from({ length: 10 }, (_, i) => pick(10 + i, 'RB', `Bench Guy ${i + 1}`))
    ];

    const { starters, bench, unassigned } = buildTeamRoster(picks);

    expect(starters).toHaveLength(9);
    expect(starters.every(s => s.player !== null)).toBe(true);
    expect(starters.find(s => s.slotName === 'FLEX')?.player).toBe('FLEX Guy');

    expect(bench).toHaveLength(7);
    expect(bench.every(s => s.player !== null)).toBe(true);
    expect(bench.map(s => s.player)).toEqual([
      'Bench Guy 1', 'Bench Guy 2', 'Bench Guy 3', 'Bench Guy 4',
      'Bench Guy 5', 'Bench Guy 6', 'Bench Guy 7'
    ]);

    expect(unassigned).toHaveLength(3);
    expect(unassigned.map(p => p.cell.player)).toEqual(['Bench Guy 8', 'Bench Guy 9', 'Bench Guy 10']);
  });

  it('returns every slot as an unfilled placeholder for a team with no picks, without erroring', () => {
    const { starters, bench, unassigned } = buildTeamRoster([]);

    expect(starters).toHaveLength(9);
    expect(bench).toHaveLength(7);
    expect(unassigned).toHaveLength(0);

    [...starters, ...bench].forEach(slot => {
      expect(slot.player).toBeNull();
      expect(slot.position).toBeNull();
      expect(slot.nflTeam).toBeNull();
      expect(typeof slot.slotName).toBe('string');
    });
  });
});
