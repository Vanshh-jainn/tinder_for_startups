import { describe, expect, it } from 'vitest';
import { mutualPairs, runMatching, type Swipe } from '.';

const right = (viewerId: string, viewedId: string, rank: number): Swipe => ({ viewerId, viewedId, rank, direction: 'right' });
const left = (viewerId: string, viewedId: string, rank: number): Swipe => ({ viewerId, viewedId, rank, direction: 'left' });
const mutual = (a: string, b: string, rankAB: number, rankBA: number) => [right(a, b, rankAB), right(b, a, rankBA)];

// Seeded RNG so failures are reproducible.
function rng(seed: number) {
  return () => (seed = (seed * 48271) % 2147483647) / 2147483647;
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

describe('runMatching', () => {
  it('solves the spec example: A–B + D–E, total 18', () => {
    // Scores: A–B 10, A–C 12, B–C 15, D–E 8, D–F 11, E–F 14
    const swipes = [
      ...mutual('A', 'B', 2, 5),
      ...mutual('A', 'C', 3, 4),
      ...mutual('B', 'C', 3, 5),
      ...mutual('D', 'E', 2, 4),
      ...mutual('D', 'F', 1, 11),
      ...mutual('E', 'F', 2, 7),
    ];
    const result = runMatching(['A', 'B', 'C', 'D', 'E', 'F'], swipes);
    expect(result.teams.map((t) => `${t.a}-${t.b}`)).toEqual(['A-B', 'D-E']);
    expect(result.teams[0]).toMatchObject({ rankAB: 2, rankBA: 5, score: 10 });
    expect(result.totalScore).toBe(18);
    expect(result.unassigned).toEqual(['C', 'F']);
  });

  it('maximises team count before score (greedy would form only 1 team)', () => {
    const swipes = [...mutual('A', 'B', 1, 1), ...mutual('A', 'C', 5, 1), ...mutual('B', 'D', 5, 1)];
    const result = runMatching(['A', 'B', 'C', 'D'], swipes);
    expect(result.teams.map((t) => `${t.a}-${t.b}`)).toEqual(['A-C', 'B-D']);
    expect(result.totalScore).toBe(10);
  });

  it('only matches mutual right-swipes', () => {
    const swipes = [right('A', 'B', 1), left('B', 'A', 1), right('C', 'D', 1), left('E', 'F', 1), left('F', 'E', 1)];
    const result = runMatching(['A', 'B', 'C', 'D', 'E', 'F'], swipes);
    expect(result.teams).toEqual([]);
    expect(result.unassigned).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
  });

  it('ignores unswiped cards, self-swipes and unknown participants', () => {
    const swipes = [
      { viewerId: 'A', viewedId: 'B', rank: 1, direction: null },
      right('B', 'A', 1),
      right('C', 'C', 1),
      ...mutual('C', 'X', 1, 1),
    ] satisfies Swipe[];
    expect(runMatching(['A', 'B', 'C'], swipes).teams).toEqual([]);
  });

  it('handles nobody swiping', () => {
    expect(runMatching(['B', 'A'], [])).toEqual({ teams: [], totalScore: 0, unassigned: ['A', 'B'] });
  });

  it('is deterministic regardless of input order', () => {
    // Many equal-score options so tie handling is exercised.
    const ids = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'];
    const swipes = ids.flatMap((a, i) => ids.slice(i + 1).flatMap((b) => mutual(a, b, 2, 2)));
    const expected = JSON.stringify(runMatching(ids, swipes));
    const random = rng(7);
    for (let i = 0; i < 50; i++) {
      expect(JSON.stringify(runMatching(shuffle(ids, random), shuffle(swipes, random)))).toBe(expected);
    }
  });

  it('matches a brute-force optimum on random graphs', () => {
    const random = rng(42);
    for (let run = 0; run < 300; run++) {
      const n = 2 + Math.floor(random() * 9);
      const ids = Array.from({ length: n }, (_, i) => `p${i}`);
      const swipes: Swipe[] = [];
      for (const a of ids) {
        const others = shuffle(ids.filter((b) => b !== a), random);
        others.forEach((b, i) => swipes.push({ viewerId: a, viewedId: b, rank: i + 1, direction: random() < 0.5 ? 'right' : 'left' }));
      }

      const pairs = mutualPairs(ids, swipes);
      let best = { count: 0, score: 0 };
      const search = (from: number, used: Set<string>, count: number, score: number) => {
        if (count > best.count || (count === best.count && score < best.score)) best = { count, score };
        for (let i = from; i < pairs.length; i++) {
          const { a, b } = pairs[i];
          if (used.has(a) || used.has(b)) continue;
          search(i + 1, new Set([...used, a, b]), count + 1, score + pairs[i].score);
        }
      };
      search(0, new Set(), 0, 0);

      const result = runMatching(ids, swipes);
      expect({ count: result.teams.length, score: result.totalScore }).toEqual(best);
      const members = result.teams.flatMap((t) => [t.a, t.b]);
      expect(new Set(members).size).toBe(members.length);
      expect(result.unassigned.length).toBe(n - members.length);
    }
  });
});
