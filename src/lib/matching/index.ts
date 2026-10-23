// Global team matching (spec §6). Pure: no DB, HTTP or UI. See docs/matching-algorithm.md.
import blossom from 'edmonds-blossom-fixed';

export const ALGORITHM_VERSION = 'blossom-maxcard-v1';

export type Swipe = {
  viewerId: string;
  viewedId: string;
  direction: 'right' | 'left' | null;
  rank: number;
};

export type Pair = {
  a: string; // smaller id
  b: string; // larger id
  rankAB: number;
  rankBA: number;
  score: number;
};

export type MatchResult = {
  teams: Pair[];
  totalScore: number;
  unassigned: string[];
};

// Plain code-unit order: never locale-dependent, so results don't change between machines.
const cmp = (x: string, y: string) => (x < y ? -1 : x > y ? 1 : 0);

// Every mutual right-swipe between the given participants, sorted by (a, b).
export function mutualPairs(participantIds: string[], swipes: Swipe[]): Pair[] {
  const ids = new Set(participantIds);
  const right = new Map<string, Map<string, number>>();
  for (const s of swipes) {
    if (s.direction !== 'right' || s.viewerId === s.viewedId || !ids.has(s.viewerId) || !ids.has(s.viewedId)) continue;
    if (!right.has(s.viewerId)) right.set(s.viewerId, new Map());
    right.get(s.viewerId)!.set(s.viewedId, s.rank);
  }

  const pairs: Pair[] = [];
  for (const [a, targets] of right) {
    for (const [b, rankAB] of targets) {
      const rankBA = right.get(b)?.get(a);
      if (a < b && rankBA !== undefined) pairs.push({ a, b, rankAB, rankBA, score: rankAB * rankBA });
    }
  }
  return pairs.sort((x, y) => cmp(x.a, y.a) || cmp(x.b, y.b));
}

// Max number of teams first, then min total score. Inputs are sorted before solving,
// so the result never depends on database row order.
export function runMatching(participantIds: string[], swipes: Swipe[]): MatchResult {
  const ids = [...new Set(participantIds)].sort(cmp);
  const index = new Map(ids.map((id, i) => [id, i]));
  const pairs = mutualPairs(ids, swipes);

  const teams: Pair[] = [];
  if (pairs.length) {
    // Blossom maximises weight; with max-cardinality on, weight = (maxScore + 1) - score
    // makes "max weight among max-size matchings" equal "min total score".
    const maxScore = Math.max(...pairs.map((p) => p.score));
    const mate = blossom(
      pairs.map((p) => [index.get(p.a)!, index.get(p.b)!, maxScore + 1 - p.score]),
      true,
    );
    for (const p of pairs) if (mate[index.get(p.a)!] === index.get(p.b)) teams.push(p);
  }

  const matched = new Set(teams.flatMap((t) => [t.a, t.b]));
  return {
    teams,
    totalScore: teams.reduce((sum, t) => sum + t.score, 0),
    unassigned: ids.filter((id) => !matched.has(id)),
  };
}
