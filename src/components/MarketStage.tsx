'use client';

import { useEffect, useState } from 'react';
import { DECISION_MS, marketplaceWindow } from '@/lib/marketplace';
import { elapsedMs, formatClock, type TimerState } from '@/lib/timer';

// "Decision time · 04:12 left" / "Confirmation time · live". Switches by itself at minute 10.
export function MarketStage({ phaseIdx, timer, serverNow }: { phaseIdx: number | null; timer: TimerState; serverNow: number }) {
  const [now, setNow] = useState(serverNow);

  useEffect(() => {
    const offset = serverNow - Date.now();
    const id = setInterval(() => setNow(Date.now() + offset), 1000);
    return () => clearInterval(id);
  }, [serverNow]);

  const stage = marketplaceWindow(phaseIdx, timer, now);
  if (stage === 'closed') return <span>Marketplace closed</span>;
  if (stage === 'decision') return <span>Decision time · {formatClock(Math.max(0, DECISION_MS - elapsedMs(timer, now)))} left</span>;
  return <span>Confirmation time · live</span>;
}
