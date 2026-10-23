// Event timer maths and projector screen choice. Pure; shared by server and client.

export type TimerState = {
  timer_status: 'idle' | 'running' | 'paused';
  duration_ms: number;
  elapsed_ms: number;
  started_at: string | null;
};

export function elapsedMs(t: TimerState, nowMs: number): number {
  const running = t.timer_status === 'running' && t.started_at ? nowMs - Date.parse(t.started_at) : 0;
  return t.elapsed_ms + running;
}

export function remainingMs(t: TimerState, nowMs: number): number {
  return Math.max(0, t.duration_ms - elapsedMs(t, nowMs));
}

export function formatClock(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// Final Pitching: each team gets 7 min pitch, 2 min Q&A, 1 min scoring rollover.
// An extension lengthens the last segment.
const PITCH_MS = 7 * 60_000;
const QA_MS = 2 * 60_000;

export function pitchSegment(t: TimerState, nowMs: number): { label: string; remainingMs: number } {
  const remaining = remainingMs(t, nowMs);
  const elapsed = t.duration_ms - remaining;
  if (elapsed < PITCH_MS) return { label: 'Pitch', remainingMs: PITCH_MS - elapsed };
  if (elapsed < PITCH_MS + QA_MS) return { label: 'Q&A', remainingMs: PITCH_MS + QA_MS - elapsed };
  return { label: 'Scoring rollover', remainingMs: remaining };
}

export const SCREENS = ['welcome', 'rules', 'matchmaking', 'teams', 'leaderboard', 'finalists', 'pitching'] as const;
export type Screen = (typeof SCREENS)[number];

export const SCREEN_LABELS: Record<Screen, string> = {
  welcome: 'Welcome',
  rules: 'Round rules',
  matchmaking: 'Matchmaking animation',
  teams: 'Teams formed',
  leaderboard: 'Investment leaderboard',
  finalists: 'Finalist reveal',
  pitching: 'Team on stage',
};

// Default projector screen per phase index (0 Introduction … 8 Final Pitching).
const DEFAULT_SCREENS: Screen[] = ['rules', 'rules', 'matchmaking', 'teams', 'rules', 'rules', 'leaderboard', 'finalists', 'pitching'];

export function screenFor(phaseIdx: number | null, override: Screen | null): Screen {
  return override ?? (phaseIdx === null ? 'welcome' : DEFAULT_SCREENS[phaseIdx]);
}
