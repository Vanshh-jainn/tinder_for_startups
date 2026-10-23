import { ActionForm } from '@/components/ActionForm';
import { LeaderboardTable } from '@/components/LeaderboardTable';
import { MarketStage } from '@/components/MarketStage';
import { requireAdmin } from '@/server/auth';
import { fetchAll, getEventState, getLeaderboard } from '@/server/queries';
import { db } from '@/server/supabase';
import { AdminHeader } from '../AdminHeader';
import { voidInvestments } from './actions';

type Investment = {
  investor_team_id: string;
  target_team_id: string;
  amount: number;
  confirmed_at: string | null;
  voided_at: string | null;
};

export default async function MarketplacePage() {
  await requireAdmin();
  const [event, board, teamsRes, investments] = await Promise.all([
    getEventState(),
    getLeaderboard(),
    db().from('teams').select('id, number').eq('approval_state', 'approved').order('number'),
    fetchAll<Investment>((from, to) =>
      db()
        .from('investments')
        .select('investor_team_id, target_team_id, amount, confirmed_at, voided_at')
        .order('id')
        .range(from, to),
    ),
  ]);
  if (teamsRes.error) throw teamsRes.error;
  const teams = teamsRes.data;
  const numberOf = new Map(teams.map((t) => [t.id, t.number]));

  const status = (teamId: string) => {
    const mine = investments.filter((i) => i.investor_team_id === teamId);
    const live = mine.filter((i) => !i.voided_at);
    const confirmed = live.filter((i) => i.confirmed_at).length;
    const label =
      live.length === 0
        ? 'No allocation'
        : confirmed === live.length
          ? `Complete ✓ (${live.length}/${live.length})`
          : confirmed > 0
            ? `Confirming ${confirmed}/${live.length}`
            : `Saved, not confirmed (0/${live.length})`;
    return { live, label, voidedBefore: mine.some((i) => i.voided_at) };
  };

  return (
    <main className="admin">
      <AdminHeader />

      <section>
        <h2>
          Investment marketplace · <MarketStage phaseIdx={event.phase_idx} timer={event} serverNow={event.serverNow} />
        </h2>
        <p className="muted">
          First 10 minutes of the phase: teams pick and allocate. After that: confirmation time, no edits. Totals below
          count only fully confirmed teams; participants never see them on their own pages.
        </p>
        <LeaderboardTable board={board} />
      </section>

      <section>
        <h2>Team submissions</h2>
        <table>
          <thead>
            <tr>
              <th>Team</th>
              <th>Status</th>
              <th>Allocation</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {teams.map((t) => {
              const s = status(t.id);
              return (
                <tr key={t.id}>
                  <td>Team {t.number}</td>
                  <td>
                    {s.label}
                    {s.voidedBefore && <span className="badge">voided before</span>}
                  </td>
                  <td>
                    {s.live
                      .map((i) => `T${numberOf.get(i.target_team_id) ?? '?'} ₹${i.amount}${i.confirmed_at ? ' ✓' : ''}`)
                      .join(', ') || '—'}
                  </td>
                  <td>
                    {s.live.length > 0 && (
                      <ActionForm
                        action={voidInvestments}
                        submitLabel="Void"
                        className="secondary-form"
                        confirmText={`Void all of Team ${t.number}'s investments? Totals recalculate; the team can redo them while the marketplace is open.`}
                      >
                        <input type="hidden" name="teamId" value={t.id} />
                      </ActionForm>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </main>
  );
}
