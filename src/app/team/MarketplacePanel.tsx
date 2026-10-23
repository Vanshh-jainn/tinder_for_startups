'use client';

import { useEffect, useState } from 'react';
import { ActionForm } from '@/components/ActionForm';
import { allocationErrors, BUDGET, DECISION_MS, marketplaceWindow, MIN_AMOUNT, STEP } from '@/lib/marketplace';
import { elapsedMs, formatClock, type TimerState } from '@/lib/timer';
import { confirmInvestment, saveAllocation } from './actions';

type Target = { id: string; number: number; pitch: string };
type Saved = { target: string; amount: number; confirmed: boolean };

type Props = {
  phaseIdx: number | null;
  timer: TimerState;
  serverNow: number;
  targets: Target[];
  saved: Saved[];
  required: number;
  wasVoided: boolean; // admin voided an earlier submission: the team may redo it during confirmation time
};

export function MarketplacePanel({ phaseIdx, timer, serverNow, targets, saved, required, wasVoided }: Props) {
  const [now, setNow] = useState(serverNow);
  const [picks, setPicks] = useState<Record<string, string>>(() =>
    Object.fromEntries(saved.map((s) => [s.target, String(s.amount)])),
  );

  useEffect(() => {
    const offset = serverNow - Date.now();
    const id = setInterval(() => setNow(Date.now() + offset), 1000);
    return () => clearInterval(id);
  }, [serverNow]);

  const stage = marketplaceWindow(phaseIdx, timer, now);
  const confirmed = saved.filter((s) => s.confirmed).length;
  const canEdit = confirmed === 0 && (stage === 'decision' || (stage === 'confirmation' && wasVoided));
  const byId = new Map(targets.map((t) => [t.id, t]));

  if (stage === 'closed') {
    const counted = saved.length > 0 && confirmed === saved.length;
    return (
      <p className={counted ? 'notice' : 'warn'}>
        {counted
          ? `Marketplace closed. All ${saved.length} investments were confirmed, so they counted.`
          : 'Marketplace closed. Your team did not confirm every investment, so none of them counted.'}
      </p>
    );
  }

  if (canEdit) {
    const items = Object.entries(picks).map(([target, amount]) => ({ target, amount: Number(amount) }));
    const errors = allocationErrors(items, required);
    const total = items.reduce((sum, i) => sum + (Number.isFinite(i.amount) ? i.amount : 0), 0);
    const unsaved =
      items.length !== saved.length || items.some((i) => saved.find((s) => s.target === i.target)?.amount !== i.amount);
    const decisionLeft = Math.max(0, DECISION_MS - elapsedMs(timer, now));

    return (
      <section>
        <p className="muted">
          {stage === 'decision'
            ? `Decision time: ${formatClock(decisionLeft)} left. Pick ${required} startup${required === 1 ? '' : 's'} and split ₹5,000. Amounts: at least ₹${MIN_AMOUNT}, multiples of ₹${STEP}, all different. You can't change it after decision time.`
            : 'An organiser reset your investments. Redo and save them, then confirm each one.'}
        </p>
        <p className="stat">
          {items.length}/{required} picked · ₹{(BUDGET - total).toLocaleString('en-IN')} left to allocate
        </p>
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
        {errors.length > 0 && (
          <ul className="error">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
        {saved.length > 0 && !unsaved && <p className="notice">Saved ✓</p>}
        <ActionForm action={saveAllocation} submitLabel={unsaved ? 'Save allocation' : 'Save again'} disabled={errors.length > 0}>
          <input type="hidden" name="items" value={JSON.stringify(items)} />
        </ActionForm>
      </section>
    );
  }

  // Confirmation time: no edits, confirm each investment.
  if (saved.length === 0) {
    return <p className="warn">Your team didn&apos;t save an allocation during decision time, so it can&apos;t invest.</p>;
  }
  return (
    <section>
      <p className="warn">
        <strong>Confirm all {saved.length}. If you don&apos;t confirm every one, none of your investments count.</strong>
      </p>
      <p className="stat">
        {confirmed}/{saved.length} confirmed
      </p>
      <table>
        <tbody>
          {saved.map((s) => (
            <tr key={s.target}>
              <td>Team {byId.get(s.target)?.number ?? '?'}</td>
              <td>₹{s.amount.toLocaleString('en-IN')}</td>
              <td>
                {s.confirmed ? (
                  <span className="notice">Confirmed ✓</span>
                ) : (
                  <ActionForm action={confirmInvestment} submitLabel="Confirm">
                    <input type="hidden" name="target" value={s.target} />
                  </ActionForm>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
