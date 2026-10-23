// Runs every migration in an in-memory Postgres (PGlite) with stand-ins for Supabase's roles,
// then checks the DB-level rules. Real Supabase: service_role bypasses RLS; anon/authenticated
// get default grants on new tables and functions, which the migrations must revoke.
import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';

const MIGRATIONS = join(__dirname, 'migrations');
const ADMIN = '00000000-0000-0000-0000-00000000000a';

let db: PGlite;

beforeEach(async () => {
  db = new PGlite();
  await db.exec(`
    create schema auth;
    create table auth.users (id uuid primary key);
    create role anon; create role authenticated; create role service_role bypassrls;
    create publication supabase_realtime;
    grant usage on schema public to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
    alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
  `);
  for (const file of readdirSync(MIGRATIONS).sort()) await db.exec(readFileSync(join(MIGRATIONS, file), 'utf8'));
  await db.exec('set role service_role');
});

async function addParticipant(name: string, complete = true): Promise<string> {
  const profile = complete ? `'+919876543210', 'skills', 'prefs', 'summary'` : `null, '', '', ''`;
  const { rows } = await db.query<{ id: string }>(
    `insert into participants (display_name, code_hash, phone, skills, preferences, summary)
     values ($1, 'h', ${profile}) returning id`,
    [name],
  );
  return rows[0].id;
}

const call = (sql: string, params: unknown[] = []) => db.query(sql, [ADMIN, ...params]);

async function swipeRight(viewer: string, viewed: string) {
  await db.query(
    `update swipes set direction = 'right', swiped_at = now() where viewer_id = $1 and viewed_id = $2`,
    [viewer, viewed],
  );
}

async function rank(viewer: string, viewed: string): Promise<number> {
  const { rows } = await db.query<{ rank: number }>(
    'select rank from swipes where viewer_id = $1 and viewed_id = $2',
    [viewer, viewed],
  );
  return rows[0].rank;
}

describe('access', () => {
  it('blocks anon and authenticated from tables and functions', async () => {
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`reset role; set role ${role}`);
      await expect(db.query('select * from participants')).rejects.toThrow(/permission denied/);
      await expect(db.query('select * from swipes')).rejects.toThrow(/permission denied/);
      await expect(db.query('select * from teams')).rejects.toThrow(/permission denied/);
      await expect(db.query(`select set_discovery($1, 'open')`, [ADMIN])).rejects.toThrow(/permission denied/);
      await expect(db.query('select reset_matching($1)', [ADMIN])).rejects.toThrow(/permission denied/);
    }
  });

  it('keeps the audit log append-only', async () => {
    await call(`select set_discovery($1, 'open')`);
    await expect(db.query(`update audit_log set action = 'x'`)).rejects.toThrow(/permission denied/);
    await expect(db.query('delete from audit_log')).rejects.toThrow(/permission denied/);
  });
});

describe('profiles', () => {
  it('rejects bad phone numbers and over-long summaries', async () => {
    const id = await addParticipant('A', false);
    await expect(db.query(`update participants set phone = '12ab' where id = $1`, [id])).rejects.toThrow(/check/);
    await expect(db.query(`update participants set summary = repeat('x', 161) where id = $1`, [id])).rejects.toThrow(/check/);
  });
});

