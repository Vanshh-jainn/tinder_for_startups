# Matching Algorithm

Source of truth: [spec.md §6](spec.md#6-required-matching-algorithm). This document explains how to implement it. If the two disagree, the spec wins. Report the conflict; do not fix it silently.

## Problem

- **Vertices:** participants who are eligible for matching, meaning they have no active team membership.
- **Edges:** pairs where A swiped right on B **and** B swiped right on A. Nothing else is an edge.
- **Edge cost:** `PairScore = Rank(A→B) × Rank(B→A)`. Lower is better.
- **Goal, in strict priority order:**
  1. Maximise the number of teams, which is the matching cardinality.
  2. Among all maximum-cardinality matchings, minimise the total `PairScore`.
  3. Break remaining ties deterministically (see [Tie-breaking](#tie-breaking)).

"Suggestion rank" is the card's position in the participant's random deck, built when matchmaking first opens ([OQ-33](open-questions.md), resolved). The algorithm only needs an integer rank ≥ 1 per swipe.

## Why not greedy or Hungarian

- **Greedy loses teams.** Edges A–B (1), A–C (5), B–D (5). Greedy takes the cheapest edge, A–B, which leaves C and D with no partner, so it forms **1 team**. The optimum is A–C + B–D: **2 teams**, score 10. The spec forbids greedy.
- **Hungarian / assignment needs two sides.** Participants are not split into two groups; anyone can pair with anyone. The graph is *general* and can contain odd cycles (A–B–C). Bipartite algorithms give wrong answers here.

## Algorithm

Use **Edmonds' weighted blossom algorithm** (O(n³)) in **max-cardinality mode**.

Weight transform, because blossom implementations *maximise* weight:

```
S_max   = max PairScore over all edges
w(edge) = (S_max + 1) − PairScore(edge)     // always ≥ 1
```

With max-cardinality mode on, the solver first fixes the largest possible team count `k`, then maximises the total weight among matchings of size `k`. Total weight is `k·(S_max+1) − totalScore`, and `k` is fixed, so maximum weight means minimum total score. That is exactly priorities 1 and 2.

All values are integers, so there is no floating-point error.

**Implementation:** npm `edmonds-blossom-fixed` (MIT), a JS port of Joris van Rantwijk's `mwmatching` with max-cardinality support. The `-fixed` fork removes accidental global variables from the original port. Before adoption it matched a brute-force optimum on 3,000 random graphs; the oracle test in the suite keeps checking it.

## Module boundary

The matching code is a **pure function**: no DB, no HTTP, no UI imports. Location: [src/lib/matching/index.ts](../src/lib/matching/index.ts), tests in `matching.test.ts` next to it.

```ts
type Swipe = {
  viewerId: string;
  viewedId: string;
  direction: 'right' | 'left' | null; // null = card not swiped yet
  rank: number; // integer ≥ 1, unique per viewer
};

type ProposedTeam = {
  a: string;      // smaller ID of the pair
  b: string;      // larger ID of the pair
  rankAB: number; // Rank(a → b)
  rankBA: number; // Rank(b → a)
  score: number;  // rankAB × rankBA
};

type MatchResult = {
  teams: ProposedTeam[]; // sorted by (a, b)
  totalScore: number;
  unassigned: string[];  // sorted
};

function runMatching(participantIds: string[], swipes: Swipe[]): MatchResult;
```

Steps:

1. Sort `participantIds`. Index vertices by sorted position.
2. Build edges only from mutual right-swipes between IDs in the input set. Ignore self-swipes and swipes involving unknown IDs. The DB should already block them; the module still must not trust input.
3. Sort edges by `(a, b)`.
4. Run the blossom solver with the weight transform above.
5. Map the result back to IDs and sort the output.

The caller (admin server action `runMatchingAction`) loads the data, calls `runMatching`, and passes the result to the SQL function `save_matching_run`, which in one transaction:

- marks any still-pending proposals `superseded`;
- re-checks every pair against `swipes` (mutual right, same ranks, same score) and aborts otherwise;
- stores a `matching_runs` row (admin, time, algorithm version, team count, total score, unassigned list);
- stores one team per pair: both ranks, pair score, run ID, `formation_source = 'algorithm'`, `approval_state = 'proposed'`;
- writes the audit row.

## Worked example (from spec)

| Pair | Score |
|---|---:|
| A–B | 10 |
| A–C | 12 |
| B–C | 15 |
| D–E | 8 |
| D–F | 11 |
| E–F | 14 |

There are two disjoint triangles. Each triangle can give at most 1 team, so the maximum cardinality is 2. The cheapest pair in each triangle is A–B (10) and D–E (8). **Result: A–B, D–E, total 18. Unassigned: C, F.**

## Tie-breaking

Two different needs:

1. **Determinism (build now).** The same input must give the same output whatever order the database returns rows in. Steps 1, 3, and 5 above sort everything by stable participant ID before and after solving, and the solver is deterministic. That meets the spec requirement "results must not depend on database processing order".
2. **A human-explainable tie rule (open, [OQ-7](open-questions.md)).** When two different matchings have the same team count and the same total score, which one should win? The spec asks for a rule but does not give one. Do **not** pick one in code. Possible candidates for organisers (not adopted):
   - prefer the matching whose sorted list of pair scores is lexicographically smallest (favours one very strong pair);
   - prefer the matching with the smallest maximum pair score (favours balance).

   Either can be done by perturbing weights or by a post-pass. Implement only after the organisers approve.

## Edge cases

- No mutual swipes: zero teams, and everyone is unassigned.
- Disconnected groups: handled naturally; the solver works across components.
- Odd number of eligible participants: at least one is always unassigned. See [OQ-36](open-questions.md).
- Participants already in an active team (approved or manual) are excluded from the input.
- Rerun with unchanged data: identical output.
- Manual admin teams are never written into `matching_runs` results and never relabelled as algorithmic.

## Required tests

From [spec.md §17](spec.md#17-required-tests), plus an oracle:

- Only mutual right-swipes become edges (one-sided right, right+left, and left+left all excluded).
- Spec worked example gives A–B, D–E, total 18, unassigned C and F.
- Greedy counterexample above gives 2 teams, not 1.
- Each participant appears in at most one team.
- **Determinism:** shuffle the swipe and participant input order 50 times; the output is identical every time.
- Unassigned participants are reported.
- Manual override teams do not change stored run records (DB test in `supabase/db.test.ts`).
- **Brute-force oracle:** for random graphs with ≤ 10 vertices, enumerate every matching, take the best `(max cardinality, min total score)`, and assert the solver matches it on both values.
