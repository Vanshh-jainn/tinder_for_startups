import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { ActionForm } from '@/components/ActionForm';
import { LogoutButton } from '@/components/LogoutButton';
import { PhaseBar } from '@/components/PhaseBar';
import { formatParticipantId } from '@/lib/security';
import { requireParticipant } from '@/server/auth';
import { getActiveMemberships, getDiscoveryStatus, getEventState } from '@/server/queries';
import { db } from '@/server/supabase';
import { saveProfile, swipe } from './actions';

type Me = Awaited<ReturnType<typeof requireParticipant>>;

export default async function ParticipantHome() {
  const me = await requireParticipant();
  if ((await getActiveMemberships()).has(me.id)) redirect('/team');
  const [status, event] = await Promise.all([getDiscoveryStatus(), getEventState()]);

  return (
    <main className="narrow app">
      <PhaseBar event={event} />
      <header className="row">
        <div className="who">
          <span className="avatar" aria-hidden="true">
            {initial(me.display_name)}
          </span>
          <div>
            <h1>Hi, {me.display_name}</h1>
            <p className="muted">{formatParticipantId(me.number)}</p>
          </div>
        </div>
        <LogoutButton />
      </header>
      {status === 'not_started' && <Profile me={me} />}
      {status === 'open' && <Discovery meId={me.id} />}
      {status === 'closed' && (
        <Empty glyph="⏳">Matchmaking is closed. Wait for the organisers to announce teams. This page updates by itself.</Empty>
      )}
    </main>
  );
}

const initial = (name: string) => name.trim().charAt(0).toUpperCase();

function Empty({ glyph, children }: { glyph: string; children: ReactNode }) {
  return (
    <div className="panel empty">
      <span className="glyph" aria-hidden="true">
        {glyph}
      </span>
      <p>{children}</p>
    </div>
  );
}

function Meter({ value, max }: { value: number; max: number }) {
  return (
    <div className="meter" aria-hidden="true">
      <span style={{ width: `${(value / max) * 100}%` }} />
    </div>
  );
}

function Profile({ me }: { me: Me }) {
  const filled = [me.phone, me.skills, me.preferences, me.summary].filter(Boolean).length;

  return (
    <section className="panel">
      <h2>Your profile</h2>
      <p className={filled === 4 ? 'notice' : 'muted'}>
        Profile {filled}/4 complete{filled === 4 ? '' : ' (fill in everything to take part in matchmaking)'}
      </p>
      <Meter value={filled} max={4} />
      <ActionForm action={saveProfile} submitLabel="Save profile">
        <label>
          Phone (only organisers see this)
          <input name="phone" type="tel" defaultValue={me.phone ?? ''} placeholder="+91 98765 43210" maxLength={20} />
        </label>
        <label>
          Skills
          <textarea name="skills" defaultValue={me.skills} maxLength={200} rows={2} />
        </label>
        <label>
          Preferences: what you look for in a teammate
          <textarea name="preferences" defaultValue={me.preferences} maxLength={200} rows={2} />
        </label>
        <label>
          Two-line summary about you (max 160 characters)
          <textarea name="summary" defaultValue={me.summary} maxLength={160} rows={2} />
        </label>
      </ActionForm>
      <p className="muted">Swiping starts automatically when the Matchmaking round begins.</p>
    </section>
  );
}

async function Discovery({ meId }: { meId: string }) {
  const { data: deck, error } = await db()
    .from('swipes')
    .select('viewed_id, direction')
    .eq('viewer_id', meId)
    .order('rank');
  if (error) throw error;

  if (!deck.length) {
    return (
      <Empty glyph="🙋">
        Matchmaking started before your profile was complete, so you can&apos;t swipe. Please talk to an organiser.
      </Empty>
    );
  }
  const next = deck.find((card) => !card.direction);
  const seen = deck.filter((card) => card.direction).length;
  if (!next) {
    return <Empty glyph="✨">You&apos;ve seen all {seen} profiles. Wait for the organisers to announce teams.</Empty>;
  }

  const { data: person, error: personError } = await db()
    .from('participants')
    .select('display_name, skills, preferences, summary')
    .eq('id', next.viewed_id)
    .single();
  if (personError) throw personError;

  return (
    <section className="discovery">
      <p className="muted">
        Profile {seen + 1} of {deck.length}
      </p>
      <Meter value={seen} max={deck.length} />
      <article className="card profile-card">
        <span className="avatar" aria-hidden="true">
          {initial(person.display_name)}
        </span>
        <h2>{person.display_name}</h2>
        <p className="summary">{person.summary}</p>
        <h3>Skills</h3>
        <p>{person.skills}</p>
        <h3>Looking for</h3>
        <p>{person.preferences}</p>
      </article>
      <form action={swipe} className="swipe">
        <input type="hidden" name="viewedId" value={next.viewed_id} />
        <button type="submit" name="direction" value="left" className="pass">
          <span aria-hidden="true">✕</span>
          Pass
        </button>
        <button type="submit" name="direction" value="right" className="like">
          <span aria-hidden="true">♥</span>
          Interested
        </button>
      </form>
      <p className="muted center-text">Choices are final.</p>
    </section>
  );
}
