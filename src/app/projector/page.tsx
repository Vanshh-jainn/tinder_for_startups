import type { Metadata } from 'next';
import { Countdown } from '@/components/Countdown';
import { LeaderboardTable } from '@/components/LeaderboardTable';
import { LiveRefresh } from '@/components/LiveRefresh';
import { MarketStage } from '@/components/MarketStage';
import { screenFor } from '@/lib/timer';
import { getEventState, getLeaderboard, type EventState } from '@/server/queries';
import { db } from '@/server/supabase';

export const metadata: Metadata = { title: 'Projector · Tinder for Startups' };

// Public, read-only. Shows only what the hall may see: team numbers, member names, domains, rules,
// and counted investment totals (live during the marketplace, OQ-31).
export default async function ProjectorPage() {
  const event = await getEventState();
  const screen = screenFor(event.phase_idx, event.projector_screen);

  return (
    <main className="projector">
      <LiveRefresh />
      {event.phase_idx !== null && screen !== 'pitching' && (
        <div className="corner-timer">
          <small>{event.phase_name}</small>
          <Countdown timer={event} serverNow={event.serverNow} pitch={event.phase_idx === 8 && !!event.pitching_team_id} />
        </div>
      )}
      {screen === 'welcome' && (
        <div className="center">
          <h1>Tinder for Startups</h1>
          <p className="muted">DAMRU · Rishihood University</p>
        </div>
      )}
      {screen === 'rules' && <Rules event={event} />}
      {screen === 'matchmaking' && <Matchmaking />}
      {screen === 'teams' && <Teams />}
      {screen === 'leaderboard' && <LeaderboardScreen event={event} />}
      {screen === 'pitching' && <Pitching event={event} />}
    </main>
  );
}

function Rules({ event }: { event: EventState }) {
  const rules = event.rules.split('\n').map((line) => line.trim()).filter(Boolean);
  return (
    <div className="center">
      <h1>{event.phase_name ?? 'Tinder for Startups'}</h1>
      {rules.length > 0 && (
        <ul className="rules">
          {rules.map((rule, i) => (
            <li key={i}>{rule}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Matchmaking() {
  return (
    <div className="center">
      <div className="mm-stage" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="mm-card" />
        ))}
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <span key={i} className="mm-heart">
            ♥
          </span>
        ))}
      </div>
      <h1>Matchmaking in progress…</h1>
    </div>
  );
}

type TeamRow = {
  number: number;
  domain: string;
  team_members: { status: string; participants: { display_name: string } }[];
};

async function Teams() {
  const { data, error } = await db()
    .from('teams')
    .select('number, domain, team_members(status, participants(display_name))')
    .eq('approval_state', 'approved')
    .order('number');
  if (error) throw error;
  const teams = data as unknown as TeamRow[];

  return (
    <div>
      <h1>Teams formed</h1>
      {teams.length === 0 ? (
        <p className="muted">Teams will appear here as they are approved.</p>
      ) : (
        <div className="team-grid">
          {teams.map((t) => (
            <div key={t.number} className="card">
              <h2>Team {t.number}</h2>
              <p>
                {t.team_members
                  .filter((m) => m.status === 'active')
                  .map((m) => m.participants.display_name)
                  .join(' & ')}
              </p>
              <p className="domain">{t.domain}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

async function Pitching({ event }: { event: EventState }) {
  if (!event.pitching_team_id) {
    return (
      <div className="center">
        <h1>Final Pitching</h1>
        <p className="muted">Next team coming up…</p>
      </div>
    );
  }
  const { data, error } = await db()
    .from('teams')
    .select('number, domain, team_members(status, participants(display_name))')
    .eq('id', event.pitching_team_id)
    .single();
  if (error) throw error;
  const team = data as unknown as TeamRow;

  return (
    <div className="center">
      <h1>Team {team.number}</h1>
      <p>
        {team.team_members
          .filter((m) => m.status === 'active')
          .map((m) => m.participants.display_name)
          .join(' & ')}{' '}
        · {team.domain}
      </p>
      <p className="stage-timer">
        <Countdown timer={event} serverNow={event.serverNow} pitch />
      </p>
    </div>
  );
}

async function LeaderboardScreen({ event }: { event: EventState }) {
  const board = await getLeaderboard();
  return (
    <div>
      <h1>Investment leaderboard</h1>
      <p className="stage">
        <MarketStage phaseIdx={event.phase_idx} timer={event} serverNow={event.serverNow} />
      </p>
      <LeaderboardTable board={board} />
    </div>
  );
}
