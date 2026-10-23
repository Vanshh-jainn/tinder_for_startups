import { ActionForm } from '@/components/ActionForm';
import { PhaseBar } from '@/components/PhaseBar';
import { formatParticipantId } from '@/lib/security';
import { requireTeamMember } from '@/server/auth';
import { getEventState } from '@/server/queries';
import { db } from '@/server/supabase';
import { logout } from '../actions';
import { savePitch } from './actions';

const time = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', timeStyle: 'short' });

export default async function TeamPage() {
  const { teamId } = await requireTeamMember();
  const [teamRes, membersRes, submissionRes, configRes, event] = await Promise.all([
    db().from('teams').select('number, domain').eq('id', teamId).single(),
    db().from('team_members').select('participants(number, display_name)').eq('team_id', teamId).eq('status', 'active'),
    db().from('submissions').select('pitch, updated_by, updated_at').eq('team_id', teamId).maybeSingle(),
    db().from('config').select('google_form_url').single(),
    getEventState(),
  ]);
  for (const res of [teamRes, membersRes, submissionRes, configRes]) if (res.error) throw res.error;
  const team = teamRes.data!;
  const members = membersRes.data!.map((m) => m.participants as unknown as { number: number; display_name: string });
  const submission = submissionRes.data;
  const formUrl = configRes.data!.google_form_url as string | null;
  const canEditPitch = event.phase_idx === 4; // Startup Development only (OQ-32)

  return (
    <main className="narrow">
      <PhaseBar event={event} />
      <header className="row">
        <h1>Team {team.number}</h1>
        <form action={logout}>
          <button type="submit" className="secondary">
            Log out
          </button>
        </form>
      </header>
      <p className="domain">{team.domain}</p>
      <p className="muted">
        {members.map((m) => `${m.display_name} (${formatParticipantId(m.number)})`).join(' & ')}
      </p>

      <section>
        <h2>Submission status</h2>
        <ul className="checklist">
          <li>
            {submission
              ? `✓ Marketplace pitch saved at ${time(submission.updated_at)}${submission.updated_by.startsWith('admin:') ? ' (edited by an organiser)' : ''}`
              : '✗ Marketplace pitch not saved yet'}
          </li>
          <li>Pitch + pitch deck: submit both on the Google Form. The organisers check them there.</li>
        </ul>
        {formUrl ? (
          <a className="button" href={formUrl} target="_blank" rel="noopener noreferrer">
            Open the Google Form
          </a>
        ) : (
          <p className="muted">The organisers haven&apos;t shared the Google Form yet. It appears here when they do.</p>
        )}
      </section>

      <section>
        <h2>Marketplace pitch</h2>
        <p className="muted">
          Your two-line startup pitch. Other teams see only this in the investment marketplace, not your deck.
          Either team member can edit it during Startup Development.
        </p>
        {canEditPitch ? (
          <ActionForm action={savePitch} submitLabel="Save pitch">
            <textarea name="pitch" defaultValue={submission?.pitch ?? ''} maxLength={2000} rows={3} required />
          </ActionForm>
        ) : (
          <>
            {submission && <p className="card">{submission.pitch}</p>}
            <p className="muted">
              {(event.phase_idx ?? 0) < 4
                ? 'Pitch editing opens when Startup Development begins.'
                : 'Pitch editing is closed.'}
            </p>
          </>
        )}
      </section>
    </main>
  );
}
