import { formatParticipantId } from '@/lib/security';
import { requireParticipant } from '@/server/auth';
import { logout } from '../actions';

export default async function ParticipantHome() {
  const participant = await requireParticipant();

  return (
    <main className="narrow">
      <h1>Hi, {participant.display_name}</h1>
      <p className="muted">You are logged in as {formatParticipantId(participant.number)}.</p>
      <p>Profile setup opens when the Skill Filling phase starts.</p>
      <form action={logout}>
        <button type="submit">Log out</button>
      </form>
    </main>
  );
}
