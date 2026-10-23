// Top-7 qualification (spec §10 as decided by the organiser, see docs/open-questions.md 18–19). Pure.
//
// - Only teams with counted investment (> ₹0) can qualify.
// - Places are shared by equal totals: 900, 800, 800, 700 → places 1, 2, 2, 3.
// - Whole places are taken from the top while they fit in 7 seats; lower places drop out.
// - A tie at 7th place that doesn't fit: all those teams are out, nobody is promoted.
// - A tie at a higher place that doesn't fit: the admin chooses which tied teams go through.

export const SEATS = 7;

export type Total = { teamId: string; total: number };
export type Placed = Total & { place: number };

export type Qualification = {
  finalists: Placed[]; // certain finalists, in rank order
  tied: Placed[]; // only when the admin must choose
  seatsLeft: number; // seats the tied teams compete for
  note: string | null;
};

const cmp = (x: string, y: string) => (x < y ? -1 : x > y ? 1 : 0);

export function qualify(rows: Total[]): Qualification {
  const eligible = rows.filter((r) => r.total > 0).sort((a, b) => b.total - a.total || cmp(a.teamId, b.teamId));

  const groups: Placed[][] = [];
  for (const r of eligible) {
    const last = groups.at(-1);
    if (last && last[0].total === r.total) last.push({ ...r, place: last[0].place });
    else groups.push([{ ...r, place: groups.length + 1 }]);
  }

  const finalists: Placed[] = [];
  for (const group of groups) {
    if (finalists.length + group.length <= SEATS) {
      finalists.push(...group);
      continue;
    }
    if (finalists.length === SEATS) break;
    if (group[0].place === SEATS) {
      return {
        finalists,
        tied: [],
        seatsLeft: 0,
        note: `${group.length} teams tied at 7th place: all of them are out and nobody is promoted, so ${finalists.length} teams pitch.`,
      };
    }
    return {
      finalists,
      tied: group,
      seatsLeft: SEATS - finalists.length,
      note: `${group.length} teams are tied at place ${group[0].place} for ${SEATS - finalists.length} remaining seat(s). Choose who goes through.`,
    };
  }

  const zero = rows.length - eligible.length;
  return {
    finalists,
    tied: [],
    seatsLeft: 0,
    note:
      eligible.length < SEATS
        ? `Only ${eligible.length} team(s) received counted investment, so only they pitch.${zero ? ` ${zero} team(s) with ₹0 are out.` : ''}`
        : null,
  };
}
