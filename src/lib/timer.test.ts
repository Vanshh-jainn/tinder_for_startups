import { describe, expect, it } from 'vitest';
import { formatClock, pitchSegment, remainingMs, screenFor, type TimerState } from './timer';

const T0 = Date.parse('2026-10-27T10:00:00Z');
const running = (durationMin: number, elapsedMs = 0): TimerState => ({
  timer_status: 'running',
  duration_ms: durationMin * 60_000,
  elapsed_ms: elapsedMs,
  started_at: new Date(T0).toISOString(),
});

describe('remainingMs', () => {
  it('counts down while running, including time banked before a pause', () => {
    expect(remainingMs(running(10), T0 + 60_000)).toBe(9 * 60_000);
    expect(remainingMs(running(10, 120_000), T0 + 60_000)).toBe(7 * 60_000);
  });

  it('is frozen while paused or idle', () => {
    const paused: TimerState = { ...running(10, 90_000), timer_status: 'paused', started_at: null };
    expect(remainingMs(paused, T0 + 999_999)).toBe(510_000);
  });

  it('never goes below zero', () => {
    expect(remainingMs(running(1), T0 + 600_000)).toBe(0);
  });
});

describe('formatClock', () => {
  it('rounds up to whole seconds', () => {
    expect(formatClock(600_000)).toBe('10:00');
    expect(formatClock(59_001)).toBe('01:00');
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(70 * 60_000)).toBe('70:00');
  });
});

describe('pitchSegment', () => {
  it('splits 10 minutes into pitch 7, Q&A 2, rollover 1', () => {
    expect(pitchSegment(running(10), T0)).toEqual({ label: 'Pitch', remainingMs: 7 * 60_000 });
    expect(pitchSegment(running(10), T0 + 7.5 * 60_000)).toEqual({ label: 'Q&A', remainingMs: 1.5 * 60_000 });
    expect(pitchSegment(running(10), T0 + 9.5 * 60_000)).toEqual({ label: 'Scoring rollover', remainingMs: 30_000 });
  });

  it('gives an extension to the last segment', () => {
    expect(pitchSegment(running(12), T0 + 9.5 * 60_000)).toEqual({ label: 'Scoring rollover', remainingMs: 2.5 * 60_000 });
  });
});

describe('screenFor', () => {
  it('follows the phase unless overridden', () => {
    expect(screenFor(null, null)).toBe('welcome');
    expect(screenFor(2, null)).toBe('matchmaking');
    expect(screenFor(3, null)).toBe('teams');
    expect(screenFor(8, null)).toBe('pitching');
    expect(screenFor(2, 'rules')).toBe('rules');
  });
});
