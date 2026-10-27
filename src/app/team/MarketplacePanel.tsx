'use client';

import { useState } from 'react';
import { ActionForm } from '@/components/ActionForm';
import { allocationErrors, BUDGET, MIN_AMOUNT, STEP, type MarketWindow } from '@/lib/marketplace';
import { lockAllocation, saveAllocation } from './actions';

type Target = { id: string; number: number; pitch: string };
type Saved = { target: string; amount: number; locked: boolean };

type Props = {
  stage: MarketWindow;
  targets: Target[];
  saved: Saved[]; // the page remounts this panel when it changes, so teammates see the driver's draft live
  required: number;
};

const rupees = (n: number) => `₹${n.toLocaleString('en-IN')}`;

// Portfolio view: how the ₹5,000 is split, like a stock portfolio.
function Holdings({ items, numberOf }: { items: { target: string; amount: number }[]; numberOf: (id: string) => number | string }) {
  const valid = items.filter((i) => Number.isFinite(i.amount) && i.amount > 0);
  const total = valid.reduce((s, i) => s + i.amount, 0);
  const sorted = [...valid].sort((a, b) => b.amount - a.amount);
  return (
    <div className="holdings">
      <div className="split-bar" aria-hidden="true">
        {sorted.map((i) => (
          <span key={i.target} style={{ width: `${(Math.min(i.amount, BUDGET) / Math.max(BUDGET, total)) * 100}%` }} />
        ))}
      </div>
      {sorted.length > 0 && (
        <ul className="holding-list">
          {sorted.map((i) => (
            <li key={i.target}>
              <span>Team {numberOf(i.target)}</span>
              <span>
                {rupees(i.amount)} <small className="muted">{Math.round((i.amount / BUDGET) * 100)}%</small>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function MarketplacePanel({ stage, targets, saved, required }: Props) {
  const [picks, setPicks] = useState<Record<string, string>>(() =>
    Object.fromEntries(saved.map((s) => [s.target, String(s.amount)])),
  );
  const byId = new Map(targets.map((t) => [t.id, t]));
  const numberOf = (id: string) => byId.get(id)?.number ?? '?';
  const locked = saved.length > 0 && saved.every((s) => s.locked);

  if (locked) {
    return (
      <section className="portfolio locked">
        <p className="callout notice">
          🔒 <strong>Locked.</strong>{' '}
          {stage === 'open' ? 'Your ₹5,000 is invested and counts on the leaderboard now.' : 'Marketplace closed. Your investments counted.'}
        </p>
        <Holdings items={saved} numberOf={numberOf} />
      </section>
    );
  }

  if (stage === 'closed') {
    return <p className="callout warn">Marketplace closed. Your team didn&apos;t lock its investments, so none of them counted.</p>;
  }

  const items = Object.entries(picks).map(([target, amount]) => ({ target, amount: Number(amount) }));
  const errors = allocationErrors(items, required);
  const total = items.reduce((sum, i) => sum + (Number.isFinite(i.amount) ? i.amount : 0), 0);
  const left = BUDGET - total;
  const unsaved =
    items.length !== saved.length || items.some((i) => saved.find((s) => s.target === i.target)?.amount !== i.amount);
  const payload = JSON.stringify(items);

  return (
    <section className="portfolio">
      <p className="muted">
        Pick {required} startup{required === 1 ? '' : 's'} and split ₹5,000. Amounts: at least ₹{MIN_AMOUNT}, multiples of ₹{STEP}, all
        different. Save drafts as you go; <strong>only locked money counts</strong>, and locking is final.
      </p>
      <div className="wallet">
        <div>
          <small className="muted">Left to invest</small>
          <p className={`wallet-left ${left < 0 ? 'over' : left === 0 ? 'done' : ''}`}>{rupees(left)}</p>
        </div>
        <div className="wallet-side">
          <small className="muted">Picked</small>
          <p>
            {items.length}/{required}
          </p>
        </div>
      </div>
      <Holdings items={items} numberOf={numberOf} />

      <div className="target-grid">
        {targets.map((t) => {
          const picked = t.id in picks;
          return (
            <div key={t.id} className={`card ${picked ? 'picked' : ''}`}>
              <label className="pick">
                <input
                  type="checkbox"
                  checked={picked}
                  disabled={!picked && items.length >= required}
                  onChange={(e) =>
                    setPicks((p) => {
                      const next = { ...p };
                      if (e.target.checked) next[t.id] = '';
                      else delete next[t.id];
                      return next;
                    })
                  }
                />
                <strong>Team {t.number}</strong>
              </label>
              <p>{t.pitch}</p>
              {picked && (
                <label>
                  Amount (₹)
                  <input
                    type="number"
                    inputMode="numeric"
                    min={MIN_AMOUNT}
                    step={STEP}
                    max={BUDGET}
                    value={picks[t.id]}
                    onChange={(e) => setPicks((p) => ({ ...p, [t.id]: e.target.value }))}
                  />
                </label>
              )}
            </div>
          );
        })}
      </div>

      {errors.length > 0 ? (
        <ul className="error">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      ) : (
        <p className="notice">All rules pass ✓ Ready to lock.</p>
      )}
      {saved.length > 0 && !unsaved && <p className="muted">Draft saved ✓</p>}
      <div className="row start">
        <ActionForm action={saveAllocation} submitLabel="Save draft" className="secondary-form" disabled={errors.length > 0 || !unsaved}>
          <input type="hidden" name="items" value={payload} />
        </ActionForm>
        <ActionForm
          action={lockAllocation}
          submitLabel="🔒 Lock investments"
          disabled={errors.length > 0}
          confirmText={`Lock ₹5,000 in ${items.length} startup${items.length === 1 ? '' : 's'}? This is final and counts on the leaderboard at once.`}
        >
          <input type="hidden" name="items" value={payload} />
        </ActionForm>
      </div>
    </section>
  );
}
