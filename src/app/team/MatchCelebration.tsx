'use client';

import { useEffect, useState } from 'react';

// "It's a Match!" the first time this phone opens its new team. Remembered per device in localStorage
// (a convenience only: if storage is blocked it just shows again).
export function MatchCelebration({ teamId, teamNumber, names }: { teamId: string; teamNumber: number; names: string[] }) {
  const key = `match-seen:${teamId}`;
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let seen = false;
    try {
      seen = localStorage.getItem(key) === '1';
    } catch {}
    // eslint-disable-next-line react-hooks/set-state-in-effect -- storage only exists in the browser
    if (!seen) setOpen(true);
  }, [key]);

  if (!open) return null;
  const close = () => {
    try {
      localStorage.setItem(key, '1');
    } catch {}
    setOpen(false);
  };

  return (
    <div className="modal-backdrop match" role="dialog" aria-modal="true" aria-labelledby="match-title">
      <div className="match-card">
        <p className="match-hearts" aria-hidden="true">
          ♥ ♥ ♥
        </p>
        <h2 id="match-title">It&apos;s a Match!</h2>
        <p>
          You&apos;re <strong>Team {teamNumber}</strong> with {names.join(' & ')}.
        </p>
        <button type="button" onClick={close}>
          Let&apos;s build something
        </button>
      </div>
    </div>
  );
}
