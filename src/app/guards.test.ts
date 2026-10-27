// Spec §17 security checks that live in the source, not the DB: every protected server action and
// page runs its guard before touching data, private fields never reach the projector, client code
// never imports server code, and the secret key never lands in the browser bundle.
// The DB side (no anon access, audit rows) is in supabase/db.test.ts.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..', '..');
const SRC = join(ROOT, 'src');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}
const rel = (path: string) => relative(ROOT, path);
const read = (path: string) => readFileSync(path, 'utf8');

// Top-level functions in a file: name -> body. Bodies end at the first "}" in column 0.
function functions(src: string) {
  return new Map([...src.matchAll(/^(?:export )?(?:default )?(?:async )?function (\w+)\([^]*?\{\n([^]*?)\n\}/gm)].map((m) => [m[1], m[2]]));
}

// The first call a function makes (awaited or returned) must be the guard, directly or through a
// local helper in the same file whose first call is the guard.
function startsWithGuard(name: string, fns: Map<string, string>, guard: string, seen = new Set<string>()): boolean {
  const body = fns.get(name);
  if (!body || seen.has(name)) return false;
  seen.add(name);
  const first = /(?:await|return)\s+(\w+)\(/.exec(body)?.[1];
  return first === guard || (!!first && startsWithGuard(first, fns, guard, seen));
}

function unguarded(file: string, guard: string, exported: RegExp, skip: string[] = []) {
  const src = read(file);
  const fns = functions(src);
  return [...src.matchAll(exported)]
    .map((m) => m[1])
    .filter((name) => !skip.includes(name) && !startsWithGuard(name, fns, guard))
    .map((name) => `${rel(file)}: ${name}`);
}

const files = walk(SRC);
const EXPORTED_ACTION = /^export async function (\w+)/gm;
const DEFAULT_PAGE = /^export default async function (\w+)/gm;

describe('server-side guards', () => {
  it('every admin action and page checks requireAdmin() first', () => {
    const admin = files.filter((f) => rel(f).startsWith('src/app/admin/') && !rel(f).startsWith('src/app/admin/login/'));
    const actions = admin.filter((f) => f.endsWith('actions.ts'));
    const pages = admin.filter((f) => f.endsWith('page.tsx'));
    expect(actions.length).toBeGreaterThan(5);
    expect(pages.length).toBeGreaterThan(5);
    expect([
      ...actions.flatMap((f) => unguarded(f, 'requireAdmin', EXPORTED_ACTION, ['adminLogin'])),
      ...pages.flatMap((f) => unguarded(f, 'requireAdmin', DEFAULT_PAGE)),
    ]).toEqual([]);
  });

  it('every team action and page checks requireTeamMember() first; team id never comes from the request', () => {
    const team = files.filter((f) => /src\/app\/team\/(actions\.ts|page\.tsx)$/.test(f));
    expect([
      ...unguarded(join(SRC, 'app/team/actions.ts'), 'requireTeamMember', EXPORTED_ACTION),
      ...unguarded(join(SRC, 'app/team/page.tsx'), 'requireTeamMember', DEFAULT_PAGE),
    ]).toEqual([]);
    for (const f of team) expect(read(f), rel(f)).not.toMatch(/formData\.get\(['"]team/i);
  });

  it('every participant action and page checks requireParticipant() first', () => {
    expect([
      ...unguarded(join(SRC, 'app/me/actions.ts'), 'requireParticipant', EXPORTED_ACTION),
      ...unguarded(join(SRC, 'app/me/page.tsx'), 'requireParticipant', DEFAULT_PAGE),
    ]).toEqual([]);
  });

  it('the guard scanner itself catches a missing guard', () => {
    const fns = functions('export async function bad() {\n  const x = await db();\n  await requireAdmin();\n}\n');
    expect(startsWithGuard('bad', fns, 'requireAdmin')).toBe(false);
  });
});

describe('private data and secrets', () => {
  it('the public projector never selects phones, codes, hashes or tokens', () => {
    expect(read(join(SRC, 'app/projector/page.tsx'))).not.toMatch(/phone|code_hash|token|login_attempts|sessions|audit_log/);
  });

  it('client components never import server code (except types)', () => {
    const offenders = files
      .filter((f) => /\.tsx?$/.test(f) && /^['"]use client['"]/.test(read(f)))
      .filter((f) => /^import (?!type )[^\n]*from ['"]@\/server\//m.test(read(f)))
      .map(rel);
    expect(offenders).toEqual([]);
  });

  it('no secret-looking variable is exposed through NEXT_PUBLIC_', () => {
    const names = new Set(files.flatMap((f) => [...read(f).matchAll(/NEXT_PUBLIC_\w+/g)].map((m) => m[0])));
    expect([...names].filter((n) => /SECRET|SERVICE|PRIVATE|PASSWORD/i.test(n))).toEqual([]);
  });

  // Runs against the last `npm run build`; skipped when there is no build or no local secret.
  const envFile = join(ROOT, '.env.local');
  const secret = existsSync(envFile) ? /^SUPABASE_SECRET_KEY=(.+)$/m.exec(read(envFile))?.[1].trim() : undefined;
  const bundle = join(ROOT, '.next', 'static');
  it.skipIf(!secret || !existsSync(bundle))('the secret key is absent from the browser bundle', () => {
    const leaks = walk(bundle).filter((f) => read(f).includes(secret!)).map(rel);
    expect(leaks).toEqual([]);
  });
});