describe('discovery', () => {
  it('builds random decks of complete profiles only, ranked 1..n-1', async () => {
    const ids = [await addParticipant('A'), await addParticipant('B'), await addParticipant('C')];
    const incomplete = await addParticipant('D', false);
    await call(`select set_discovery($1, 'open')`);

    for (const id of ids) {
      const { rows } = await db.query<{ viewed_id: string; rank: number }>(
        'select viewed_id, rank from swipes where viewer_id = $1 order by rank',
        [id],
      );
      expect(rows.map((r) => r.rank)).toEqual([1, 2]);
      expect(rows.map((r) => r.viewed_id).sort()).toEqual(ids.filter((x) => x !== id).sort());
    }
    const { rows } = await db.query('select 1 from swipes where viewer_id = $1 or viewed_id = $1', [incomplete]);
    expect(rows).toHaveLength(0);
  });

  it('does not rebuild decks on reopen, and audits each change', async () => {
    await addParticipant('A');
    await addParticipant('B');
    await call(`select set_discovery($1, 'open')`);
    await call(`select set_discovery($1, 'closed')`);
    await addParticipant('C');
    await call(`select set_discovery($1, 'open')`);
    const { rows } = await db.query('select 1 from swipes');
    expect(rows).toHaveLength(2);
    const audit = await db.query(`select 1 from audit_log where action = 'discovery.set'`);
    expect(audit.rows).toHaveLength(3);
  });

  it('refuses other statuses', async () => {
    await expect(call(`select set_discovery($1, 'not_started')`)).rejects.toThrow(/opened or closed/);
  });

  it('rejects self-swipes and duplicate ranks', async () => {
    const a = await addParticipant('A');
    const b = await addParticipant('B');
    await expect(db.query('insert into swipes (viewer_id, viewed_id, rank) values ($1, $1, 1)', [a])).rejects.toThrow(/check/);
    await call(`select set_discovery($1, 'open')`);
    const c = await addParticipant('C');
    await expect(db.query('insert into swipes (viewer_id, viewed_id, rank) values ($1, $2, 1)', [a, c])).rejects.toThrow(/duplicate/);
    expect(b).toBeTruthy();
  });
});

describe('teams', () => {
  async function mutualPair() {
    const a = await addParticipant('A');
    const b = await addParticipant('B');
    await call(`select set_discovery($1, 'open')`);
    await swipeRight(a, b);
    await swipeRight(b, a);
    const [x, y] = [a, b].sort();
    const team = { a: x, b: y, rankAB: await rank(x, y), rankBA: await rank(y, x) };
    return { ...team, score: team.rankAB * team.rankBA };
  }

  const saveRun = (teams: object[], unassigned: string[] = []) =>
    call(`select save_matching_run($1, 'v1', $2, $3, $4) as id`, [
      teams.reduce((s: number, t) => s + (t as { score: number }).score, 0),
      unassigned,
      JSON.stringify(teams),
    ]);

  it('stores a run with proposed teams and ranks', async () => {
    const team = await mutualPair();
    await saveRun([team]);
    const { rows } = await db.query<{ approval_state: string; pair_score: number; formation_source: string }>(
      'select approval_state, pair_score, formation_source from teams',
    );
    expect(rows).toEqual([{ approval_state: 'proposed', pair_score: team.score, formation_source: 'algorithm' }]);
  });

  it('rejects an algorithm team that is not a mutual right-swipe', async () => {
    const team = await mutualPair();
    await db.query(`update swipes set direction = 'left' where viewer_id = $1`, [team.a]);
    await expect(saveRun([team])).rejects.toThrow(/mutual right-swipe/);
    const { rows } = await db.query('select 1 from matching_runs');
    expect(rows).toHaveLength(0); // whole call rolled back
  });

  it('supersedes old proposals on rerun', async () => {
    const team = await mutualPair();
    await saveRun([team]);
    await saveRun([team]);
    const { rows } = await db.query<{ approval_state: string }>('select approval_state from teams order by created_at');
    expect(rows.map((r) => r.approval_state).sort()).toEqual(['proposed', 'superseded']);
  });

  it('approves once and blocks a second active team for the same person', async () => {
    const team = await mutualPair();
    const run = await saveRun([team]);
    expect(run.rows).toHaveLength(1);
    const { rows } = await db.query<{ id: string }>('select id from teams');
    await call('select decide_team($1, $2, true)', [rows[0].id]);
    await expect(call('select decide_team($1, $2, true)', [rows[0].id])).rejects.toThrow(/not a pending proposal/);

    const c = await addParticipant('C');
    await expect(call('select create_manual_team($1, $2, $3)', [team.a, c])).rejects.toThrow(/duplicate key/);
  });

  it('labels manual teams and leaves run records alone; dissolve frees members', async () => {
    const team = await mutualPair();
    await saveRun([team]);
    const before = await db.query('select * from matching_runs');

    const c = await addParticipant('C');
    const d = await addParticipant('D');
    const { rows } = await call('select create_manual_team($1, $2, $3) as id', [c, d]);
    const manualId = (rows[0] as { id: string }).id;
    const manual = await db.query('select formation_source, approval_state, matching_run_id from teams where id = $1', [manualId]);
    expect(manual.rows[0]).toEqual({ formation_source: 'manual', approval_state: 'approved', matching_run_id: null });
    expect((await db.query('select * from matching_runs')).rows).toEqual(before.rows);

    await call('select dissolve_team($1, $2)', [manualId]);
    await call('select create_manual_team($1, $2, $3)', [d, c]); // both free again
    await expect(call('select create_manual_team($1, $2, $2)', [c])).rejects.toThrow(/two different/);
  });

  it('refuses a manual team marked as algorithmic without a run', async () => {
    await expect(
      db.query(`insert into teams (formation_source, approval_state, created_by) values ('algorithm', 'proposed', $1)`, [ADMIN]),
    ).rejects.toThrow(/check/);
  });
});

