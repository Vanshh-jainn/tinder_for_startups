# Security

Security model for Tinder for Startups. The requirements come from [spec.md §4](docs/spec.md#4-participant-access-and-accounts) and [§15](docs/spec.md#15-validation-and-security). How they are implemented is in [docs/architecture.md](docs/architecture.md).

## Reporting

Found a problem? Tell the event organisers directly. Do not open a public issue containing exploit details or credentials.

## Roles

| Role | Authenticates with | Can do |
|---|---|---|
| Admin | Email + password checked by Supabase Auth, must be in `admins` → server session | Everything in the admin panel; every action is audited |
| Team member | Their own participant session + an active membership in an approved team (no shared team code) | Their team's workspace: pitch, marketplace allocation and lock (driver phone only; other members read-only). Never sees investment totals |
| Participant | Admin-issued participant ID (`P12`) + login code → server session | Own profile, swiping |
| Projector | None (public read-only page `/projector`) | Sees team numbers, member names, domains, rules, and the timer; the page is rendered by the server |

## Non-negotiable rules

1. **Server-side enforcement.** Every protected action checks the session role and ownership on the server. Hiding a button is never protection.
2. **Never trust the client** for role, team ID, participant ID, investment amount, totals, score, rank position, approval state, or phase. The server derives identity from the session and recomputes everything else from the DB.
3. **The service-role key and all secrets are server-only.** Nothing secret goes in `NEXT_PUBLIC_*` env vars, client bundles, logs, or the repo. `.env*` files are git-ignored.
4. **No default admin password.** Admins are created by hand in the Supabase dashboard and added to the `admins` table ([README setup step 5](README.md#setup)). Public sign-up is turned off.
5. **Participant login codes**
   - are generated with a CSPRNG (`crypto.randomInt` / `crypto.getRandomValues`), not `Math.random`;
   - are 8 characters from a 31-symbol alphabet with no look-alike characters;
   - are stored only as a bcrypt hash (`bcryptjs`, cost 10), because codes are short;
   - are shown in plaintext once, to the admin, when issued;
   - can be reset by an admin (audited). A reset also logs the participant out everywhere and clears their lockout.
6. **Rate limiting.** Failed logins are tracked per account (participant ID, admin email) in `login_attempts`. Five failures in 15 minutes lock that account for the rest of the window; resetting the code clears the lock. There is no per-IP limit, because the whole venue shares one Wi-Fi IP and an IP limit would lock everyone out.
7. **Sessions** use random 32-byte tokens in `httpOnly; SameSite=Lax` cookies (`Secure` in production). Only the SHA-256 hash is stored. Sessions expire after 12 hours and are revoked on logout or code reset.
8. **Never log** passwords, raw login codes, session tokens, or secrets, including in `audit_log` before/after values.
9. **Least privilege.** RLS is on for every table, deny by default. Anonymous clients can read only `event_state` (phase, timer, projector screen; nothing private), which Realtime needs. Realtime is only a refresh signal; pages get data from the server. Every SQL function has `EXECUTE` revoked from `public`, `anon`, and `authenticated` (Postgres grants it to everyone by default), so only the server can call them.
10. **Private profile data.** Phone numbers are shown only on admin pages; discovery cards show name, summary, skills, and preferences.

## Threats and controls

| Threat | Control |
|---|---|
| IDOR (team A reads or edits team B) | `requireTeamMember()` looks up the team from the logged-in member's active membership; a team ID is never taken from the request |
| Participant calls admin action | `requireAdmin()` first in every admin page and Server Action; it checks the session type **and** re-checks the `admins` table |
| Brute-forcing login codes | Per-account lockout + bcrypt + ~39 bits of code entropy |
| Double-counted investments | `lock_allocation` saves and locks in one transaction and refuses a second lock; partial unique indexes; totals only from the `counted_investments` view |
| Tampered amounts/totals | `save_allocation` re-checks every rule in SQL; DB `CHECK` constraints; totals are computed in the DB, never accepted from the client |
| Actions after a phase closes | Server checks the current phase before every participant write (profile, swipe, pitch); marketplace writes check `marketplace_window()` inside the same SQL function |
| SQL injection | Parameterised queries via the Supabase client / SQL functions only; no string-built SQL |
| XSS | React escaping; no `dangerouslySetInnerHTML` on user content; pitch and summary rendered as plain text |
| CSRF | Server Actions' built-in origin check; `SameSite=Lax` cookies; custom Route Handlers verify `Origin` |
| Private data on projector | `/projector` is rendered on the server and selects only team numbers, member names, domains, and rules; Realtime carries no data |
| Secret leak in bundle | Pre-deploy check: grep the build output for key prefixes; review env var names |

## Audit log

Each entry records the actor, action, affected record, time, and before/after values (secrets excluded) for:

- participant creation and code resets;
- matchmaking open/close, matching runs, proposal clears;
- team approval, rejection, manual creation, dissolve (with number and domain);
- Google Form link changes and admin pitch edits;
- every timer action, pitch timer start, projector screen change, and phase setting edit;
- investment voids (with the voided allocation as the before value);
- finalist confirmations (before/after lists) and each reveal.

Multi-step admin changes are SQL functions that write their audit row in the same transaction. `audit_log` is append-only: even the server role has no UPDATE or DELETE grant on it.

## Required security tests

See [spec.md §17 Security/admin](docs/spec.md#securityadmin). These must pass before any deployment.

| Spec §17 requirement | Covered by |
|---|---|
| Participants cannot access admin routes/actions | `src/app/guards.test.ts`: every admin action and page calls `requireAdmin()` first; `supabase/db.test.ts`: anon/authenticated can execute **no** public function |
| Participants cannot alter roles, teams, domains, approvals, timers, totals, rankings | Same as above (all of these are admin-only SQL functions); team actions only reach `save_allocation`, `lock_allocation`, `set_driver`, pitch upsert, each with the team id from the session |
| Team credentials cannot access another team's workspace | `requireTeamMember()` reads the team from the DB; `guards.test.ts` fails if a team action reads a team id from the request; driver-only checks in SQL (`assert_team_driver`, `set_driver` tests) |
| Admin actions are authorised and audited | `guards.test.ts` (authorised); DB tests per admin function check the audit row |
| Secrets absent from frontend bundles and logs | `guards.test.ts`: no secret in `.next/static` after a build, no `NEXT_PUBLIC_*SECRET*`, no server imports in client components; `redactSecrets` unit test |
| Projector does not expose private information | `guards.test.ts`: the projector page selects no phone, code, hash, token, session or audit data; anon can read only `event_state` (DB test) |
| Reconnecting clients receive current timer and display state | Countdown is computed from server state (`src/lib/timer.test.ts`); `LiveRefresh` refreshes on reconnect |
