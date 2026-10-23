'use client';

import { useEffect, useState } from 'react';
import { formatClock, pitchSegment, remainingMs, type TimerState } from '@/lib/timer';

type Props = {
  timer: TimerState;
  serverNow: number;
  pitch?: boolean; // Final Pitching: show the current segment (Pitch / Q&A / rollover)
  className?: string;
};

export function Countdown({ timer, serverNow, pitch = false, className }: Props) {
  const [now, setNow] = useState(serverNow);

  useEffect(() => {
    const offset = serverNow - Date.now();
    const id = setInterval(() => setNow(Date.now() + offset), 250);
    return () => clearInterval(id);
  }, [serverNow]);

  const paused = timer.timer_status === 'paused' ? ' (paused)' : '';
  if (pitch) {
    const segment = pitchSegment(timer, now);
    return (
      <span className={className} role="timer">
        {segment.label} · {formatClock(segment.remainingMs)}
        {paused}
      </span>
    );
  }
  const ms = remainingMs(timer, now);
  return (
    <span className={className} role="timer">
      {ms === 0 && timer.duration_ms > 0 ? "Time's up" : formatClock(ms)}
      {paused}
    </span>
  );
}
