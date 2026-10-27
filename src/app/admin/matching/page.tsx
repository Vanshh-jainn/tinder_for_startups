import { ActionForm } from '@/components/ActionForm';
import { mutualPairs } from '@/lib/matching';
import { formatParticipantId } from '@/lib/security';
import { requireAdmin } from '@/server/auth';
import { getActiveMemberships, getDiscoveryStatus, getSwipes } from '@/server/queries';
import { db } from '@/server/supabase';
import { AdminHeader } from '../AdminHeader';
import Link from 'next/link';
import { randomPairingAction, runMatchingAction } from './actions';

export default async function MatchingPage() {
  await requireAdmin();
  const [participantsRes, teamsRes, runRes, status, swipes, active] = await Promise.all([
    db().from('participants').select('id, number, display_name, profile_complete').order('number'),
    db().from('teams').select('id', { count: 'exact', head: true }).eq('approval_state', 'approved'),
    db().from('matching_runs').select('created_at, team_count, total_score, unassigned').order('created_at', { ascending: false }).limit(1).maybeSingle(),
    getDiscoveryStatus(),
    getSwipes(),
    getActiveMemberships(),
  ]);
  for (const res of [participantsRes, teamsRes, runRes]) if (res.error) throw res.error;
  const participants = participantsRes.data!;
  const teamCount = teamsRes.count ?? 0;
  const run = runRes.data;

  const byId = new Map(participants.map((p) => [p.id, p]));
  const label = (id: string) => {
    const p = byId.get(id);
    return p ? `${formatParticipantId(p.number)} ${p.display_name}` : id;
  };
  const eligible = participants.filter((p) => !active.has(p.id));
  const leftover = eligible.filter((p) => p.profile_complete);
  const pairs = mutualPairs(eligible.map((p) => p.id), swipes);

  return (
    <main className="admin">
      <AdminHeader />

      <section>
        <h2>1. Global matching</h2>
        <p className="muted">Each matched pair becomes a team straight away, with a number and a domain.</p>
        {status === 'open' && <p className="warn">Matchmaking is still open; swipes may change the result.</p>}
        <ActionForm
          action={runMatchingAction}
          submitLabel="Run matching"
          confirmText={`Run matching for ${eligible.length} participant(s) not yet in a team? Matched pairs become teams immediately.`}
        />
        {run && (
          <p className="muted">
            Last run {new Date(run.created_at).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })}: {run.team_count} team(s), total score{' '}
            {run.total_score}. Not matched: {run.unassigned.length ? run.unassigned.map(label).join(', ') : 'none'}.
          </p>
        )}
      </section>

      <section>
        <h2>2. Random pairing</h2>
        <p className="muted">
          Pairs everyone with a complete profile who is still not in a team, at random. With an odd number, the last
          person joins a random 2-person team as its 3rd member. Works once Matchmaking has closed.
        </p>
        <p>
          Left over ({leftover.length}): {leftover.length ? leftover.map((p) => label(p.id)).join(', ') : 'nobody'}
        </p>
        <ActionForm
          action={randomPairingAction}
          submitLabel="Random pairing"
          disabled={leftover.length === 0 || status !== 'closed'}
          confirmText={`Pair ${leftover.length} participant(s) at random? This can't be undone (dissolve teams on Teams & submissions if needed).`}
        />
      </section>

      <p className="muted">
        {teamCount} team(s) formed. Manage them on <Link href="/admin/teams">Teams &amp; submissions</Link>.
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
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
