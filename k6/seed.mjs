// Seeds the live DB for the load test: 100 participants in 50 approved 2-person teams, each with a
// pitch and a driver, and moves the event to the Investment Marketplace (phase 6).
// Run: node --env-file=.env.local k6/seed.mjs   Undo: admin → Event → Reset event (wipes everything).
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';

const PARTICIPANTS = 100;
const TARGETS = 7; // investments each team must pick
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});
const must = ({ data, error }) => {
  if (error) throw error;
  return data;
};

const { count } = await db.from('participants').select('id', { count: 'exact', head: true });
if (count) throw new Error(`${count} participants already exist. Reset the event first.`);

const codes = Array.from({ length: PARTICIPANTS }, () => randomUUID().slice(0, 8).toUpperCase());
const people = must(
  await db
    .from('participants')
    .insert(codes.map((code, i) => ({ display_name: `Load Test ${i + 1}`, code_hash: bcrypt.hashSync(code, 10) })))
    .select('id, number'),
);
people.sort((a, b) => a.number - b.number);

const teams = [];
for (let i = 0; i < people.length; i += 2) {
  teams.push({
    id: randomUUID(),
    formation_source: 'manual',
    approval_state: 'approved',
    created_by: randomUUID(),
    number: i / 2 + 1,
    domain: 'FinTech',
    driver_id: people[i].id,
  });
}
must(await db.from('teams').insert(teams));
must(
  await db.from('team_members').insert(people.map((p, i) => ({ team_id: teams[i >> 1].id, participant_id: p.id, status: 'active' }))),
);
must(
  await db
    .from('submissions')
    .insert(teams.map((t) => ({ team_id: t.id, pitch: `Load test pitch for team ${t.number}.`, updated_by: 'admin:loadtest' }))),
);
must(await db.from('event_state').update({ phase_idx: 6, updated_at: new Date().toISOString() }).eq('id', true));

// The next 7 teams round the ring: always other teams, always with a pitch.
const out = people.map((p, i) => {
  const t = i >> 1;
  return {
    id: `P${p.number}`,
    code: codes[i],
    driver: i % 2 === 0,
    targets: Array.from({ length: TARGETS }, (_, k) => teams[(t + k + 1) % teams.length].id),
  };
});
writeFileSync(new URL('.seed.json', import.meta.url), JSON.stringify(out));
console.log(`Seeded ${people.length} participants, ${teams.length} teams; event is in phase 6. Wrote k6/.seed.json`);
