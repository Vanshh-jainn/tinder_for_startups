import type { EventState } from '@/server/queries';
import { Countdown } from './Countdown';
import { LiveRefresh } from './LiveRefresh';

// Phase name + countdown at the top of participant and team pages; keeps the page live.
export function PhaseBar({ event }: { event: EventState }) {
  return (
    <div className="phasebar">
      <span>{event.phase_name ?? 'Event not started'}</span>
      {event.phase_idx !== null && (
        <Countdown timer={event} serverNow={event.serverNow} pitch={event.phase_idx === 8 && !!event.pitching_team_id} />
      )}
      <LiveRefresh />
    </div>
  );
}
