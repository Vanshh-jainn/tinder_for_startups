import { describe, expect, it } from 'vitest';
import { qualify } from './qualification';

// Totals → rows with ids t1, t2, … in the given order.
const rows = (...totals: number[]) => totals.map((total, i) => ({ teamId: `t${i + 1}`, total }));
const ids = (list: { teamId: string }[]) => list.map((r) => r.teamId);

describe('qualify', () => {
  it('takes the top 7 when there are no ties at the cut', () => {
    const q = qualify(rows(900, 800, 700, 600, 500, 400, 300, 200, 100));
    expect(ids(q.finalists)).toEqual(['t1', 't2', 't3', 't4', 't5', 't6', 't7']);
    expect(q.tied).toEqual([]);
    expect(q.note).toBeNull();
  });

  it('keeps a tie above 7th together and drops the 7th-place team (OQ-18)', () => {
    // places 1, 2, 3, 3, 4, 5, 6, 7 → 8 teams in the top 7 places; place 7 drops
    const q = qualify(rows(900, 800, 700, 700, 600, 500, 400, 300));
    expect(ids(q.finalists)).toEqual(['t1', 't2', 't3', 't4', 't5', 't6', 't7']);
    expect(q.finalists.map((f) => f.place)).toEqual([1, 2, 3, 3, 4, 5, 6]);
  });

  it('drops every team tied at 7th and promotes nobody', () => {
    // places 1–6 clear, two teams tied at place 7, one more below
    const q = qualify(rows(900, 800, 700, 600, 500, 400, 300, 300, 200));
    expect(ids(q.finalists)).toEqual(['t1', 't2', 't3', 't4', 't5', 't6']);
    expect(q.tied).toEqual([]);
    expect(q.note).toMatch(/tied at 7th/);
  });

  it('asks the admin when a tie at a higher place crosses the cut', () => {
    // 5 clear, 3 tied at place 6 for 2 seats
    const q = qualify(rows(900, 800, 700, 600, 500, 400, 400, 400, 100));
    expect(ids(q.finalists)).toEqual(['t1', 't2', 't3', 't4', 't5']);
    expect(ids(q.tied)).toEqual(['t6', 't7', 't8']);
    expect(q.seatsLeft).toBe(2);
  });

  it('never qualifies ₹0 teams, even with seats free (OQ-19)', () => {
    const q = qualify(rows(500, 300, 0, 0, 100));
    expect(ids(q.finalists)).toEqual(['t1', 't2', 't5']);
    expect(q.note).toMatch(/Only 3 team\(s\).*2 team\(s\) with ₹0/);
  });

  it('handles a tie that fills the last seats exactly', () => {
    const q = qualify(rows(900, 800, 700, 600, 500, 400, 400, 100));
    expect(ids(q.finalists)).toEqual(['t1', 't2', 't3', 't4', 't5', 't6', 't7']);
  });

  it('does not depend on input order', () => {
    const input = rows(900, 800, 700, 700, 600, 500, 400, 300);
    expect(qualify([...input].reverse())).toEqual(qualify(input));
  });

  it('handles nobody investing', () => {
    expect(qualify(rows(0, 0)).finalists).toEqual([]);
  });
});
