import { ActionForm } from '@/components/ActionForm';
import { Countdown } from '@/components/Countdown';
import { SCREEN_LABELS, SCREENS, screenFor } from '@/lib/timer';
import { requireAdmin } from '@/server/auth';
import { getEventState } from '@/server/queries';
import { db } from '@/server/supabase';
import { AdminHeader } from '../AdminHeader';
import { resetEvent, setProjectorScreen, startPitch, timerAction, updatePhase } from './actions';

type TimerProps = { action: string; label: string; confirm?: string; minutes?: number };

function Timer({ action, label, confirm, minutes }: TimerProps) {
  return (
    <ActionForm action={timerAction} submitLabel={label} confirmText={confirm}>
      <input type="hidden" name="action" value={action} />
      {minutes && <input type="hidden" name="minutes" value={minutes} />}
    </ActionForm>
  );
}

export default async function EventPage() {
  await requireAdmin();
  const [event, phasesRes, teamsRes, incompleteRes, pitchesRes] = await Promise.all([
    getEventState(),
    db().from('phases').select('idx, name, duration_seconds, rules').order('idx'),
    db().from('finalists').select('team_id, teams(number)').order('position'),
    db().from('participants').select('id', { count: 'exact', head: true }).eq('profile_complete', false),
    db().from('teams').select('id, submissions!inner(team_id)', { count: 'exact', head: true }).eq('approval_state', 'approved'),
  ]);
  for (const res of [phasesRes, teamsRes, incompleteRes, pitchesRes]) if (res.error) throw res.error;
  const phases = phasesRes.data!;
  // Only finalists pitch.
  const teams = teamsRes.data!.map((f) => ({ id: f.team_id, number: (f.teams as unknown as { number: number }).number }));
  const incomplete = incompleteRes.count ?? 0;
  const startups = pitchesRes.count ?? 0; // marketplace targets

  const current = event.phase_idx;
  const next = phases.find((p) => p.idx === (current === null ? 0 : current + 1));
  const running = event.timer_status === 'running';
  const pitchingTeam = teams.find((t) => t.id === event.pitching_team_id);

  const advanceWarning = [
    `Move to "${next?.name}"?`,
    current !== null && 'Participants lose access to the current phase.',
    next?.idx === 2 && 'Matchmaking opens: profiles lock and swipe decks are built.',
    next?.idx === 2 && incomplete > 0 && `${incomplete} incomplete profile(s) will be left out.`,
    current === 2 && 'Swiping closes.',
    next?.idx === 4 && 'Pitch editing opens.',
    current === 4 && 'Pitch editing closes.',
    next?.idx === 6 && 'The marketplace opens: teams invest and lock their allocations.',
    next?.idx === 6 && startups < 8 && `Only ${startups} startup(s) have a pitch, so teams invest in all available instead of 7.`,
    current === 6 && "The marketplace closes. Teams that haven't locked their investments count as zero.",
    next?.idx === 8 && teams.length === 0 && 'No finalists are confirmed yet (Qualification page).',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <main className="admin">
      <AdminHeader />

      <section>
        <h2>
          {current === null ? 'Event not started' : `Phase ${current + 1}/9: ${event.phase_name}`}
          {pitchingTeam && ` · Team ${pitchingTeam.number} on stage`}
        </h2>
        {current !== null && (
          <p className="big-timer">
            <Countdown timer={event} serverNow={event.serverNow} pitch={current === 8 && !!pitchingTeam} />
          </p>
        )}
        <div className="row start">
          {current !== null && !running && <Timer action="start" label={event.timer_status === 'paused' ? 'Resume' : 'Start'} />}
          {running && <Timer action="pause" label="Pause" />}
          {current !== null && (
            <>
              <Timer action="extend" minutes={1} label="+1 min" />
              <Timer action="extend" minutes={5} label="+5 min" />
              <Timer action="reset" label="Reset clock" confirm="Reset this timer to its full duration? Only the clock changes." />
              <Timer action="end" label="End now" confirm="Set this timer to 0 (time's up)? The phase stays the same." />
            </>
          )}
          {next && <Timer action="advance" label={`Advance → ${next.name}`} confirm={advanceWarning} />}
        </div>
      </section>

      {current === 8 && (
        <section>
          <h2>Final pitching</h2>
          <p className="muted">
            Starts a 10-minute timer: 7 min pitch → 2 min Q&amp;A → 1 min scoring rollover. The labels only show time; you
            start the next team whenever you&apos;re ready.
          </p>
          {teams.length === 0 && <p className="warn">No finalists confirmed yet. Confirm them on the Qualification page.</p>}
          <ActionForm
            action={startPitch}
            submitLabel="Start pitch timer"
            confirmText={pitchingTeam ? `Team ${pitchingTeam.number}'s timer will be replaced. Continue?` : undefined}
          >
            <select name="teamId" required defaultValue="">
              <option value="" disabled>
                Choose the finalist on stage
              </option>
              {teams.map((t, i) => (
                <option key={t.id} value={t.id}>
                  #{i + 1} · Team {t.number}
                </option>
              ))}
            </select>
          </ActionForm>
        </section>
      )}

      <section>
        <h2>Projector</h2>
        <p className="muted">
          Showing: <strong>{SCREEN_LABELS[screenFor(current, event.projector_screen)]}</strong>
          {event.projector_screen ? ' (your override)' : ' (follows the phase)'}. The override is cleared when you advance.{' '}
          <a href="/projector" target="_blank" rel="noopener noreferrer">
            Open projector ↗
          </a>
        </p>
        <ActionForm action={setProjectorScreen} submitLabel="Show on projector">
          <select name="screen" defaultValue={event.projector_screen ?? 'follow'}>
            <option value="follow">Follow the phase</option>
            {SCREENS.map((s) => (
              <option key={s} value={s}>
                {SCREEN_LABELS[s]}
              </option>
            ))}
          </select>
        </ActionForm>
      </section>

      <section>
        <h2>Phases &amp; round rules</h2>
        <p className="muted">
          Each line of the rules becomes a bullet on the projector. A duration change applies the next time that phase
          starts; use +1/+5 min for the running one. Final Pitching always runs 10-minute timers per team.
        </p>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Phase</th>
              <th>Minutes · rules</th>
            </tr>
          </thead>
          <tbody>
            {phases.map((p) => (
              <tr key={p.idx} className={p.idx === current ? 'current' : undefined}>
                <td>{p.idx + 1}</td>
                <td>{p.name}</td>
                <td>
                  <ActionForm action={updatePhase} submitLabel="Save">
                    <input type="hidden" name="idx" value={p.idx} />
                    <input name="minutes" type="number" min={1} max={240} defaultValue={p.duration_seconds / 60} required />
                    <textarea name="rules" defaultValue={p.rules} maxLength={2000} rows={3} placeholder="One rule per line" />
                  </ActionForm>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2>Reset event (dry runs)</h2>
        <p className="warn">
          Deletes every participant, swipe, team, pitch, investment and finalist, logs participants out, and returns to
          before Introduction. Numbering restarts at P1 and Team 1. Phase durations, rules, the Google Form link, admins
          and the audit log are kept. Can&apos;t be undone.
        </p>
        <ActionForm
          action={resetEvent}
          submitLabel="Reset event"
          confirmText="Reset the whole event? All participants and their data are deleted."
        >
          <label>
            Type RESET to confirm
            <input name="confirm" required autoComplete="off" />
          </label>
        </ActionForm>
      </section>
    </main>
  );
}
