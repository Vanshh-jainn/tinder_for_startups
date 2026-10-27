'use client';

import { useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { swipe } from './actions';

type Direction = 'left' | 'right';
const THRESHOLD = 90; // px of drag that counts as a swipe

// Drag the card (or tap the buttons): it flies out, then the same server action records the swipe.
// Movement is written straight to the element's style (transform only), so dragging never re-renders.
// The page passes key={viewedId}, so the next profile mounts a fresh card.
export function SwipeCard({ viewedId, children }: { viewedId: string; children: ReactNode }) {
  const form = useRef<HTMLFormElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const buttons = { left: useRef<HTMLButtonElement>(null), right: useRef<HTMLButtonElement>(null) };
  const drag = useRef<{ x0: number; dx: number } | null>(null);
  const [fly, setFly] = useState<Direction | null>(null);

  const place = (dx: number) => {
    const el = card.current!;
    el.style.transform = dx ? `translateX(${dx}px) rotate(${dx / 18}deg)` : '';
    el.style.setProperty('--like', String(Math.max(0, Math.min(1, dx / THRESHOLD))));
    el.style.setProperty('--nope', String(Math.max(0, Math.min(1, -dx / THRESHOLD))));
  };

  const commit = (dir: Direction) => {
    if (fly) return;
    setFly(dir);
    card.current!.style.transform = '';
    setTimeout(() => form.current?.requestSubmit(buttons[dir].current), 220);
  };

  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    if (fly) return;
    drag.current = { x0: e.clientX, dx: 0 };
    e.currentTarget.setPointerCapture(e.pointerId);
    card.current!.classList.add('dragging');
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    drag.current.dx = e.clientX - drag.current.x0;
    place(drag.current.dx);
  };
  const onUp = () => {
    const dx = drag.current?.dx ?? 0;
    drag.current = null;
    card.current!.classList.remove('dragging');
    if (Math.abs(dx) >= THRESHOLD) commit(dx > 0 ? 'right' : 'left');
    else place(0);
  };

  return (
    <>
      <div
        ref={card}
        className={`swipe-card ${fly ? `fly-${fly}` : ''}`}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        <span className="stamp like" aria-hidden="true">
          LIKE
        </span>
        <span className="stamp nope" aria-hidden="true">
          NOPE
        </span>
        {children}
      </div>
      {fly === 'right' && (
        <span className="heart-burst" aria-hidden="true">
          ♥
        </span>
      )}
      <form ref={form} action={swipe} className="swipe">
        <input type="hidden" name="viewedId" value={viewedId} />
        {(['left', 'right'] as const).map((dir) => (
          <button
            key={dir}
            ref={buttons[dir]}
            type="submit"
            name="direction"
            value={dir}
            className={dir === 'left' ? 'pass' : 'like'}
            aria-disabled={!!fly}
            onClick={(e) => {
              // Animate first; commit() then submits with this button (requestSubmit fires no click).
              // Not `disabled`: a disabled submitter's direction would be left out of the form data.
              e.preventDefault();
              commit(dir);
            }}
          >
            <span aria-hidden="true">{dir === 'left' ? '✕' : '♥'}</span>
            {dir === 'left' ? 'Pass' : 'Interested'}
          </button>
        ))}
      </form>
    </>
  );
}