describe('team workspace data', () => {
  const DOMAINS = ['Travel & Tourism', 'FinTech', 'EdTech', 'HealthTech', 'AI for Social Good', 'SaaS-Based Startups'];

  async function manualTeam(): Promise<string> {
    const { rows } = await call('select create_manual_team($1, $2, $3) as id', [await addParticipant('A'), await addParticipant('B')]);
    return (rows[0] as { id: string }).id;
  }

  it('gives approved and manual teams a number and a valid domain; proposals and rejects get neither', async () => {
    const a = await addParticipant('P');
    const b = await addParticipant('Q');
    await call(`select set_discovery($1, 'open')`);
    await swipeRight(a, b);
    await swipeRight(b, a);
    const [x, y] = [a, b].sort();
    const team = { a: x, b: y, rankAB: await rank(x, y), rankBA: await rank(y, x) };
    await call(`select save_matching_run($1, 'v1', $2, '{}', $3)`, [
      team.rankAB * team.rankBA,
      JSON.stringify([{ ...team, score: team.rankAB * team.rankBA }]),
    ]);
    const proposal = await db.query<{ id: string; number: number | null; domain: string | null }>('select id, number, domain from teams');
    expect(proposal.rows[0]).toMatchObject({ number: null, domain: null });

    await call('select decide_team($1, $2, true)', [proposal.rows[0].id]);
    const manualId = await manualTeam();
    const { rows } = await db.query<{ id: string; number: number; domain: string }>('select id, number, domain from teams order by number');
    expect(rows.map((r) => r.number)).toEqual([1, 2]);
    expect(rows.map((r) => r.id)).toEqual([proposal.rows[0].id, manualId]);
    for (const r of rows) expect(DOMAINS).toContain(r.domain);
  });

  it('refuses an approved team without number or domain, and unknown domains', async () => {
    const id = await manualTeam();
    await expect(db.query('update teams set domain = null where id = $1', [id])).rejects.toThrow(/check/);
    await expect(db.query(`update teams set domain = 'Crypto' where id = $1`, [id])).rejects.toThrow(/check/);
  });

  it('audits admin pitch edits and only for approved teams', async () => {
    const id = await manualTeam();
    await db.query(`insert into submissions (team_id, pitch, updated_by) values ($1, 'old', 'participant:x')`, [id]);
    await call('select admin_set_pitch($1, $2, $3)', [id, 'new']);
    const { rows } = await db.query<{ pitch: string; updated_by: string }>('select pitch, updated_by from submissions');
    expect(rows[0]).toEqual({ pitch: 'new', updated_by: `admin:${ADMIN}` });
    const audit = await db.query<{ before: unknown; after: unknown }>(
      `select before, after from audit_log where action = 'submission.edit_pitch'`,
    );
    expect(audit.rows[0]).toEqual({ before: { pitch: 'old' }, after: { pitch: 'new' } });

    await call('select dissolve_team($1, $2)', [id]);
    await expect(call('select admin_set_pitch($1, $2, $3)', [id, 'x'])).rejects.toThrow(/not approved/);
  });

  it('caps pitch length and only accepts https form links', async () => {
    const id = await manualTeam();
    await expect(
      db.query(`insert into submissions (team_id, pitch, updated_by) values ($1, repeat('x', 2001), 'a')`, [id]),
    ).rejects.toThrow(/check/);
    await expect(call('select set_form_url($1, $2)', ['http://forms.gle/x'])).rejects.toThrow(/check/);
    await call('select set_form_url($1, $2)', ['https://forms.gle/x']);
    await call('select set_form_url($1, null)');
  });

  it('blocks anon from the new tables and functions', async () => {
    await db.exec('reset role; set role anon');
    await expect(db.query('select * from config')).rejects.toThrow(/permission denied/);
    await expect(db.query('select * from submissions')).rejects.toThrow(/permission denied/);
    await expect(db.query('select set_form_url($1, null)', [ADMIN])).rejects.toThrow(/permission denied/);
    await expect(db.query('select decide_team($1, $1, true)', [ADMIN])).rejects.toThrow(/permission denied/);
    await expect(db.query('select random_domain()')).rejects.toThrow(/permission denied/);
  });
});

