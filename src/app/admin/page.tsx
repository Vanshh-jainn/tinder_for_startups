import { ActionForm } from '@/components/ActionForm';
import { formatParticipantId } from '@/lib/security';
import { requireAdmin } from '@/server/auth';
import { db } from '@/server/supabase';
import { logout } from '../actions';
import { createParticipant, resetParticipantCode } from './actions';

export default async function AdminPage() {
  await requireAdmin();
  const { data: participants, error } = await db()
    .from('participants')
    .select('id, number, display_name')
    .order('number');
  if (error) throw error;

  return (
    <main className="admin">
      <header className="row">
        <h1>Admin</h1>
        <form action={logout}>
          <button type="submit">Log out</button>
        </form>
      </header>

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
              <th>Login code</th>
            </tr>
          </thead>
          <tbody>
            {participants.map((p) => (
              <tr key={p.id}>
                <td>{formatParticipantId(p.number)}</td>
                <td>{p.display_name}</td>
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
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
