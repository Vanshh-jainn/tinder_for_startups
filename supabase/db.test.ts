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

  // Catches any future function or table that forgets its revoke (spec §17: participants cannot call admin actions).
  it('lets anon/authenticated execute no function and read only event_state', async () => {
    for (const role of ['anon', 'authenticated']) {
      const fns = await db.query<{ name: string }>(
        `select p.oid::regprocedure::text as name from pg_proc p
         where p.pronamespace = 'public'::regnamespace and has_function_privilege($1, p.oid, 'EXECUTE')`,
        [role],
      );
      expect(fns.rows.map((r) => r.name), role).toEqual([]);

      const rels = await db.query<{ name: string; priv: string }>(
        `select c.relname as name, p.priv from pg_class c
         cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) as p(priv)
         where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'v')
           and has_table_privilege($1, c.oid, p.priv)`,
        [role],
      );
      expect(rels.rows, role).toEqual([{ name: 'event_state', priv: 'SELECT' }]);
    }
  });

  // Supabase's safeupdate rejects these with "UPDATE requires a WHERE clause"; PGlite doesn't.
  it('puts a WHERE on every UPDATE and DELETE inside functions', async () => {
    const { rows } = await db.query<{ proname: string; prosrc: string }>(
      `select proname, prosrc from pg_proc where pronamespace = 'public'::regnamespace`,
    );
    const topLevel = (sql: string) => {
      while (/\([^()]*\)/.test(sql)) sql = sql.replace(/\([^()]*\)/g, '');
      return sql;
    };
    const missing = rows.flatMap(({ proname, prosrc }) =>
      [...prosrc.matchAll(/\b(update\s+[\w.]+\s+set|delete\s+from)\b[^;]*/gi)]
        .filter(([stmt]) => !/\bwhere\b/i.test(topLevel(stmt)))
        .map(([stmt]) => `${proname}: ${stmt.split('\n')[0]}`),
    );
    expect(missing).toEqual([]);
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

  it('turns each matched pair straight into an approved team with active members', async () => {
    const team = await mutualPair();
    await saveRun([team]);
    const { rows } = await db.query<{ approval_state: string; pair_score: number; formation_source: string; number: number }>(
      'select approval_state, pair_score, formation_source, number from teams',
    );
    expect(rows).toEqual([{ approval_state: 'approved', pair_score: team.score, formation_source: 'algorithm', number: 1 }]);
    const members = await db.query<{ status: string }>('select status from team_members');
    expect(members.rows.map((m) => m.status)).toEqual(['active', 'active']);
  });

  it('rejects an algorithm team that is not a mutual right-swipe', async () => {
    const team = await mutualPair();
    await db.query(`update swipes set direction = 'left' where viewer_id = $1`, [team.a]);
    await expect(saveRun([team])).rejects.toThrow(/mutual right-swipe/);
    const { rows } = await db.query('select 1 from matching_runs');
    expect(rows).toHaveLength(0); // whole call rolled back
  });

  it('rolls back a whole run that would put someone in a second team', async () => {
    const team = await mutualPair();
    await saveRun([team]);
    await expect(saveRun([team])).rejects.toThrow(/duplicate key/);
    expect((await db.query('select 1 from teams')).rows).toHaveLength(1);
    expect((await db.query('select 1 from matching_runs')).rows).toHaveLength(1);

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

  describe('random pairing', () => {
    const closeMatchmaking = async () => {
      await call(`select set_discovery($1, 'open')`);
      await call(`select set_discovery($1, 'closed')`);
    };
    const activeTeams = async () =>
      (
        await db.query<{ formation_source: string; n: number }>(
          `select t.formation_source, count(*)::int as n from teams t join team_members m on m.team_id = t.id
           where m.status = 'active' group by t.id, t.formation_source order by n, t.formation_source`,
        )
      ).rows;

    it('only runs after Matchmaking has closed', async () => {
      await addParticipant('A');
      await addParticipant('B');
      await expect(call('select random_pairing($1)')).rejects.toThrow(/after Matchmaking has closed/);
      await call(`select set_discovery($1, 'open')`);
      await expect(call('select random_pairing($1)')).rejects.toThrow(/after Matchmaking has closed/);
    });

    it('pairs only free participants with complete profiles, and audits it', async () => {
      const team = await mutualPair();
      await saveRun([team]);
      for (const name of ['C', 'D', 'E', 'F']) await addParticipant(name);
      const incomplete = await addParticipant('X', false);
      await call(`select set_discovery($1, 'closed')`);

      const { rows } = await call('select random_pairing($1) as n');
      expect(rows[0]).toEqual({ n: 4 });
      expect(await activeTeams()).toEqual([
        { formation_source: 'algorithm', n: 2 },
        { formation_source: 'random', n: 2 },
        { formation_source: 'random', n: 2 },
      ]);
      expect((await db.query('select 1 from team_members where participant_id = $1', [incomplete])).rows).toHaveLength(0);
      const numbers = await db.query<{ number: number }>('select number from teams order by number');
      expect(numbers.rows.map((r) => r.number)).toEqual([1, 2, 3]);
      expect((await db.query(`select 1 from audit_log where action = 'team.random_pairing'`)).rows).toHaveLength(1);
      await expect(call('select random_pairing($1)')).rejects.toThrow(/already in a team/);
    });

    it('puts the odd one out into a 2-person team as its 3rd member', async () => {
      for (const name of ['A', 'B', 'C']) await addParticipant(name);
      await closeMatchmaking();
      await call('select random_pairing($1)');
      expect(await activeTeams()).toEqual([{ formation_source: 'random', n: 3 }]);
    });

    it('refuses a single leftover when there is no team to join', async () => {
      await addParticipant('A');
      await closeMatchmaking();
      await expect(call('select random_pairing($1)')).rejects.toThrow(/no team for them to join/);
    });

    it('is not callable by anon', async () => {
      await db.exec('reset role; set role anon');
      await expect(db.query('select random_pairing($1)', [ADMIN])).rejects.toThrow(/permission denied/);
    });
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
    const algorithmId = (await db.query<{ id: string }>('select id from teams')).rows[0].id;
    const manualId = await manualTeam();
    const { rows } = await db.query<{ id: string; number: number; domain: string }>('select id, number, domain from teams order by number');
    expect(rows.map((r) => r.number)).toEqual([1, 2]);
    expect(rows.map((r) => r.id)).toEqual([algorithmId, manualId]);
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

  const driverOf = new Map<string, string>(); // team -> its driver participant (fix C)
  const reader = new Map<string, string>(); // team -> its read-only member

  async function teams(n: number, withPitch = n): Promise<string[]> {
    const ids: string[] = [];
    for (let i = 0; i < n; i++) {
      const [a, b] = [await addParticipant(`a${i}`), await addParticipant(`b${i}`)];
      const { rows } = await call('select create_manual_team($1, $2, $3) as id', [a, b]);
      const id = (rows[0] as { id: string }).id;
      await db.query('select set_driver($1, $2, $3)', [`participant:${a}`, id, a]);
      driverOf.set(id, a);
      reader.set(id, b);
      ids.push(id);
      if (i < withPitch) await db.query(`insert into submissions (team_id, pitch, updated_by) values ($1, 'p', 'x')`, [id]);
    }
    return ids;
  }
  const toMarketplace = async () => {
    for (let i = 0; i < 7; i++) await call(`select timer_action($1, 'advance')`);
  };
  const items = (targets: string[], amounts = AMOUNTS) => targets.map((target, i) => ({ target, amount: amounts[i] }));
  const save = (team: string, list: object[], actor = `participant:${driverOf.get(team)}`) =>
    db.query('select save_allocation($1, $2, $3)', [actor, team, JSON.stringify(list)]);
  const lock = (team: string, list: object[], actor = `participant:${driverOf.get(team)}`) =>
    db.query('select lock_allocation($1, $2, $3)', [actor, team, JSON.stringify(list)]);
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

  it('counts nothing for a draft and everything once locked; a locked allocation cannot change', async () => {
    const [me, ...others] = await teams(8);
    await toMarketplace();
    await save(me, items(others));
    expect(await counted(me)).toHaveLength(0); // draft only

    await expect(lock(me, items(others, [200, 200, 400, 500, 600, 700, 2400]))).rejects.toThrow(/different/);
    expect(await counted(me)).toHaveLength(0); // failed lock changed nothing
    await lock(me, items(others));
    const rows = await counted(me);
    expect(rows).toHaveLength(7);
    expect(rows.reduce((s, r) => s + r.amount, 0)).toBe(5000);
    await expect(save(me, items(others))).rejects.toThrow(/locked/);
    await expect(lock(me, items(others))).rejects.toThrow(/locked/);
  });

  it('lets only the driver phone save or lock', async () => {
    const [me, ...others] = await teams(8);
    await toMarketplace();
    await expect(save(me, items(others), `participant:${reader.get(me)}`)).rejects.toThrow(/Read-only/);
    await expect(lock(me, items(others), `participant:${reader.get(me)}`)).rejects.toThrow(/Read-only/);
    await expect(lock(me, items(others), `admin:${ADMIN}`)).rejects.toThrow(/Read-only/);
    await db.query('update teams set driver_id = null where id = $1', [me]);
    await expect(save(me, items(others), `participant:${driverOf.get(me)}`)).rejects.toThrow(/Read-only/);
  });

  it('lets a voided team redo and lock again while the marketplace is open, and audits the void', async () => {
    const [me, ...others] = await teams(8);
    await toMarketplace();
    await lock(me, items(others));
    expect(await counted(me)).toHaveLength(7);

    await call('select void_investments($1, $2)', [me]);
    expect(await counted(me)).toHaveLength(0);
    const audit = await db.query(`select 1 from audit_log where action = 'investments.void'`);
    expect(audit.rows).toHaveLength(1);

    await lock(me, items(others, [2300, 700, 600, 500, 400, 300, 200]));
    expect(await counted(me)).toHaveLength(7);
  });

  it('refuses a void with nothing to void, and closes when the phase advances', async () => {
    const [me, ...others] = await teams(8);
    await toMarketplace();
    await expect(call('select void_investments($1, $2)', [me])).rejects.toThrow(/no investments/);
    await save(me, items(others));
    await call(`select timer_action($1, 'advance')`);
    await expect(lock(me, items(others))).rejects.toThrow(/not open/);
    expect(await counted(me)).toHaveLength(0); // an unlocked draft never counts
  });

  it('refreshes clients on lock and void but not on drafts, allows the leaderboard screen, and blocks anon', async () => {
    const [me, ...others] = await teams(8);
    await toMarketplace();
    const bumped = async () => {
      const { rows } = await db.query<{ fresh: boolean }>(`select updated_at > '2001-01-01' as fresh from event_state`);
      await db.query(`update event_state set updated_at = '2000-01-01' where id`);
      return rows[0].fresh;
    };
    await bumped();
    await save(me, items(others));
    expect(await bumped()).toBe(false); // drafts don't refresh every page
    await lock(me, items(others));
    expect(await bumped()).toBe(true);
    await call('select void_investments($1, $2)', [me]);
    expect(await bumped()).toBe(true);
    await call('select set_projector_screen($1, $2)', ['leaderboard']);

    await db.exec('reset role; set role anon');
    await expect(db.query('select * from investments')).rejects.toThrow(/permission denied/);
    await expect(db.query('select * from counted_investments')).rejects.toThrow(/permission denied/);
    await expect(db.query(`select lock_allocation('x', $1, '[]')`, [me])).rejects.toThrow(/permission denied/);
    await expect(db.query(`select assert_team_driver('x', $1)`, [me])).rejects.toThrow(/permission denied/);
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

  it('opens the marketplace for its whole phase, whatever the clock shows', async () => {
    expect(await windowNow()).toBe('closed');
    await advance(7);
    await db.query('update event_state set elapsed_ms = 9999999 where id');
    expect(await windowNow()).toBe('open'); // the timer never decides anything
    await advance(1);
    expect(await windowNow()).toBe('closed');
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
    await expect(db.query(`select confirm_finalists($1, '[]')`, [ADMIN])).rejects.toThrow(/permission denied/);
    await expect(db.query('select reveal_next_finalist($1)', [ADMIN])).rejects.toThrow(/permission denied/);
  });
});

describe('dry-run cleanup', () => {
  const advance = async (n: number) => {
    for (let i = 0; i < n; i++) await call(`select timer_action($1, 'advance')`);
  };
  const count = async (table: string) =>
    Number((await db.query<{ n: number }>(`select count(*) as n from ${table}`)).rows[0].n);

  it('deletes a participant before matchmaking only, with sessions, lockouts and an audit row', async () => {
    const p = await addParticipant('p');
    await addParticipant('q');
    await db.query(`insert into sessions (token_hash, subject_type, subject_id, expires_at) values ('t', 'participant', $1, now() + interval '1 hour')`, [p]);
    await db.query(`insert into login_attempts (key) values ('participant:1')`);

    await call('select delete_participant($1, $2)', [p]);
    expect(await count('participants')).toBe(1);
    expect(await count('sessions')).toBe(0);
    expect(await count('login_attempts')).toBe(0);
    const { rows } = await db.query<{ before: object }>(`select before from audit_log where action = 'participant.delete'`);
    expect(rows[0].before).toEqual({ number: 1, display_name: 'p' });
    await expect(call('select delete_participant($1, $2)', [p])).rejects.toThrow(/not found/);

    const [a, b] = [await addParticipant('a'), await addParticipant('b')];
    await call('select create_manual_team($1, $2, $3)', [a, b]);
    await expect(call('select delete_participant($1, $2)', [a])).rejects.toThrow(/team/);

    await advance(3); // Matchmaking opens
    const c = await addParticipant('c');
    await expect(call('select delete_participant($1, $2)', [c])).rejects.toThrow(/before Matchmaking/);
  });

  it('resets a whole run: data gone, numbering restarts, settings and audit log kept', async () => {
    const [a, b, c, d] = await Promise.all(['a', 'b', 'c', 'd'].map((n) => addParticipant(n)));
    await call(`select set_form_url($1, 'https://forms.example/x')`);
    await advance(3);
    await swipeRight(a, b);
    const { rows } = await call('select create_manual_team($1, $2, $3) as id', [a, b]);
    const team = (rows[0] as { id: string }).id;
    await call('select create_manual_team($1, $2, $3)', [c, d]);
    await db.query(`insert into submissions (team_id, pitch, updated_by) values ($1, 'p', 'x')`, [team]);
    await advance(5); // Break & Top 7
    await call('select confirm_finalists($1, $2)', [JSON.stringify([{ team, place: 1, total: 500 }])]);
    await db.query(`insert into sessions (token_hash, subject_type, subject_id, expires_at) values ('admin', 'admin', $1, now() + interval '1 hour')`, [ADMIN]);
    const auditBefore = await count('audit_log');

    await call(`select reset_event($1)`);

    for (const t of ['participants', 'swipes', 'teams', 'team_members', 'matching_runs', 'submissions', 'investments', 'finalists'])
      expect(await count(t), t).toBe(0);
    const { rows: [s] } = await db.query<Record<string, unknown>>(
      'select phase_idx, timer_status, pitching_team_id, projector_screen, market_confirmation, revealed_count from event_state',
    );
    expect(s).toEqual({ phase_idx: null, timer_status: 'idle', pitching_team_id: null, projector_screen: null, market_confirmation: false, revealed_count: 0 });
    expect((await db.query<{ status: string }>('select status from discovery')).rows[0].status).toBe('not_started');
    expect(await count(`sessions where subject_type = 'admin'`)).toBe(1);
    expect(await count(`config where google_form_url is not null`)).toBe(1);
    expect(await count('audit_log')).toBe(auditBefore + 1);

    const { rows: [p] } = await db.query<{ number: number }>(`insert into participants (display_name, code_hash) values ('new', 'h') returning number`);
    expect(p.number).toBe(1);
    const [e, f] = [await addParticipant('e'), await addParticipant('f')];
    await call('select create_manual_team($1, $2, $3)', [e, f]);
    expect((await db.query<{ number: number }>('select number from teams')).rows[0].number).toBe(1);
  });

  it('blocks anon from the cleanup functions', async () => {
    await db.exec('reset role; set role anon');
    await expect(db.query('select reset_event($1)', [ADMIN])).rejects.toThrow(/permission denied/);
    await expect(db.query('select delete_participant($1, $1)', [ADMIN])).rejects.toThrow(/permission denied/);
  });
});

describe('team driver device', () => {
  async function team() {
    const [a, b] = [await addParticipant('A'), await addParticipant('B')];
    const { rows } = await call('select create_manual_team($1, $2, $3) as id', [a, b]);
    return { id: (rows[0] as { id: string }).id, a, b };
  }
  const setDriver = (actor: string, teamId: string, driver: string | null) =>
    db.query('select set_driver($1, $2, $3)', [actor, teamId, driver]);
  const driver = async (teamId: string) =>
    (await db.query<{ driver_id: string | null }>('select driver_id from teams where id = $1', [teamId])).rows[0].driver_id;

  it('lets any member make the first pick; then only the driver can hand over', async () => {
    const t = await team();
    expect(await driver(t.id)).toBeNull();
    await setDriver(`participant:${t.b}`, t.id, t.a); // B picks A's phone
    expect(await driver(t.id)).toBe(t.a);

    await expect(setDriver(`participant:${t.b}`, t.id, t.b)).rejects.toThrow(/Only the current driver or an organiser/);
    await setDriver(`participant:${t.a}`, t.id, t.b); // A hands over
    expect(await driver(t.id)).toBe(t.b);
    expect((await db.query(`select 1 from audit_log where action = 'team.set_driver'`)).rows).toHaveLength(2);
  });

  it('lets an admin switch or clear the driver; members cannot clear it', async () => {
    const t = await team();
    await setDriver(`participant:${t.a}`, t.id, t.a);
    await setDriver(`admin:${ADMIN}`, t.id, t.b);
    expect(await driver(t.id)).toBe(t.b);
    await expect(setDriver(`participant:${t.b}`, t.id, null)).rejects.toThrow(/Choose a team member/);
    await setDriver(`admin:${ADMIN}`, t.id, null);
    expect(await driver(t.id)).toBeNull();
  });

  it('refuses outsiders and non-member drivers', async () => {
    const t = await team();
    const other = await addParticipant('C');
    await expect(setDriver(`participant:${other}`, t.id, other)).rejects.toThrow(/not in this team/);
    await expect(setDriver(`participant:${t.a}`, t.id, other)).rejects.toThrow(/must be a member/);
    await expect(setDriver(`admin:${ADMIN}`, t.id, other)).rejects.toThrow(/must be a member/);
  });

  it('is not callable by anon', async () => {
    await db.exec('reset role; set role anon');
    await expect(db.query('select set_driver($1, $2, null)', ['admin:x', ADMIN])).rejects.toThrow(/permission denied/);
  });
});

describe('admin profile correction', () => {
  const edit = (id: string, phone: string | null, summary = 'fixed summary') =>
    call('select admin_update_profile($1, $2, $3, $4, $5, $6, $7)', [id, 'New Name', phone, 'skills', 'prefs', summary]);

  it('updates any profile even after Matchmaking opened, and audits before/after', async () => {
    const id = await addParticipant('Old', false);
    await call(`select set_discovery($1, 'open')`);
    await edit(id, '+919876543210');
    const { rows } = await db.query<{ display_name: string; profile_complete: boolean }>(
      'select display_name, profile_complete from participants where id = $1',
      [id],
    );
    expect(rows[0]).toEqual({ display_name: 'New Name', profile_complete: true });
    const audit = await db.query<{ before: { display_name: string }; after: { summary: string } }>(
      `select before, after from audit_log where action = 'participant.edit_profile'`,
    );
    expect(audit.rows[0].before.display_name).toBe('Old');
    expect(audit.rows[0].after.summary).toBe('fixed summary');
  });

  it('keeps the column rules and refuses unknown participants', async () => {
    const id = await addParticipant('A');
    await expect(edit(id, '123')).rejects.toThrow(/check/);
    await expect(edit(id, null, 'x'.repeat(161))).rejects.toThrow(/check/);
    await expect(edit(ADMIN, null)).rejects.toThrow(/not found/);
  });

  it('is not callable by anon', async () => {
    await db.exec('reset role; set role anon');
    await expect(
      db.query(`select admin_update_profile($1, $1, 'n', null, '', '', '')`, [ADMIN]),
    ).rejects.toThrow(/permission denied/);
  });
});