describe('event timer and projector', () => {
  type State = { phase_idx: number | null; timer_status: string; duration_ms: number; elapsed_ms: number; projector_screen: string | null };
  const state = async () =>
    (await db.query<State>('select phase_idx, timer_status, duration_ms::int, elapsed_ms::int, projector_screen from event_state')).rows[0];
  const timer = (action: string, minutes: number | null = null) => call('select timer_action($1, $2, $3)', [action, minutes]);

  it('advances through phases, starting each timer with its configured duration', async () => {
    expect(await state()).toMatchObject({ phase_idx: null, timer_status: 'idle' });
    await expect(timer('start')).rejects.toThrow(/first phase/);
    await timer('advance');
    expect(await state()).toMatchObject({ phase_idx: 0, timer_status: 'running', duration_ms: 600000, elapsed_ms: 0 });
    await timer('pause');
    expect((await state()).timer_status).toBe('paused');
    await timer('start');
    await timer('extend', 5);
    expect((await state()).duration_ms).toBe(900000);
    await timer('advance');
    expect((await state()).duration_ms).toBe(300000); // extension only affected the old phase
  });

  it('opens matchmaking on entering it and closes it on leaving', async () => {
    const a = await addParticipant('A');
    await addParticipant('B');
    for (let i = 0; i < 3; i++) await timer('advance');
    expect((await db.query<{ status: string }>('select status from discovery')).rows[0].status).toBe('open');
    expect((await db.query('select 1 from swipes where viewer_id = $1', [a])).rows).toHaveLength(1);
    await timer('advance');
    expect((await db.query<{ status: string }>('select status from discovery')).rows[0].status).toBe('closed');
  });

  it('resets only the clock and ends with time up', async () => {
    await addParticipant('A');
    await addParticipant('B');
    for (let i = 0; i < 3; i++) await timer('advance');
    await timer('end');
    expect(await state()).toMatchObject({ timer_status: 'idle', elapsed_ms: 600000 });
    await timer('reset');
    expect(await state()).toMatchObject({ timer_status: 'idle', elapsed_ms: 0, phase_idx: 2 });
    expect((await db.query('select 1 from swipes')).rows).toHaveLength(2); // decks untouched
  });

  it('runs per-team pitch timers only in Final Pitching, and stops after it', async () => {
    const { rows } = await call('select create_manual_team($1, $2, $3) as id', [await addParticipant('A'), await addParticipant('B')]);
    const team = (rows[0] as { id: string }).id;
    await expect(call('select start_pitch($1, $2)', [team])).rejects.toThrow(/Final Pitching only/);
    for (let i = 0; i < 9; i++) await timer('advance');
    expect(await state()).toMatchObject({ phase_idx: 8, timer_status: 'idle' });
    await expect(call('select start_pitch($1, $2)', [team])).rejects.toThrow(/Only finalists pitch/);
    await call('select confirm_finalists($1, $2)', [JSON.stringify([{ team, place: 1, total: 500 }])]);
    await call('select start_pitch($1, $2)', [team]);
    expect(await state()).toMatchObject({ timer_status: 'running', duration_ms: 600000 });
    await expect(timer('advance')).rejects.toThrow(/last phase/);
  });

  it('resets the projector override on advance and validates screens', async () => {
    await timer('advance');
    await call('select set_projector_screen($1, $2)', ['teams']);
    expect((await state()).projector_screen).toBe('teams');
    await expect(call('select set_projector_screen($1, $2)', ['secret'])).rejects.toThrow(/check/);
    await timer('advance');
    expect((await state()).projector_screen).toBeNull();
  });

  it('audits timer actions and phase edits', async () => {
    await timer('advance');
    await call('select update_phase($1, $2, $3, $4)', [1, 7, 'Fill in every field']);
    const { rows } = await db.query<{ action: string }>('select action from audit_log order by id');
    expect(rows.map((r) => r.action)).toEqual(['timer.advance', 'phase.update']);
    await expect(call('select update_phase($1, $2, $3, $4)', [1, 0, ''])).rejects.toThrow(/check/);
  });

  it('bumps event_state when teams change, so clients refresh', async () => {
    await db.query(`update event_state set updated_at = '2000-01-01'`);
    await call('select create_manual_team($1, $2, $3)', [await addParticipant('A'), await addParticipant('B')]);
    const { rows } = await db.query<{ old: boolean }>(`select updated_at < '2001-01-01' as old from event_state`);
    expect(rows[0].old).toBe(false);
  });

  it('lets anon read event_state only, and not change it', async () => {
    await db.exec('reset role; set role anon');
    expect((await db.query('select phase_idx from event_state')).rows).toHaveLength(1);
    await expect(db.query('update event_state set phase_idx = 3')).rejects.toThrow(/permission denied/);
    await expect(db.query('select * from phases')).rejects.toThrow(/permission denied/);
    await expect(db.query(`select timer_action($1, 'advance')`, [ADMIN])).rejects.toThrow(/permission denied/);
  });
});

