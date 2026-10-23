import { ActionForm } from '@/components/ActionForm';
import { qualify } from '@/lib/qualification';
import { requireAdmin } from '@/server/auth';
import { getEventState, getLeaderboard } from '@/server/queries';
import { db } from '@/server/supabase';
import { AdminHeader } from '../AdminHeader';
import { confirmFinalists, revealNext } from './actions';

export default async function QualificationPage() {
  await requireAdmin();
  const [event, board, confirmedRes] = await Promise.all([
    getEventState(),
    getLeaderboard(),
    db().from('finalists').select('team_id, position, place, total, teams(number)').order('position'),
  ]);
  if (confirmedRes.error) throw confirmedRes.error;

  const numberOf = new Map(board.rows.map((r) => [r.teamId, r.number]));
  const result = qualify(board.rows.map((r) => ({ teamId: r.teamId, total: r.total })));
  const confirmed = confirmedRes.data.map((f) => ({ ...f, number: (f.teams as unknown as { number: number }).number }));
  const canConfirm = (event.phase_idx ?? -1) >= 7;
  const allRevealed = event.revealed_count >= confirmed.length;

  return (
    <main className="admin">
      <AdminHeader />

      <section>
        <h2>Top 7 qualification</h2>
        <p className="muted">
          From counted investment only. Teams with ₹0 are out. Equal totals share a place; whole places are taken from
          the top while they fit in 7 seats. A tie at 7th place drops all those teams (nobody is promoted). A tie at a
          higher place that doesn&apos;t fit is your choice.
        </p>

        <h3>Result from the current totals</h3>
        <table>
          <thead>
            <tr>
              <th>Place</th>
              <th>Team</th>
              <th>Invested</th>
            </tr>
          </thead>
          <tbody>
            {result.finalists.map((f) => (
              <tr key={f.teamId}>
                <td>{f.place}</td>
                <td>Team {numberOf.get(f.teamId)}</td>
                <td>₹{f.total.toLocaleString('en-IN')}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {result.note && <p className="warn">{result.note}</p>}

        {canConfirm ? (
          <ActionForm
            action={confirmFinalists}
            submitLabel={confirmed.length ? 'Confirm again (replaces the current finalists)' : 'Confirm finalists'}
            confirmText="Confirm these finalists? This resets the projector reveal."
          >
            {result.tied.length > 0 && (
              <fieldset>
                <legend>
                  Tied at place {result.tied[0].place} for {result.seatsLeft} seat(s): choose who goes through
                </legend>
                {result.tied.map((t) => (
                  <label key={t.teamId} className="pick">
                    <input type="checkbox" name="tied" value={t.teamId} />
                    Team {numberOf.get(t.teamId)} · ₹{t.total.toLocaleString('en-IN')}
                  </label>
                ))}
              </fieldset>
            )}
          </ActionForm>
        ) : (
          <p className="muted">You can confirm once the marketplace has closed (Break &amp; Top 7 phase).</p>
        )}
      </section>

      <section>
        <h2>Confirmed finalists ({confirmed.length})</h2>
        {confirmed.length === 0 ? (
          <p className="muted">None yet.</p>
        ) : (
          <>
            <ol>
              {confirmed.map((f) => (
                <li key={f.team_id}>
                  Team {f.number} · place {f.place} · ₹{f.total.toLocaleString('en-IN')}
                  {f.position > confirmed.length - event.revealed_count ? ' · revealed' : ''}
                </li>
              ))}
            </ol>
            <p className="muted">
              Revealed {event.revealed_count}/{confirmed.length} on the projector (from the lowest up). The projector
              shows the reveal by default in Break &amp; Top 7.
            </p>
            {!allRevealed && <ActionForm action={revealNext} submitLabel="Reveal next finalist" />}
          </>
        )}
      </section>
    </main>
  );
}
