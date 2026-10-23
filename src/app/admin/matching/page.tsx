import { ActionForm } from '@/components/ActionForm';
import { mutualPairs } from '@/lib/matching';
import { formatParticipantId } from '@/lib/security';
import { requireAdmin } from '@/server/auth';
import { getActiveMemberships, getDiscoveryStatus, getSwipes } from '@/server/queries';
import { db } from '@/server/supabase';
import { AdminHeader } from '../AdminHeader';
import Link from 'next/link';
import { approveTeam, rejectTeam, resetMatchingAction, runMatchingAction } from './actions';

type Team = {
  id: string;
  formation_source: 'algorithm' | 'manual';
  approval_state: 'proposed' | 'approved';
  rank_ab: number | null;
  rank_ba: number | null;
  pair_score: number | null;
  team_members: { participant_id: string }[];
};

export default async function MatchingPage() {
  await requireAdmin();
  const [participantsRes, teamsRes, runRes, status, swipes, active] = await Promise.all([
    db().from('participants').select('id, number, display_name').order('number'),
    db()
      .from('teams')
      .select('id, formation_source, approval_state, rank_ab, rank_ba, pair_score, team_members(participant_id)')
      .in('approval_state', ['proposed', 'approved'])
      .order('created_at'),
    db().from('matching_runs').select('created_at, team_count, total_score, unassigned').order('created_at', { ascending: false }).limit(1).maybeSingle(),
    getDiscoveryStatus(),
    getSwipes(),
    getActiveMemberships(),
  ]);
  for (const res of [participantsRes, teamsRes, runRes]) if (res.error) throw res.error;
  const participants = participantsRes.data!;
  const teams = teamsRes.data as Team[];
  const run = runRes.data;

  const byId = new Map(participants.map((p) => [p.id, p]));
  const label = (id: string) => {
    const p = byId.get(id);
    return p ? `${formatParticipantId(p.number)} ${p.display_name}` : id;
  };
  // Algorithm ranks are stored for the member with the smaller id first.
  const members = (t: Team) => t.team_members.map((m) => m.participant_id).sort();

  const proposed = teams.filter((t) => t.approval_state === 'proposed');
  const approved = teams.filter((t) => t.approval_state === 'approved');
  const proposedKeys = new Set(proposed.map((t) => members(t).join('|')));
  const eligible = participants.filter((p) => !active.has(p.id));
  const pairs = mutualPairs(eligible.map((p) => p.id), swipes);

  return (
    <main className="admin">
      <AdminHeader />

      <section>
        <h2>Global matching</h2>
        {status === 'open' && <p className="warn">Matchmaking is still open; swipes may change the result.</p>}
        <div className="row start">
          <ActionForm
            action={runMatchingAction}
            submitLabel="Run matching"
            confirmText={`Run matching for ${eligible.length} participant(s) not yet in a team? Pending proposals are replaced.`}
          />
          <ActionForm action={resetMatchingAction} submitLabel="Clear proposals" confirmText="Clear all pending proposals?" />
        </div>
        {run && (
          <p className="muted">
            Last run {new Date(run.created_at).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })}: {run.team_count} team(s), total score{' '}
            {run.total_score}. Unassigned: {run.unassigned.length ? run.unassigned.map(label).join(', ') : 'none'}.
          </p>
        )}
      </section>

      <section>
        <h2>Proposed teams ({proposed.length})</h2>
        <table>
          <thead>
            <tr>
              <th>Members</th>
              <th>Ranks</th>
              <th>Score</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {proposed.map((t) => (
              <tr key={t.id}>
                <td>{members(t).map(label).join(' + ')}</td>
                <td>
                  {t.rank_ab} × {t.rank_ba}
                </td>
                <td>{t.pair_score}</td>
                <td className="row start">
                  <ActionForm action={approveTeam} submitLabel="Approve">
                    <input type="hidden" name="teamId" value={t.id} />
                  </ActionForm>
                  <ActionForm action={rejectTeam} submitLabel="Reject" className="secondary-form">
                    <input type="hidden" name="teamId" value={t.id} />
                  </ActionForm>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <p className="muted">
        {approved.length} approved team(s). Manage them on <Link href="/admin/teams">Teams &amp; submissions</Link>.
      </p>

      <section>
        <h2>Eligible pairs ({pairs.length})</h2>
        <p className="muted">Mutual right-swipes between participants not yet in a team. Lower score is a stronger match.</p>
        <table>
          <thead>
            <tr>
              <th>Pair</th>
              <th>Rank A→B</th>
              <th>Rank B→A</th>
              <th>Score</th>
              <th>Proposed</th>
            </tr>
          </thead>
          <tbody>
            {pairs.map((p) => (
              <tr key={`${p.a}|${p.b}`}>
                <td>
                  {label(p.a)} + {label(p.b)}
                </td>
                <td>{p.rankAB}</td>
                <td>{p.rankBA}</td>
                <td>{p.score}</td>
                <td>{proposedKeys.has(`${p.a}|${p.b}`) ? '✓' : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
