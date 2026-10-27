'use client';

import { useEffect, useState } from 'react';

export type ProjectorTeam = { number: number; domain: string; members: string[] };

const PER_PAGE = 12; // 4 × 3 cards fit a 16:9 projector
const SECONDS = 8;

// "Teams formed" with ~40 teams: shows 12 at a time and flips to the next page every few seconds.
export function TeamPages({ teams }: { teams: ProjectorTeam[] }) {
  const pages = Math.max(1, Math.ceil(teams.length / PER_PAGE));
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (pages < 2) return;
    const id = setInterval(() => setTick((t) => t + 1), SECONDS * 1000);
    return () => clearInterval(id);
  }, [pages]);

  const page = tick % pages; // stays valid when live refreshes add teams
  const shown = teams.slice(page * PER_PAGE, (page + 1) * PER_PAGE);

  return (
    <>
      <div key={page} className="team-grid">
        {shown.map((t, i) => (
          <div key={t.number} className="card" style={{ animationDelay: `${i * 0.06}s` }}>
            <h2>
              Team {t.number} <span className="match-heart">♥</span>
            </h2>
            <p>{t.members.join(' & ')}</p>
            <p className="domain">{t.domain}</p>
          </div>
        ))}
      </div>
      {pages > 1 && (
        <p className="muted page-dots">
          {teams.length} teams · page {page + 1} of {pages}
        </p>
      )}
    </>
  );
}
