import { describe, expect, test } from 'vitest';
import { allocateGoals, monthsCovered, monthsToReach } from './savings';
import type { SavingsGoal } from './types';

const g = (o: Partial<SavingsGoal>): SavingsGoal => ({ id: o.name!, name: 'x', kind: 'custom', target_minor: null, account_id: 's1', priority: 1, icon: 'piggy', ...o });
const goals = [g({ name: 'Summer trip', priority: 2, target_minor: 40_000_000 }), g({ name: 'Emergency fund', kind: 'emergency', priority: 1 })];

describe('allocateGoals', () => {
  test('emergency fills first', () => expect(allocateGoals(goals, { s1: 124_000_000 }, 228_000_000).map((p) => [p.goal.name, p.savedMinor, p.targetMinor]))
    .toEqual([['Emergency fund', 124_000_000, 228_000_000], ['Summer trip', 0, 40_000_000]]));
  test('overflow goes to the next goal', () => expect(allocateGoals(goals, { s1: 250_000_000 }, 228_000_000)[1].savedMinor).toBe(22_000_000));
  test('missing or negative balance is 0', () => {
    expect(allocateGoals(goals, {}, 228_000_000)[0].savedMinor).toBe(0);
    expect(allocateGoals(goals, { s1: -5 }, 228_000_000)[0].savedMinor).toBe(0);
  });
  test('zero target gives ratio 0', () => expect(allocateGoals(goals, { s1: 1 }, 0)[0].ratio).toBe(0));
});

describe('monthsCovered / monthsToReach', () => {
  test('months covered', () => { expect(monthsCovered(124_000_000, 38_000_000)).toBe(3.3); expect(monthsCovered(1, 0)).toBeNull(); });
  test('months to reach', () => { expect(monthsToReach(104_000_000, 10_000_000)).toBe(11); expect(monthsToReach(0, 1)).toBe(0); expect(monthsToReach(5, 0)).toBeNull(); });
});
