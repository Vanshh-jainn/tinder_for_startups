# Progress

Phase plan from [spec.md §16](docs/spec.md#16-implementation-phases). Each phase is a separate reviewable change: build it, test it, update this file, then move on.

Status: `⬜ Not started` · `🟨 In progress` · `✅ Done` · `⛔ Blocked`

## Phases

| # | Phase | Status | Blocked by [open questions](docs/open-questions.md) |
|---:|---|---|---|
| 0 | Documentation & planning | ✅ Done | |
| 1 | Foundation | 🟨 Code done; waiting for the live Supabase check | 1 |
| 2 | Profiles & matching | ⬜ Not started | 3, 5, 6, 7, 33, 36 |
| 3 | Team workspace & submissions | ⬜ Not started | 9, 10, 11, 12 |
| 4 | Timers & projector | ⬜ Not started | 20, 22, 30, 32 |
| 5 | Marketplace | ⬜ Not started | 13, 14, 15, 16, 17, 34, 35 |
| 6 | Qualification & rehearsal | ⬜ Not started | 18, 19 |
| 7 | Hardening & deployment | ⬜ Not started | 25, 26, 27 |

"Blocked by" means the phase needs that answer to be complete. Work can usually start, with the open part built behind config or left as a marked `TODO(OQ-n)`.

### Phase 0 — Documentation & planning ✅

- [x] Analyse the spec
- [x] Move the spec to `docs/spec.md`
- [x] README, AGENTS, CLAUDE, SECURITY, PROGRESS
- [x] docs: product, design, architecture, matching-algorithm, open-questions
- [x] Record new open questions found during analysis (33–36)

### Phase 1 — Foundation 🟨

- [x] Next.js 16 + TypeScript app scaffold (`cacheComponents` off)
- [x] Supabase CLI + `supabase/migrations/`; foundation tables only (`admins`, `participants`, `sessions`, `login_attempts`, `audit_log`)
- [x] RLS on + grants revoked from `anon`/`authenticated` on every table; `audit_log` append-only (verified in PGlite with stub roles)
- [x] Admin login (Supabase Auth password check → server session) + first-admin setup with no default password (README)
- [x] Session mechanism (`src/server/session.ts`): hashed tokens, httpOnly cookie, 12 h expiry, revocable
- [x] Participant login with admin-issued ID + code; admin can add participants and reset codes
- [x] Per-account login lockout (5 failures / 15 min)
- [x] Audit log helper with secret redaction
- [x] Vitest wired up (`npm test`, 7 passing); lint, typecheck, and build pass; no secrets in the client bundle
- [x] README setup section
- [ ] **User:** create the Supabase project, push the migration, create the first admin, and click through the [manual check](README.md#manual-check)

### Phase 2 — Profiles & matching

- [ ] Profile form + completion status
- [ ] Discovery + swipe records (rank, direction, timestamp; DB constraints)
- [ ] `src/lib/matching` pure module + all tests in [matching-algorithm.md](docs/matching-algorithm.md#required-tests)
- [ ] Admin: run matching, eligible pairs, proposals, approve/reject, rerun/reset, unassigned list
- [ ] Admin: manual team create/edit, labelled as an override

### Phase 3 — Team workspace & submissions

- [ ] Team credentials: generate, hash, show once, reset/revoke
- [ ] Team login + rate limiting
- [ ] Random domain assignment on approval
- [ ] Configurable Google Form link
- [ ] Two-line pitch editor; admin edit (audited); submission status

### Phase 4 — Timers & projector

- [ ] `event_state` timer + admin controls + audit
- [ ] Clients compute the countdown from the authoritative state; reconnect-safe
- [ ] Projector page + admin content picker; no automatic switching on phase change

### Phase 5 — Marketplace

- [ ] `src/lib/marketplace` validation + tests
- [ ] Select 7 → allocate → confirm each; idempotent confirmations
- [ ] Counted-investments view; draft and partial excluded
- [ ] Admin live view + open/close + audited void/correct
- [ ] Totals hidden from participants

### Phase 6 — Qualification & rehearsal

- [ ] `src/lib/qualification` with confirmed tie rules; surfaces unresolved ties
- [ ] Admin confirm + projector finalist reveal
- [ ] Full 3-hour simulated rehearsal

### Phase 7 — Hardening & deployment

- [ ] Security test suite (spec §17)
- [ ] Concurrency check at the expected capacity
- [ ] Backup/export plan
- [ ] Free-tier limits re-checked
- [ ] Deployment + event-day recovery runbook

## Decision log

Record each decision with a date. Answers to open questions also go in [docs/open-questions.md](docs/open-questions.md).

| Date | Decision | Why |
|---|---|---|
| 2026-10-24 | Stack: Next.js (App Router, TypeScript) + Supabase (Postgres, Auth, Realtime), hosted on Vercel Hobby + Supabase Free | Free tier; relational constraints + RLS; built-in realtime for the timer, projector, and leaderboard |
| 2026-10-24 | All DB writes go through the Next.js server; browsers only read public-safe/admin rows via Realtime | Server-side enforcement (spec §1, §4) |
| 2026-10-24 | Matching = Edmonds weighted blossom in max-cardinality mode, using an existing tested implementation | Spec §6 requires a global optimum on a general (non-bipartite) graph |
| 2026-10-24 | Spec moved to `docs/spec.md`; open questions tracked in `docs/open-questions.md` | Keep the root clean; one live tracker |
| 2026-10-24 | Dev uses a cloud Supabase project (no Docker); migrations applied with `npx supabase db push` | No Docker on the dev machine; free tier allows 2 projects |
| 2026-10-24 | OQ-4 (participants): admin-issued ID + code. OQ-21: several admins, one permission level | User decision |
| 2026-10-24 | Tables are added per phase, not all up front | Smaller reviews; open questions don't block early phases |
| 2026-10-24 | Admin password checked by Supabase Auth, then our own session (no `@supabase/ssr`, no proxy); admin live views poll | One session system for all roles; less code |
| 2026-10-24 | Next.js `cacheComponents` turned off | Every page depends on the session or live event state; caching risks stale data |
| 2026-10-24 | No per-IP login limit, only per-account lockout | The whole venue shares one Wi-Fi IP |
