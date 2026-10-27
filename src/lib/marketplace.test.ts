import { describe, expect, it } from 'vitest';
import { allocationErrors, marketplaceWindow, rankTotals, requiredPicks } from './marketplace';

const valid = [200, 300, 400, 500, 600, 700, 2300].map((amount, i) => ({ target: `t${i}`, amount }));

describe('marketplaceWindow', () => {
  it('is open for the whole marketplace phase and closed in every other', () => {
    expect(marketplaceWindow(6)).toBe('open');
    expect(marketplaceWindow(5)).toBe('closed');
    expect(marketplaceWindow(7)).toBe('closed');
    expect(marketplaceWindow(null)).toBe('closed');
  });
});

describe('requiredPicks', () => {
  it('is 7, or all available when fewer', () => {
    expect(requiredPicks(12)).toBe(7);
    expect(requiredPicks(3)).toBe(3);
  });
});

describe('allocationErrors', () => {
  it('accepts a valid allocation', () => {
    expect(allocationErrors(valid, 7)).toEqual([]);
  });

  it('flags wrong count, bad amounts, repeats, and wrong totals', () => {
    expect(allocationErrors(valid.slice(0, 6), 7)[0]).toMatch(/exactly 7/);
    expect(allocationErrors(valid.map((v, i) => (i === 0 ? { ...v, amount: 150 } : v)), 7).join()).toMatch(/at least ₹200/);
    expect(allocationErrors(valid.map((v, i) => (i === 0 ? { ...v, amount: 250 } : v)), 7).join()).toMatch(/multiple of ₹100/);
    expect(allocationErrors(valid.map((v, i) => (i === 1 ? { ...v, amount: 200 } : v)), 7).join()).toMatch(/different/);
    expect(allocationErrors(valid.map((v, i) => (i === 6 ? { ...v, amount: 2400 } : v)), 7).join()).toMatch(/₹5,100/);
  });

  it('works for fewer than 7 picks', () => {
    expect(allocationErrors([{ target: 'a', amount: 5000 }], 1)).toEqual([]);
  });
});

describe('rankTotals', () => {
  it('sorts by total and shares ranks on ties', () => {
    const ranked = rankTotals([
      { team: 'A', total: 100 },
      { team: 'B', total: 900 },
      { team: 'C', total: 500 },
      { team: 'D', total: 500 },
      { team: 'E', total: 0 },
    ]);
    expect(ranked.map((r) => `${r.team}${r.rank}`)).toEqual(['B1', 'C2', 'D2', 'A4', 'E5']);
  });
});
