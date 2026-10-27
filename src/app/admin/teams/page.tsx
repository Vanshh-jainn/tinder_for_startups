import { ActionForm } from '@/components/ActionForm';
import { formatParticipantId } from '@/lib/security';
import { requireAdmin } from '@/server/auth';
import { getActiveMemberships } from '@/server/queries';
import { db } from '@/server/supabase';
import { AdminHeader } from '../AdminHeader';
import { createManualTeam, dissolveTeam } from '../matching/actions';
import { adminSetDriver, adminSetPitch, setFormUrl } from './actions';

type Team = {
  id: string;
  number: number;
  domain: string;
  formation_source: 'algorithm' | 'manual' | 'random';
  driver_id: string | null;
  team_members: { participant_id: string; status: string }[];
  submissions: { pitch: string } | null;
};

export default async function TeamsPage() {
  await requireAdmin();
  const [participantsRes, teamsRes, configRes, active] = await Promise.all([
    db().from('participants').select('id, number, display_name').order('number'),
    db()
      .from('teams')
      .select('id, number, domain, formation_source, driver_id, team_members(participant_id, status), submissions(pitch)')
      .eq('approval_state', 'approved')
      .eq('team_members.status', 'active')
      .order('number'),
    db().from('config').select('google_form_url').single(),
    getActiveMemberships(),
  ]);
  for (const res of [participantsRes, teamsRes, configRes]) if (res.error) throw res.error;
  const participants = participantsRes.data!;
  const teams = teamsRes.data as unknown as Team[];
  const formUrl = configRes.data!.google_form_url as string | null;

  const byId = new Map(participants.map((p) => [p.id, p]));
  const label = (id: string) => {
    const p = byId.get(id);
    return p ? `${formatParticipantId(p.number)} ${p.display_name}` : id;
  };
  const unassigned = participants.filter((p) => !active.has(p.id));
  const withPitch = teams.filter((t) => t.submissions).length;

  return (
    <main className="admin">
      <AdminHeader />

      <section>
        <h2>Google Form</h2>
        <p className="muted">
          Teams submit their pitch and deck on this form. Current: {formUrl ? <a href={formUrl}>{formUrl}</a> : 'not set'}.
        </p>
        <ActionForm action={setFormUrl} submitLabel="Save link">
          <input name="url" type="url" defaultValue={formUrl ?? ''} placeholder="https://forms.gle/…" />
        </ActionForm>
      </section>

      <section>
        <h2>
          Approved teams ({teams.length}) · marketplace pitches saved: {withPitch}/{teams.length}
        </h2>
        <table>
          <thead>
            <tr>
              <th>Team</th>
              <th>Members</th>
              <th>Domain</th>
              <th>Source</th>
              <th>Driver phone</th>
              <th>Marketplace pitch</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {teams.map((t) => (
              <tr key={t.id}>
                <td>Team {t.number}</td>
                <td>{t.team_members.map((m) => label(m.participant_id)).join(' + ')}</td>
                <td>{t.domain}</td>
                <td>{t.formation_source === 'manual' ? <span className="badge">Manual override</span> : t.formation_source === 'random' ? 'Random' : 'Algorithm'}</td>
                <td>
                  <ActionForm action={adminSetDriver} submitLabel="Set driver">
                    <input type="hidden" name="teamId" value={t.id} />
                    <select name="driver" defaultValue={t.driver_id ?? ''}>
                      <option value="">Not chosen (team picks)</option>
                      {t.team_members.map((m) => (
                        <option key={m.participant_id} value={m.participant_id}>
                          {label(m.participant_id)}
                        </option>
                      ))}
                    </select>
                  </ActionForm>
                </td>
                <td>
                  <ActionForm action={adminSetPitch} submitLabel="Save pitch">
                    <input type="hidden" name="teamId" value={t.id} />
                    <textarea
                      name="pitch"
                      defaultValue={t.submissions?.pitch ?? ''}
                      placeholder="Not submitted yet"
                      maxLength={2000}
                      rows={2}
                      required
                    />
                  </ActionForm>
                </td>
                <td>
                  <ActionForm
                    action={dissolveTeam}
                    submitLabel="Dissolve"
                    confirmText={`Dissolve Team ${t.number}? Both members become unassigned and lose the team workspace.`}
                    className="secondary-form"
                  >
                    <input type="hidden" name="teamId" value={t.id} />
                  </ActionForm>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2>Manual team</h2>
        <p className="muted">
          Creates an approved team marked as a manual override, with a random domain. No mutual swipe needed. To change a
          team&apos;s members, dissolve it and create a new one.
        </p>
        <ActionForm action={createManualTeam} submitLabel="Create manual team">
          {(['a', 'b'] as const).map((field) => (
            <label key={field}>
              Member {field.toUpperCase()}
              <select name={field} required defaultValue="">
                <option value="" disabled>
                  Choose an unassigned participant
                </option>
                {unassigned.map((p) => (
                  <option key={p.id} value={p.id}>
                    {label(p.id)}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </ActionForm>
      </section>
    </main>
  );
}