describe('marketplace', () => {
  const AMOUNTS = [200, 300, 400, 500, 600, 700, 2300]; // distinct, multiples of 100, sum 5000

  async function teams(n: number, withPitch = n): Promise<string[]> {
    const ids: string[] = [];
    for (let i = 0; i < n; i++) {
      const { rows } = await call('select create_manual_team($1, $2, $3) as id', [
        await addParticipant(`a${i}`),
        await addParticipant(`b${i}`),
      ]);
      const id = (rows[0] as { id: string }).id;
      ids.push(id);
      if (i < withPitch) await db.query(`insert into submissions (team_id, pitch, updated_by) values ($1, 'p', 'x')`, [id]);
    }
    return ids;
  }
  const toMarketplace = async () => {
    for (let i = 0; i < 7; i++) await call(`select timer_action($1, 'advance')`);
  };
  const toConfirmation = () => call('select start_confirmation($1)');
  const items = (targets: string[], amounts = AMOUNTS) => targets.map((target, i) => ({ target, amount: amounts[i] }));
  const save = (team: string, list: object[]) =>
    db.query(`select save_allocation('participant:x', $1, $2)`, [team, JSON.stringify(list)]);
  const confirm = (team: string, target: string) => db.query(`select confirm_investment('participant:x', $1, $2)`, [team, target]);
  const counted = async (investor: string) =>
    (await db.query<{ amount: number }>('select amount from counted_investments where investor_team_id = $1', [investor])).rows;

  it('is closed outside the marketplace phase and enforces every allocation rule', async () => {
    const [me, ...others] = await teams(9);
    const seven = others.slice(0, 7);
    await expect(save(me, items(seven))).rejects.toThrow(/not open/);
    await toMarketplace();

    await save(me, items(seven));
    await expect(save(me, items([me, ...seven.slice(1)]))).rejects.toThrow(/other teams that have a pitch/);
    await expect(save(me, items(seven.slice(0, 6)))).rejects.toThrow(/exactly 7/);
    await expect(save(me, items([seven[0], ...seven.slice(0, 6)]))).rejects.toThrow(/only once/);
    await expect(save(me, items(seven, [250, 300, 400, 500, 600, 700, 2250]))).rejects.toThrow(/multiple of ₹100/);
    await expect(save(me, items(seven, [100, 300, 400, 500, 600, 700, 2400]))).rejects.toThrow(/at least ₹200/);
    await expect(save(me, items(seven, [200, 200, 400, 500, 600, 700, 2400]))).rejects.toThrow(/different/);
    await expect(save(me, items(seven, [200, 300, 400, 500, 600, 700, 2400]))).rejects.toThrow(/exactly ₹5,000/);
  });

  it('excludes teams without a pitch and asks for all available when fewer than 7', async () => {
    const [a, b, c, d, noPitch] = await teams(5, 4);
    await toMarketplace();
    await expect(save(a, items([b, c, noPitch], [1000, 1500, 2500]))).rejects.toThrow(/have a pitch/);
    await expect(save(a, items([b, c], [2000, 3000]))).rejects.toThrow(/exactly 3/);
    await save(a, items([b, c, d], [1000, 1500, 2500]));
    await save(noPitch, items([a, b, c, d], [500, 1000, 1500, 2000])); // a team without a pitch can still invest
  });

  it('separates decision and confirmation time, locks after the first confirm, and counts only complete submissions', async () => {
    const [me, ...others] = await teams(8);
    await toMarketplace();
    await save(me, items(others));
    await expect(confirm(me, others[0])).rejects.toThrow(/confirmation time/);

    await toConfirmation();
    await expect(save(me, items(others))).rejects.toThrow(/Decision time is over/);
    for (const target of others.slice(0, 6)) await confirm(me, target);
    await confirm(me, others[0]); // idempotent
    expect(await counted(me)).toHaveLength(0); // 6 of 7 confirmed: nothing counts

    await confirm(me, others[6]);
    const rows = await counted(me);
    expect(rows).toHaveLength(7);
    expect(rows.reduce((s, r) => s + r.amount, 0)).toBe(5000);
    await expect(confirm(me, me)).rejects.toThrow(/not in your allocation/);
  });

  it('lets a voided team redo its submission during confirmation time, and audits the void', async () => {
    const [me, ...others] = await teams(8);
    await toMarketplace();
    await save(me, items(others));
    await toConfirmation();
    for (const target of others) await confirm(me, target);
    expect(await counted(me)).toHaveLength(7);

    await call('select void_investments($1, $2)', [me]);
    expect(await counted(me)).toHaveLength(0);
    const audit = await db.query(`select 1 from audit_log where action = 'investments.void'`);
    expect(audit.rows).toHaveLength(1);

    await save(me, items(others, [2300, 700, 600, 500, 400, 300, 200]));
    for (const target of others) await confirm(me, target);
    expect(await counted(me)).toHaveLength(7);
  });

  it('refuses a void with nothing to void, and closes when the phase advances', async () => {
    const [me, ...others] = await teams(8);
    await toMarketplace();
    await expect(call('select void_investments($1, $2)', [me])).rejects.toThrow(/no investments/);
    await save(me, items(others));
    await call(`select timer_action($1, 'advance')`);
    await expect(confirm(me, others[0])).rejects.toThrow(/confirmation time/);
  });

  it('refreshes clients on investment changes, allows the leaderboard screen, and blocks anon', async () => {
    const [me, ...others] = await teams(8);
    await toMarketplace();
    await db.query(`update event_state set updated_at = '2000-01-01'`);
    await save(me, items(others));
    const { rows } = await db.query<{ old: boolean }>(`select updated_at < '2001-01-01' as old from event_state`);
    expect(rows[0].old).toBe(false);
    await call('select set_projector_screen($1, $2)', ['leaderboard']);

    await db.exec('reset role; set role anon');
    await expect(db.query('select * from investments')).rejects.toThrow(/permission denied/);
    await expect(db.query('select * from counted_investments')).rejects.toThrow(/permission denied/);
    await expect(db.query(`select confirm_investment('x', $1, $1)`, [me])).rejects.toThrow(/permission denied/);
  });
});

