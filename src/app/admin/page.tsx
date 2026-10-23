import { ActionForm } from '@/components/ActionForm';
import { formatParticipantId } from '@/lib/security';
import { requireAdmin } from '@/server/auth';
import { getActiveMemberships, getDiscoveryStatus, getSwipes } from '@/server/queries';
import { db } from '@/server/supabase';
import { AdminHeader } from './AdminHeader';
import { createParticipant, resetParticipantCode, setDiscovery } from './actions';

export default async function AdminPage() {
  await requireAdmin();
  const [{ data: participants, error }, status, swipes, active] = await Promise.all([
    db().from('participants').select('id, number, display_name, phone, profile_complete').order('number'),
    getDiscoveryStatus(),
    getSwipes(),
    getActiveMemberships(),
  ]);
  if (error) throw error;

  const progress = new Map<string, { seen: number; total: number }>();
  for (const s of swipes) {
    const p = progress.get(s.viewerId) ?? { seen: 0, total: 0 };
    p.total++;
    if (s.direction) p.seen++;
    progress.set(s.viewerId, p);
  }
  const incomplete = participants.filter((p) => !p.profile_complete);

  return (
    <main className="admin">
      <AdminHeader />

      <section>
        <h2>Matchmaking: {status.replace('_', ' ')}</h2>
        {status === 'not_started' && (
          <>
            {incomplete.length > 0 && (
              <p className="warn">
                {incomplete.length} incomplete profile(s) will be left out of matchmaking:{' '}
                {incomplete.map((p) => formatParticipantId(p.number)).join(', ')}
              </p>
            )}
            <ActionForm
              action={setDiscovery}
              submitLabel="Open matchmaking"
              confirmText={`Open matchmaking? All profiles lock now and swipe decks are built.${incomplete.length ? ` ${incomplete.length} incomplete profile(s) will be left out.` : ''}`}
            >
              <input type="hidden" name="status" value="open" />
            </ActionForm>
          </>
        )}
        {status === 'open' && (
          <ActionForm action={setDiscovery} submitLabel="Close matchmaking" confirmText="Close matchmaking? Swiping stops for everyone.">
            <input type="hidden" name="status" value="closed" />
          </ActionForm>
        )}
        {status === 'closed' && (
          <ActionForm action={setDiscovery} submitLabel="Reopen matchmaking" confirmText="Reopen matchmaking? Participants can swipe on their remaining cards.">
            <input type="hidden" name="status" value="open" />
          </ActionForm>
        )}
      </section>

      <section>
        <h2>Participants ({participants.length})</h2>
        <ActionForm action={createParticipant} submitLabel="Add participant">
          <label>
            Name
            <input name="displayName" required maxLength={80} />
          </label>
        </ActionForm>

        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Name</th>
              <th>Phone</th>
              <th>Profile</th>
              <th>Swiped</th>
              <th>Team</th>
              <th>Login code</th>
            </tr>
          </thead>
          <tbody>
            {participants.map((p) => {
              const swiped = progress.get(p.id);
              return (
                <tr key={p.id}>
                  <td>{formatParticipantId(p.number)}</td>
                  <td>{p.display_name}</td>
                  <td>{p.phone ?? '—'}</td>
                  <td>{p.profile_complete ? 'Complete' : <span className="warn">Incomplete</span>}</td>
                  <td>{swiped ? `${swiped.seen}/${swiped.total}` : '—'}</td>
                  <td>{active.has(p.id) ? 'In team' : '—'}</td>
                  <td>
                    <ActionForm
                      action={resetParticipantCode}
                      submitLabel="Reset code"
                      confirmText={`Reset ${formatParticipantId(p.number)}'s code? Their old code stops working and they are logged out.`}
                    >
                      <input type="hidden" name="id" value={p.id} />
                    </ActionForm>
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
