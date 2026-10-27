import { marketplaceWindow } from '@/lib/marketplace';
import type { EventState } from '@/server/queries';
import { Countdown } from './Countdown';

// "Market open · 08:12". Teams lock their own allocations; the countdown only displays time.
export function MarketStage({ event }: { event: EventState }) {
  if (marketplaceWindow(event.phase_idx) === 'closed') return <span>Market closed</span>;
  return (
    <span>
      <span className="live-dot" aria-hidden="true" /> Market open · <Countdown timer={event} serverNow={event.serverNow} />
    </span>
  );
}
