# Architecture

System design for Tinder for Startups. Requirements come from [spec.md](spec.md). UI and visual design live in [design.md](design.md). Matching details live in [matching-algorithm.md](matching-algorithm.md).

Status: **Phases 1–4 built** (foundation, profiles + matching, team workspace, timers + projector). Phases 5–7 (marketplace, qualification, hardening) are still design only; their sections are marked *planned*. Update this file when an implementation choice changes.

## Stack

| Concern | Choice | Why |
|---|---|---|
| App framework | Next.js (App Router) + TypeScript | One codebase for the participant portal, team workspace, admin panel, and projector. Server Actions and Route Handlers keep every write on the server. |
| Database | Supabase Postgres | Relational constraints enforce rules in the DB itself: unique membership, integer money, no self-swipe. Row-level security (RLS) is a second defence line. |
| Admin auth | Supabase Auth verifies the email + password; the server then issues its own session | Real accounts with no default password, but one session system for all roles. No `@supabase/ssr` or proxy needed. |
| Participant/team auth | Custom server sessions (httpOnly cookie, `sessions` table) | Participants log in with an admin-issued ID + code ([OQ-4](open-questions.md)). Team members reach the team workspace through their own login (`requireTeamMember()`); there is no shared team code. |
| Live updates | Supabase Realtime (Postgres Changes) on the single public `event_state` row, used as a "something changed" signal | `LiveRefresh` re-renders the page from the server when it fires. Data never travels over Realtime, so private fields can't leak through it. |
| Validation | `zod` at every server entry point | One schema per request body. |
| Tests | Vitest: unit tests for pure modules + `supabase/db.test.ts`, which runs every migration in PGlite (in-memory Postgres) with stand-in Supabase roles. Playwright for the Phase 6 rehearsal (planned) | No live database needed to test constraints, permissions, and SQL functions |
| Hosting | Vercel Hobby + Supabase Free | $0. See [limits](#free-tier-limits-and-costs). Default unless [OQ-27](open-questions.md) says otherwise. |

## Core principle: the server is the only writer

```
Browser ──(Server Action / Route Handler)──► Next.js server ──(service-role key)──► Postgres
   ▲                                                                                 │
   └──── Supabase Realtime: "event_state changed" signal only → page re-renders on the server ◄───┘
```

- Browsers **never write** to Supabase directly. Every mutation goes through a server function that:
  1. loads the session and derives the role and team ID from it (never from the request body),
  2. validates the body with `zod`,
  3. checks phase and state rules against the DB,
  4. writes inside a transaction,
  5. writes an audit-log row for admin actions.
- The service-role key exists only in server env vars. It must never appear in any `NEXT_PUBLIC_*` variable.
- RLS is **enabled on every table**, and table grants are revoked from `anon`/`authenticated`. The default is deny. The only planned read policy:
  - `anon`/`authenticated`: `SELECT` on `event_state` only (phase, timer fields, projector screen, team on stage). Needed for Realtime; holds no private data.
- Participants and teams read their own data through server-rendered pages, not through direct DB access.

## Pure domain modules

Rule logic stays out of UI and DB code so it can be tested alone:

| Module | Does | Spec |
|---|---|---|
| `src/lib/security.ts` (built) | Login-code generation, participant ID parsing, audit secret redaction | §4 |
| `src/lib/matching/` (built) | Max-cardinality, min-cost matching | §6 |
| `src/lib/timer.ts` (built) | Remaining time, clock format, Final Pitching segments, projector screen per phase | §3, §13 |
| `src/lib/marketplace/` (planned, Phase 5) | Validates an allocation: 7 distinct targets, no self-investment, each ≥ ₹200, no repeated amount, sum = ₹5,000. Decides whether a submission counts. | §9, §15 |
| `src/lib/qualification/` (planned, Phase 6) | Ranks teams and applies the confirmed top-7 tie rules. Returns `unresolved` with the tied teams when [OQ-18](open-questions.md) applies, so it never invents a tie-breaker. | §10 |

## Layout

```
src/
  app/
    page.tsx            home: links to participant and admin login
    login/              participant login (P-ID + code)
    me/                 participant: profile → swipe cards → waiting (redirects team members to /team)
    team/               team workspace: number, domain, pitch, Google Form link (marketplace in Phase 5)
    admin/
      login/            admin login
      event/            Event & projector: timer controls, pitch timer, projector screen, phase durations + rules
      page.tsx          Participants: add, reset code, profile/swipe/team status
      matching/         run matching, proposals, eligible pairs
      teams/            Teams & submissions: form link, pitches, dissolve, manual team
    projector/          public read-only display
  components/           ActionForm, Countdown, LiveRefresh, PhaseBar
  lib/                  pure modules (above)
  server/               DB clients, sessions, auth guards, rate limit, audit, shared queries
  types/                type stubs for untyped packages
supabase/
  migrations/           one SQL file per phase: tables, constraints, RLS, SQL functions
  db.test.ts            migration + DB-rule tests (PGlite)
```

## Data model

Mapped from [spec.md §14](spec.md#14-suggested-data-model). Money is `integer` rupees everywhere. Tables are created by the phase that first needs them; Phase 1 created `admins`, `participants` (ID, name, code hash), `sessions`, `login_attempts`, and `audit_log`. Phase 2 added profile columns, `discovery`, `swipes`, `matching_runs`, `teams`, and `team_members`. Phase 3 added team `number`/`domain`, `submissions`, and `config`. Phase 4 added `phases` and `event_state`. `investments` is planned for Phase 5.

Multi-step admin changes are **SQL functions** (`set_discovery`, `save_matching_run`, `reset_matching`, `decide_team`, `create_manual_team`, `dissolve_team`, `set_form_url`, `admin_set_pitch`, `timer_action`, `start_pitch`, `set_projector_screen`, `update_phase`). Each runs in one transaction and writes its own audit row, so a change can never land without its audit entry or half-applied. The server calls them via `rpc()` in `src/server/queries.ts`. Supabase caps API responses at 1,000 rows, so large reads (swipes) go through `fetchAll()`, which pages.

| Table | Key columns | DB-level guarantees |
|---|---|---|
| `participants` | id, number (shown as `P<number>`), display_name, code_hash, phone, skills, preferences, summary, profile_complete (generated) | Phone format, length limits |
| `discovery` | single row: status (`not_started`/`open`/`closed`) | Profiles lock once it leaves `not_started` |
| `sessions` | token_hash, subject_type (`admin`/`participant`), subject_id, expires_at, revoked_at | Stores only the token hash |
| `admins` | auth user id. Several admins, one permission level ([OQ-21](open-questions.md)) | |
| `swipes` | one row per deck card: viewer_id, viewed_id, rank, direction (null until swiped), swiped_at. Deck built at first open in random order | `CHECK (viewer_id <> viewed_id)`; PK `(viewer_id, viewed_id)`; `UNIQUE (viewer_id, rank)`; `CHECK (rank >= 1)` |
| `matching_runs` | id, admin_id, created_at, algorithm_version, team_count, total_score, unassigned | |
| `teams` | id, approval_state (`proposed`/`approved`/`rejected`/`superseded`/`dissolved`), formation_source (`algorithm`/`manual`), matching_run_id, rank_ab, rank_ba, pair_score, created_by, decided_by, number ("Team 7", from a sequence at approval), domain (random at approval) | Algorithm teams must have run + ranks + score, manual teams must not; manual teams are never `proposed`; approved/dissolved teams must have number + one of the six domains |
| `team_members` | team_id, participant_id, status (`proposed`/`active`/`ended`) | Partial unique index on `participant_id WHERE status = 'active'` |
| `submissions` | team_id (PK), pitch, updated_by (`participant:<id>`/`admin:<id>`), updated_at. Deck lives in the Google Form only | Pitch ≤ 2,000 chars (abuse cap, no product limit) |
| `investments` (planned, Phase 5) | investor_team_id, target_team_id, amount, confirmed_at, voided_at | `CHECK (investor_team_id <> target_team_id)`; `CHECK (amount >= 200)`; `UNIQUE (investor_team_id, target_team_id)`; `UNIQUE (investor_team_id, amount)` |
| `phases` | idx 0–8, name, duration_seconds, rules (admin-edited text) | Duration 1–240 min; rules ≤ 2,000 chars |
| `event_state` | single row: phase_idx (null = not started), timer_status, duration_ms, elapsed_ms, started_at, pitching_team_id, projector_screen (null = follow phase), updated_at | `running` ⇔ `started_at` set; screen from a fixed list. Public read for Realtime |
| `audit_log` | actor, action, entity, entity_id, before, after, created_at | Append-only (no UPDATE/DELETE grants) |
| `login_attempts` | key (`participant:<n>` or `admin:<email>`), attempted_at | Failed logins only; per-account lockout |
| `config` | single row: google_form_url | `https://` only |

*Planned for Phase 5; details may change with OQ-13–17, 34, 35.* The marketplace is open while the event is in the Investment Marketplace phase (OQ-32: phases drive participant access).

**Counted investments** come from a SQL view. A team's rows count only when the team has exactly 7 non-voided rows, all 7 have `confirmed_at`, and they were confirmed while the marketplace was open. The leaderboard is `SUM(amount)` per target over that view. Draft rows never reach it.

**Idempotent confirmation:** `UPDATE investments SET confirmed_at = now() WHERE id = $1 AND investor_team_id = $session_team AND confirmed_at IS NULL`, run only while the marketplace phase is active. A repeated call updates 0 rows, so nothing is counted twice.

## Timer

The timer is authoritative in the DB, not in any browser.

```
remaining = duration_ms − elapsed_ms − (timer_status = running ? now − started_at : 0)
```

- Admin actions go through `timer_action(start | pause | reset | end | extend | advance)` and `start_pitch(team)`; each updates `event_state` and writes an `audit_log` row in one transaction.
- **Advance** is one way and starts the next phase's timer. Entering Matchmaking opens discovery (decks built); leaving it closes discovery. Participant actions follow the phase: profile edits until Matchmaking, swiping only in Matchmaking, pitch edits only in Startup Development ([OQ-32](open-questions.md)).
- **Reset** changes only the clock ([OQ-30](open-questions.md)). **Extend** adds minutes to the current timer only ([OQ-22](open-questions.md)). **End** sets it to 0 without advancing.
- **Final Pitching** runs a 10-minute timer per team (`start_pitch`); clients split it into Pitch 7 / Q&A 2 / rollover 1 (`pitchSegment` in `src/lib/timer.ts`).
- Clients compute `remaining` locally 4× a second. Each server render passes `serverNow`, and `Countdown` corrects for the device clock being off.
- A refresh or reconnect re-reads the row, so the timer never resets on the client side. `getEventState()` calls `connection()` so pages that read it are never prerendered.

## Projector

- `/projector` is a public, read-only, server-rendered page. It re-renders on every `event_state` change.
- Screen = admin override if set, else the phase default (`screenFor` in `src/lib/timer.ts`): Matchmaking → animation, Rest → teams formed, Final Pitching → team on stage, other phases → that round's rules. Advancing clears the override. This deliberately changes the spec's "never switch automatically" rule (user decision, 2026-10-27).
- The phase timer is always in a corner (on the pitching screen it is the main element).
- Team changes, rule edits, and form-link changes bump `event_state.updated_at` through triggers, so the projector and every open page refresh.
- Shows only team numbers, member names (approved by the organiser), domains, and rules. Never phones, codes, or admin controls.

## Free-tier limits and costs

Verify the current numbers on the vendor pricing pages before the event; they change.

| Service | Relevant limit (at time of writing) | Risk |
|---|---|---|
| Supabase Free | ~500 MB DB; ~200 concurrent Realtime connections; project **pauses after ~7 days of inactivity**; no point-in-time recovery | Open the project before the event day. Count projector + admin + one connection per participant device against the Realtime cap ([OQ-26](open-questions.md)). Run a manual `pg_dump` export before and after the event. |
| Vercel Hobby | Intended for non-commercial use; function duration and invocation caps | The college fest fits non-commercial use. Keep server functions short; matching on ≤100 people runs in milliseconds. |

Expected cost: **₹0**. Paid tiers are needed only if capacity ([OQ-1](open-questions.md)) exceeds the free limits.

## Event-day recovery (outline, finalised in Phase 7)

- Timer and projector state live in the DB, so restarting any browser recovers them.
- Admin can re-select projector content and correct the timer with audited actions.
- Keep a fresh DB export from just before the event.
- Keep a second admin device logged in.