describe('admin-driven marketplace stages and qualification', () => {
  const advance = (n: number) => Array.from({ length: n }).reduce<Promise<unknown>>(
    (p) => p.then(() => call(`select timer_action($1, 'advance')`)),
    Promise.resolve(),
  );
  const windowNow = async () => (await db.query<{ w: string }>('select marketplace_window() as w')).rows[0].w;
  async function team(name: string): Promise<string> {
    const { rows } = await call('select create_manual_team($1, $2, $3) as id', [await addParticipant(`${name}1`), await addParticipant(`${name}2`)]);
    return (rows[0] as { id: string }).id;
  }

  it('starts confirmation time only when the admin says so, whatever the clock shows', async () => {
    await expect(call('select start_confirmation($1)')).rejects.toThrow(/marketplace phase/);
    await advance(7);
    expect((await db.query<{ d: number }>('select duration_ms::int as d from event_state')).rows[0].d).toBe(600000);
    await db.query('update event_state set elapsed_ms = 9999999');
    expect(await windowNow()).toBe('decision'); // the timer no longer decides anything
    await call('select start_confirmation($1)');
    expect(await windowNow()).toBe('confirmation');
    const s = (await db.query<{ d: number; t: string }>('select duration_ms::int as d, timer_status as t from event_state')).rows[0];
    expect(s).toEqual({ d: 300000, t: 'running' });
    await expect(call('select start_confirmation($1)')).rejects.toThrow(/already started/);
    await advance(1);
    expect(await windowNow()).toBe('closed');
    expect((await db.query<{ m: boolean }>('select market_confirmation as m from event_state')).rows[0].m).toBe(false);
  });

  it('confirms finalists only after the marketplace, in order, replacing earlier results', async () => {
    const [a, b] = [await team('a'), await team('b')];
    const list = (ids: string[]) => JSON.stringify(ids.map((t, i) => ({ team: t, place: i + 1, total: 1000 - i })));
    await advance(7); // in the marketplace
    await expect(call('select confirm_finalists($1, $2)', [list([a, b])])).rejects.toThrow(/after the marketplace/);
    await advance(1); // Break & Top 7
    await call('select confirm_finalists($1, $2)', [list([a, b])]);
    await call('select confirm_finalists($1, $2)', [list([b])]);
    const { rows } = await db.query<{ team_id: string; position: number }>('select team_id, position from finalists');
    expect(rows).toEqual([{ team_id: b, position: 1 }]);
    const audit = await db.query(`select 1 from audit_log where action = 'qualification.confirm'`);
    expect(audit.rows).toHaveLength(2);
  });

  it('refuses unapproved or zero-investment finalists', async () => {
    const a = await team('a');
    await advance(8);
    await call('select dissolve_team($1, $2)', [a]);
    await expect(call('select confirm_finalists($1, $2)', [JSON.stringify([{ team: a, place: 1, total: 100 }])])).rejects.toThrow(/approved/);
    const b = await team('b');
    await expect(call('select confirm_finalists($1, $2)', [JSON.stringify([{ team: b, place: 1, total: 0 }])])).rejects.toThrow(/check/);
  });

  it('reveals finalists one at a time and resets the reveal on re-confirm', async () => {
    const [a, b] = [await team('a'), await team('b')];
    await advance(8);
    await expect(call('select reveal_next_finalist($1)')).rejects.toThrow(/Confirm the finalists/);
    await call('select confirm_finalists($1, $2)', [JSON.stringify([{ team: a, place: 1, total: 900 }, { team: b, place: 2, total: 500 }])]);
    await call('select reveal_next_finalist($1)');
    await call('select reveal_next_finalist($1)');
    await expect(call('select reveal_next_finalist($1)')).rejects.toThrow(/already revealed/);
    expect((await db.query<{ r: number }>('select revealed_count as r from event_state')).rows[0].r).toBe(2);
    await call('select confirm_finalists($1, $2)', [JSON.stringify([{ team: a, place: 1, total: 900 }])]);
    expect((await db.query<{ r: number }>('select revealed_count as r from event_state')).rows[0].r).toBe(0);
    await call('select set_projector_screen($1, $2)', ['finalists']);
  });

  it('blocks anon from finalists and the new functions', async () => {
    await db.exec('reset role; set role anon');
    await expect(db.query('select * from finalists')).rejects.toThrow(/permission denied/);
    await expect(db.query('select start_confirmation($1)', [ADMIN])).rejects.toThrow(/permission denied/);
    await expect(db.query(`select confirm_finalists($1, '[]')`, [ADMIN])).rejects.toThrow(/permission denied/);
    await expect(db.query('select reveal_next_finalist($1)', [ADMIN])).rejects.toThrow(/permission denied/);
  });
});
