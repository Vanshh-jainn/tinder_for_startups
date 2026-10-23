# Architecture

System design for Tinder for Startups. Requirements come from [spec.md](spec.md). UI and visual design live in [design.md](design.md). Matching details live in [matching-algorithm.md](matching-algorithm.md).

Status: **planned**. No code exists yet. Update this file when an implementation choice changes.

## Stack

| Concern | Choice | Why |
|---|---|---|
| App framework | Next.js (App Router) + TypeScript | One codebase for the participant portal, team workspace, admin panel, and projector. Server Actions and Route Handlers keep every write on the server. |
| Database | Supabase Postgres | Relational constraints enforce rules in the DB itself: unique membership, integer money, no self-swipe. Row-level security (RLS) is a second defence line. |
| Admin auth | Supabase Auth verifies the email + password; the server then issues its own session | Real accounts with no default password, but one session system for all roles. No `@supabase/ssr` or proxy needed. |
| Participant/team auth | Custom server sessions (httpOnly cookie, `sessions` table) | Participants log in with an admin-issued ID + code ([OQ-4](open-questions.md)); teams will use a shared username + code. |
| Live updates | Supabase Realtime (Postgres Changes) for public-safe tables; admin pages poll the server | The timer and projector update without polling. Admin live views (leaderboard) poll every few seconds, which is fine for a handful of admins. |
| Validation | `zod` at every server entry point | One schema per request body. |
| Tests | Vitest (unit, pure modules); Playwright (rehearsal, Phase 6) | |
| Hosting | Vercel Hobby + Supabase Free | $0. See [limits](#free-tier-limits-and-costs). Default unless [OQ-27](open-questions.md) says otherwise. |

## Core principle: the server is the only writer

```
Browser ──(Server Action / Route Handler)──► Next.js server ──(service-role key)──► Postgres
   ▲                                                                                 │
   └────────────── Supabase Realtime (read-only, public-safe or admin-only rows) ◄───┘
```

- Browsers **never write** to Supabase directly. Every mutation goes through a server function that:
  1. loads the session and derives the role and team ID from it (never from the request body),
  2. validates the body with `zod`,
  3. checks phase and state rules against the DB,
  4. writes inside a transaction,
  5. writes an audit-log row for admin actions.
- The service-role key exists only in server env vars. It must never appear in any `NEXT_PUBLIC_*` variable.
- RLS is **enabled on every table**, and table grants are revoked from `anon`/`authenticated`. The default is deny. The only planned read policy:
  - `anon`: `SELECT` on `event_state` and `projector_state` (Phase 4). These contain no private data (see below).
- Participants and teams read their own data through server-rendered pages, not through direct DB access.

## Pure domain modules

Rule logic stays out of UI and DB code so it can be tested alone:

| Module | Does | Spec |
|---|---|---|
| `src/lib/matching/` | Max-cardinality, min-cost matching | §6 |
| `src/lib/marketplace/` | Validates an allocation: 7 distinct targets, no self-investment, each ≥ ₹200, no repeated amount, sum = ₹5,000. Decides whether a submission counts. | §9, §15 |
| `src/lib/qualification/` | Ranks teams and applies the confirmed top-7 tie rules. Returns `unresolved` with the tied teams when [OQ-18](open-questions.md) applies, so it never invents a tie-breaker. | §10 |
| `src/lib/timer/` | Computes the remaining time from the stored timer fields | §3 |

## Planned layout

```
src/
  app/
    (participant)/     profile, discovery/swipe
    team/              team workspace, pitch, marketplace
    admin/             control panel (admin session protected)
    projector/         read-only display
  components/          shared client components (e.g. ActionForm)
  lib/                 pure modules (above)
  server/              DB access, sessions, auth guards, audit log
supabase/
  migrations/          SQL schema, constraints, RLS policies
```

## Data model

Mapped from [spec.md §14](spec.md#14-suggested-data-model). Money is `integer` rupees everywhere. Tables are created by the phase that first needs them; Phase 1 created `admins`, `participants` (ID, name, code hash), `sessions`, `login_attempts`, and `audit_log`.

| Table | Key columns | DB-level guarantees |
|---|---|---|
| `participants` | id, number (shown as `P<number>`), display_name, code_hash; Phase 2 adds skills, preferences, summary, profile_status; more identity fields per [OQ-3](open-questions.md) | |
| `sessions` | token_hash, subject_type (`admin`/`participant`, `team` added in Phase 3), subject_id, expires_at, revoked_at | Stores only the token hash |
| `admins` | auth user id. Several admins, one permission level ([OQ-21](open-questions.md)) | |
| `swipes` | viewer_id, viewed_id, direction, rank, created_at | `CHECK (viewer_id <> viewed_id)`; `UNIQUE (viewer_id, viewed_id)`; `UNIQUE (viewer_id, rank)`; `CHECK (rank >= 1)` |
| `matching_runs` | id, admin_id, created_at, algorithm_version, config, total_score, unassigned, status | |
| `teams` | id, identifier, approval_state, formation_source (`algorithm`/`manual`), matching_run_id, rank_ab, rank_ba, pair_score, domain, username, code_hash | `UNIQUE (username)`; ranks/score set only if source = `algorithm` |
| `team_members` | team_id, participant_id, status | Partial unique index on `participant_id WHERE status = 'active'` |
| `submissions` | team_id, pitch (two lines), deck_status, updated_by, updated_at | `UNIQUE (team_id)` |
| `investments` | investor_team_id, target_team_id, amount, confirmed_at, voided_at | `CHECK (investor_team_id <> target_team_id)`; `CHECK (amount >= 200)`; `UNIQUE (investor_team_id, target_team_id)`; `UNIQUE (investor_team_id, amount)` |
| `event_state` | single row: phase, status, started_at, duration_ms, elapsed_before_pause_ms, marketplace_open | Single-row table |
| `projector_state` | single row: content_type, payload (JSON snapshot), updated_by, updated_at | Payload is built on the server and holds public-safe data only |
| `audit_log` | actor, action, entity, entity_id, before, after, created_at | Append-only (no UPDATE/DELETE grants) |
| `login_attempts` | key (username or IP), attempted_at | Used for rate limiting |
| `config` | google_form_url, phase durations, domains | |

**Counted investments** come from a SQL view. A team's rows count only when the team has exactly 7 non-voided rows, all 7 have `confirmed_at`, and they were confirmed while the marketplace was open. The leaderboard is `SUM(amount)` per target over that view. Draft rows never reach it.

**Idempotent confirmation:** `UPDATE investments SET confirmed_at = now() WHERE id = $1 AND investor_team_id = $session_team AND confirmed_at IS NULL`, run only while `marketplace_open`. A repeated call updates 0 rows, so nothing is counted twice.

## Timer

The timer is authoritative in the DB, not in any browser.

```
remaining = duration_ms − elapsed_before_pause_ms − (status = running ? now − started_at : 0)
```

- Admin actions (start, pause, resume, reset, end, advance) update `event_state` in one transaction and write an `audit_log` row.
- Clients get `event_state` through Realtime and compute `remaining` locally every frame. They correct for clock skew using a server-time offset fetched on load, so their local clock does not matter.
- A refresh or reconnect re-reads the row, so the timer never resets on the client side.
- What a reset or advance does to phase data is open ([OQ-22](open-questions.md), [OQ-30](open-questions.md), [OQ-32](open-questions.md)).

## Projector

- A read-only page subscribes to `projector_state`.
- The admin chooses the content type. The server builds a public-safe `payload` (for example, a leaderboard snapshot without private fields) and writes it.
- If the content holds live data (the leaderboard), the server rewrites the payload when the source data changes, and only while that content is selected.
- A phase change never changes `projector_state` by itself.

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
