'use server';

import type { FormState } from '@/components/ActionForm';
import { qualify } from '@/lib/qualification';
import { requireAdmin } from '@/server/auth';
import { adminResult, getLeaderboard, rpc } from '@/server/queries';

// Recomputes the result from counted totals on the server; the admin only chooses among tied teams.
export async function confirmFinalists(_prev: FormState, formData: FormData): Promise<FormState> {
  const adminId = await requireAdmin();
  const chosen = new Set(formData.getAll('tied').map(String));
  const board = await getLeaderboard();
  const result = qualify(board.rows.map((r) => ({ teamId: r.teamId, total: r.total })));
  if ([...chosen].some((id) => !result.tied.some((t) => t.teamId === id))) return { error: 'Pick only from the tied teams.' };

  const finalists = [...result.finalists, ...result.tied.filter((t) => chosen.has(t.teamId))];
  return adminResult(
    await rpc('confirm_finalists', {
      p_admin: adminId,
      p_finalists: finalists.map((f) => ({ team: f.teamId, place: f.place, total: f.total })),
    }),
    `${finalists.length} finalist(s) confirmed. Reveal them one by one below.`,
  );
}

export async function revealNext(): Promise<FormState> {
  const adminId = await requireAdmin();
  return adminResult(await rpc('reveal_next_finalist', { p_admin: adminId }), 'Revealed on the projector.');
}
