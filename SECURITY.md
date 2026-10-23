# Security

Security model for Tinder for Startups. The requirements come from [spec.md §4](docs/spec.md#4-participant-access-and-accounts) and [§15](docs/spec.md#15-validation-and-security). How they are implemented is in [docs/architecture.md](docs/architecture.md).

## Reporting

Found a problem? Tell the event organisers directly. Do not open a public issue containing exploit details or credentials.

## Roles

| Role | Authenticates with | Can do |
|---|---|---|
| Admin | Supabase Auth (email + password) | Everything in the admin panel; every action is audited |
| Team | Team username + login code → server session | Its own workspace: pitch, marketplace selections/allocations/confirmations |
| Participant | Method open ([OQ-4](docs/open-questions.md)) → server session | Own profile, swiping |
| Projector | None (public read-only) | Reads `event_state` and `projector_state` only |

## Non-negotiable rules

1. **Server-side enforcement.** Every protected action checks the session role and ownership on the server. Hiding a button is never protection.
2. **Never trust the client** for role, team ID, participant ID, investment amount, totals, score, rank position, approval state, or phase. The server derives identity from the session and recomputes everything else from the DB.
3. **The service-role key and all secrets are server-only.** Nothing secret goes in `NEXT_PUBLIC_*` env vars, client bundles, logs, or the repo. `.env*` files are git-ignored.
4. **No default admin password.** The first admin is created with a one-time setup step (a CLI script or the Supabase dashboard), documented in the README at Phase 1.
5. **Team login codes**
   - are generated with a CSPRNG (`crypto.randomInt` / `crypto.getRandomValues`), not `Math.random`;
   - are stored only as a slow hash (bcrypt/argon2), because codes are short;
   - are shown in plaintext once, to the admin, when issued;
   - can be reset or revoked by an admin (audited).
6. **Rate limiting.** Failed logins are tracked per username and per IP in `login_attempts`. After N failures in a window the login is locked for that key. N and the window are configurable.
7. **Sessions** use random tokens in `httpOnly; Secure; SameSite=Lax` cookies. Only the token hash is stored. Sessions expire and can be revoked by an admin.
8. **Never log** passwords, raw login codes, session tokens, or secrets, including in `audit_log` before/after values.
9. **Least privilege.** RLS is on for every table, deny by default. Anonymous clients can read only `event_state` and `projector_state`, which hold public-safe data.

## Threats and controls

| Threat | Control |
|---|---|
| IDOR (team A reads or edits team B) | Team ID comes from the session, never from the request; queries are always scoped by session team |
| Participant calls admin action | Admin guard on every admin Server Action / Route Handler; admin pages check the Supabase Auth session + `admins` table |
| Brute-forcing team codes | Rate limiting + slow hash + enough code entropy |
| Double-counted investments | Idempotent `UPDATE … WHERE confirmed_at IS NULL`; DB unique constraints; totals only from the counted view |
| Tampered amounts/totals | DB `CHECK` constraints + server validation; totals are never accepted from the client |
| Actions after marketplace close | Server checks `marketplace_open` inside the same transaction as the write |
| SQL injection | Parameterised queries via the Supabase client / SQL functions only; no string-built SQL |
| XSS | React escaping; no `dangerouslySetInnerHTML` on user content; pitch and summary rendered as plain text |
| CSRF | Server Actions' built-in origin check; `SameSite=Lax` cookies; custom Route Handlers verify `Origin` |
| Private data on projector | Projector reads only a server-built public payload |
| Secret leak in bundle | Pre-deploy check: grep the build output for key prefixes; review env var names |

## Audit log

Each entry records the actor, action, affected record, time, and before/after values (secrets excluded) for:

- team approval, rejection, and edits; manual assignments; domain changes;
- timer and phase actions; pitch edits; marketplace open/close;
- investment corrections/voids; leaderboard and projector changes; qualification overrides;
- credential issue, reset, and revoke.

`audit_log` is append-only: the application role has no UPDATE or DELETE grant on it.

## Required security tests

See [spec.md §17 Security/admin](docs/spec.md#securityadmin). These must pass before any deployment.
