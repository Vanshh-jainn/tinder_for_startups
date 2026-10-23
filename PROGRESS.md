# Progress

Phase plan from [spec.md §16](docs/spec.md#16-implementation-phases). Each phase is a separate reviewable change: build it, test it, update this file, then move on.

Status: `⬜ Not started` · `🟨 In progress` · `✅ Done` · `⛔ Blocked`

## Phases

| # | Phase | Status | Blocked by [open questions](docs/open-questions.md) |
|---:|---|---|---|
| 0 | Documentation & planning | ✅ Done | |
| 1 | Foundation | ⬜ Not started | 1, 4, 21 (partly; can start with defaults) |
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

### Phase 1 — Foundation

- [ ] Next.js + TypeScript app scaffold
- [ ] Supabase project; migrations folder; schema with constraints from [architecture.md](docs/architecture.md#data-model)
- [ ] RLS deny-by-default on all tables
- [ ] Admin auth (Supabase Auth) + secure first-admin setup (no default password)
- [ ] Session mechanism for participants/teams
- [ ] Audit log helper
- [ ] Test runner (Vitest) wired up
- [ ] README setup section filled in

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
