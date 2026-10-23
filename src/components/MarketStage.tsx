import { marketplaceWindow } from '@/lib/marketplace';
import type { EventState } from '@/server/queries';
import { Countdown } from './Countdown';

// "Decision time · 04:12" / "Confirmation time · live · 03:40". The admin starts confirmation time;
// the countdown only displays time.
export function MarketStage({ event }: { event: EventState }) {
  const stage = marketplaceWindow(event.phase_idx, event.market_confirmation);
  if (stage === 'closed') return <span>Marketplace closed</span>;
  return (
    <span>
      {stage === 'decision' ? 'Decision time · ' : 'Confirmation time · live · '}
      <Countdown timer={event} serverNow={event.serverNow} />
    </span>
  );
}
