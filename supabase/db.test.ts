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
