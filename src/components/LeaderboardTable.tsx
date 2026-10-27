'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Leaderboard } from '@/server/queries';

const rupees = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Counts up from the previous value. Writes the DOM directly: no re-render per frame.
function CountUp({ value }: { value: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const from = useRef(value);
  useEffect(() => {
    const el = ref.current!;
    const start = from.current;
    from.current = value;
    if (start === value || reducedMotion()) {
      el.textContent = rupees(value);
      return;
    }
    const t0 = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / 900);
      el.textContent = rupees(start + (value - start) * (1 - (1 - p) ** 3));
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return <span ref={ref}>{rupees(value)}</span>;
}

// Counted totals only (locked allocations). Shared by the admin marketplace page and the projector.
// Live: the page re-renders on every lock; rows slide to their new place (FLIP, transform only),
// totals count up, and a "+₹X" chip pops on teams that just gained money.
export function LeaderboardTable({ board }: { board: Leaderboard }) {
  const [prev, setPrev] = useState(board);
  const [gains, setGains] = useState<Record<string, number>>({});
  if (board !== prev) {
    const before = new Map(prev.rows.map((r) => [r.teamId, r.total]));
    setGains(Object.fromEntries(board.rows.map((r) => [r.teamId, r.total - (before.get(r.teamId) ?? r.total)])));
    setPrev(board);
  }

  const rowEls = useRef(new Map<string, HTMLLIElement>());
  const tops = useRef(new Map<string, number>());
  useLayoutEffect(() => {
    const animate = !reducedMotion();
    for (const [id, el] of rowEls.current) {
      const top = el.offsetTop;
      const before = tops.current.get(id);
      if (animate && before !== undefined && before !== top) {
        el.animate([{ transform: `translateY(${before - top}px)` }, { transform: 'none' }], {
          duration: 700,
          easing: 'cubic-bezier(.2,.8,.2,1)',
        });
      }
      tops.current.set(id, top);
    }
  }, [board]);

  const max = Math.max(1, ...board.rows.map((r) => r.total));
  return (
    <div className="board-wrap">
      <p className="muted">
        <strong>
          {board.complete} of {board.teams}
        </strong>{' '}
        teams have locked their investments. Only locked money counts.
      </p>
      <ol className="board">
        {board.rows.map((r) => {
          const gain = gains[r.teamId] ?? 0;
          return (
            <li
              key={r.teamId}
              ref={(el) => {
                if (el) rowEls.current.set(r.teamId, el);
                else rowEls.current.delete(r.teamId);
              }}
              className={r.total > 0 && r.rank <= 3 ? `top top-${r.rank}` : undefined}
            >
              <span className="board-rank">{r.rank}</span>
              <span className="board-team">Team {r.number}</span>
              <span className="board-bar" aria-hidden="true">
                <span style={{ transform: `scaleX(${r.total / max})` }} />
              </span>
              <span className="board-total">
                <CountUp value={r.total} />
                {gain > 0 && (
                  <span key={r.total} className="gain">
                    +{rupees(gain)}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
