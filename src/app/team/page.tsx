import { ActionForm } from '@/components/ActionForm';
import { PhaseBar } from '@/components/PhaseBar';
import { MARKETPLACE_PHASE, marketplaceWindow, requiredPicks } from '@/lib/marketplace';
import { formatParticipantId } from '@/lib/security';
import { requireTeamMember } from '@/server/auth';
import { getEventState } from '@/server/queries';
import { db } from '@/server/supabase';
import { logout } from '../actions';
import { savePitch } from './actions';
import { MarketplacePanel } from './MarketplacePanel';

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
    <main className="narrow app">
      <PhaseBar event={event} />
      <header className="row">
        <div>
          <p className="eyebrow">Your startup</p>
          <h1>Team {team.number}</h1>
        </div>
        <form action={logout}>
          <button type="submit" className="secondary">
            Log out
          </button>
        </form>
      </header>
      <div className="panel">
        <p className="eyebrow">Domain</p>
        <p className="domain">{team.domain}</p>
        <ul className="chips">
          {members.map((m) => (
            <li key={m.number}>
              {m.display_name}
              <span className="muted">{formatParticipantId(m.number)}</span>
            </li>
          ))}
        </ul>
      </div>

      <section className="panel">
        <h2>Submission status</h2>
        <ul className="checklist">
          <li className={submission ? 'done' : undefined}>
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

      {(event.phase_idx ?? 0) >= MARKETPLACE_PHASE && (
        <section className="panel">
          <h2>Investment marketplace</h2>
          <Marketplace teamId={teamId} event={event} />
        </section>
      )}

      <section className="panel">
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

async function Marketplace({ teamId, event }: { teamId: string; event: Awaited<ReturnType<typeof getEventState>> }) {
  const [targetsRes, investmentsRes] = await Promise.all([
    db()
      .from('teams')
      .select('id, number, submissions!inner(pitch)')
      .eq('approval_state', 'approved')
      .neq('id', teamId)
      .order('number'),
    db().from('investments').select('target_team_id, amount, confirmed_at, voided_at').eq('investor_team_id', teamId),
  ]);
  for (const res of [targetsRes, investmentsRes]) if (res.error) throw res.error;
  const targets = targetsRes.data!.map((t) => ({
    id: t.id,
    number: t.number,
    pitch: (t.submissions as unknown as { pitch: string }).pitch,
  }));
  const live = investmentsRes.data!.filter((i) => !i.voided_at);

  return (
    <MarketplacePanel
      stage={marketplaceWindow(event.phase_idx, event.market_confirmation)}
      targets={targets}
      saved={live.map((i) => ({ target: i.target_team_id, amount: i.amount, confirmed: !!i.confirmed_at }))}
      required={requiredPicks(targets.length)}
      wasVoided={investmentsRes.data!.some((i) => i.voided_at)}
    />
  );
}
