// Investment marketplace rules (spec §9). Pure. The SQL functions in the marketplace migration are
// the authority; this mirrors them for live feedback in the browser and for leaderboard ranking.
import { elapsedMs, type TimerState } from './timer';

export const BUDGET = 5000;
export const MIN_AMOUNT = 200;
export const STEP = 100;
export const MAX_PICKS = 7;
export const DECISION_MS = 10 * 60_000; // first 10 min of the phase: pick + allocate
export const MARKETPLACE_PHASE = 6;

export type MarketWindow = 'closed' | 'decision' | 'confirmation';

export function marketplaceWindow(phaseIdx: number | null, t: TimerState, nowMs: number): MarketWindow {
  if (phaseIdx !== MARKETPLACE_PHASE) return 'closed';
  return elapsedMs(t, nowMs) < DECISION_MS ? 'decision' : 'confirmation';
}

// Pick 7, or every available startup if there are fewer (OQ-35).
export function requiredPicks(availableTargets: number): number {
  return Math.min(MAX_PICKS, availableTargets);
}

export type Allocation = { target: string; amount: number }[];

// Every rule the allocation still breaks, in the order a user should fix them.
export function allocationErrors(items: Allocation, required: number): string[] {
  const errors: string[] = [];
  if (items.length !== required) errors.push(`Pick exactly ${required} startup${required === 1 ? '' : 's'}.`);
  if (items.some((i) => !Number.isInteger(i.amount) || i.amount < MIN_AMOUNT || i.amount % STEP !== 0)) {
    errors.push(`Each amount must be at least ₹${MIN_AMOUNT} and a multiple of ₹${STEP}.`);
  }
  if (new Set(items.map((i) => i.amount)).size !== items.length) errors.push('Every amount must be different.');
  const total = items.reduce((sum, i) => sum + (Number.isFinite(i.amount) ? i.amount : 0), 0);
  if (total !== BUDGET) errors.push(`The amounts must add up to exactly ₹5,000 (now ₹${total.toLocaleString('en-IN')}).`);
  return errors;
}

// Standard competition ranking: equal totals share a rank (1, 2, 2, 4).
export function rankTotals<T extends { total: number }>(rows: T[]): (T & { rank: number })[] {
  const sorted = [...rows].sort((a, b) => b.total - a.total);
  return sorted.map((row, i) => ({
    ...row,
    rank: i > 0 && row.total === sorted[i - 1].total ? sorted.findIndex((r) => r.total === row.total) + 1 : i + 1,
  }));
}
