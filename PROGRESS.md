# Progress

Phase plan from [spec.md §16](docs/spec.md#16-implementation-phases). Each phase is a separate reviewable change: build it, test it, update this file, then move on.

Status: `⬜ Not started` · `🟨 In progress` · `✅ Done` · `⛔ Blocked`

## Next session: start here

*Last updated 2026-10-27.*

**Where things stand**
- Phases 0–4 are built and committed (last commit `e5f6536`, Phase 4). Working tree clean.
- Checks at that commit: 47 tests pass (`npm test`: unit + PGlite DB tests); lint, type check, and build are clean.
- **Nothing has run against a real Supabase project yet.** The user plans to do the setup later: create the project, `.env.local`, `npx supabase db push` (4 migrations), first admin. Then run the README manual checks for Phases 1–4.

**Next: Phase 5, investment marketplace.** Before writing code, ask the user about:
- **OQ-13:** the time split inside the 15-minute marketplace (5-minute allocation, then confirmation). How long is confirmation and what starts it: a second timer, the remaining time, or an admin action?
- **OQ-14:** how confirmation progress shows on the admin and projector screens without counting partial teams.
- **OQ-15:** what admins can do with a team that confirms fewer than 7 before close (current rule: none of its investments count).
- **OQ-16:** whether admins can edit or void a confirmed investment, and how totals recalculate.
- **OQ-17:** do teams see every startup or only those with a saved pitch? Startup names are not used; teams show as "Team N".
- **OQ-34:** amount granularity (any whole rupee, or multiples of ₹50/₹100?).
- **OQ-35:** what if fewer than 8 teams have pitches (each team must pick 7 others)?
- Already decided: totals are visible on the projector during the marketplace (OQ-31) but never on participant pages; the marketplace is open only during the Investment Marketplace phase (OQ-32); the projector gets a **Leaderboard** screen as the default for that phase.

**Known gaps to remember**
- Admin can't edit a participant's profile (spec §12 "authorised corrections"); add if needed.
- No admin Overview or Audit log page yet (the audit log is readable in Supabase).
- OQ-7 (human tie-break rule for matching) and OQ-36 (odd participant count) are still open.

## Phases

| # | Phase | Status | Blocked by [open questions](docs/open-questions.md) |
|---:|---|---|---|
| 0 | Documentation & planning | ✅ Done | |
| 1 | Foundation | 🟨 Code done; waiting for the live Supabase check | 1 |
| 2 | Profiles & matching | 🟨 Code done; waiting for the live Supabase check | 7 (tie rule), 36 |
| 3 | Team workspace & submissions | 🟨 Code done; waiting for the live Supabase check | |
| 4 | Timers & projector | 🟨 Code done; waiting for the live Supabase check | |
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

### Phase 2 — Profiles & matching 🟨

- [x] Profile form (phone, skills, preferences, summary) + completion status; partial saves; locked once matchmaking opens
- [x] Admin open/close matchmaking switch (replaced in Phase 4: the Matchmaking phase now opens/closes it); random decks built at first open from complete profiles only
- [x] Swipe cards with Pass / Interested buttons; swipes final; DB constraints on self-swipe, duplicates, ranks
- [x] `src/lib/matching` (blossom, max-cardinality) + all tests in [matching-algorithm.md](docs/matching-algorithm.md#required-tests), incl. brute-force oracle and determinism
- [x] Admin: run matching, eligible pairs with ranks/scores, proposals, approve/reject, rerun, clear proposals, unassigned list
- [x] Admin: manual team creation labelled "Manual override"; edit = dissolve + recreate
- [x] Admin participant table: phone, profile status, swipe progress, team status
- [x] Atomic, audited SQL functions; DB tests (`supabase/db.test.ts`, PGlite) for constraints, permissions, decks, teams
- [ ] Not built: admin editing a participant's profile (spec §12 "authorised corrections"). Add when needed.
- [ ] **User:** push the migration and click through the [Phase 2 manual check](README.md#phase-2-manual-check)

### Phase 3 — Team workspace & submissions 🟨

- [x] Team access through members' own logins (`requireTeamMember`); `/me` redirects approved members to `/team`. No team codes, so no team login or rate limiting is needed
- [x] Team number ("Team 7") + random domain assigned on approval and manual creation; no reroll
- [x] Admin sets the Google Form link (https only, audited); teams get a button to it
- [x] Team pitch editor (either member) + submission checklist; admin pitch edit (audited, flagged to the team)
- [x] New admin page "Teams & submissions": form link, approved teams with domain/source/pitch, dissolve, manual team
- [x] DB tests for numbers/domains, pitch audit, https check, permissions (32 tests total)
- [x] Locking pitch edits: done in Phase 4 (editable only during Startup Development, [OQ-32](docs/open-questions.md))
- [ ] **User:** push the migration and click through the [Phase 3 manual check](README.md#phase-3-manual-check)

### Phase 4 — Timers & projector 🟨

- [x] `event_state` timer + `phases` (durations, rules); admin start/pause/resume/reset/end/extend/advance, all audited
- [x] Phases drive participant access: matchmaking opens/closes with its phase (admin switch removed); pitch edits only in Startup Development
- [x] Final Pitching: per-team 10-min timer split into Pitch 7 / Q&A 2 / rollover 1
- [x] Countdown computed on each device from the authoritative state, corrected for clock skew; reconnect-safe
- [x] Live updates via Realtime refresh signal on every participant, team, admin, and projector page (no more manual refresh)
- [x] `/projector`: corner timer, default screen per phase + admin override, matchmaking animation, teams formed, rules, team on stage
- [x] Admin "Event & projector" page: controls, pitch timer, projector picker, phase durations + rules
- [x] Tests: 8 DB tests (phases, discovery coupling, reset, pitch timers, override, audit, triggers, anon access) + 7 timer unit tests (47 total)
- [ ] **User:** push the migration and click through the [Phase 4 manual check](README.md#phase-4-manual-check)

### Phase 5 — Marketplace

Ask the open questions listed under [Next session](#next-session-start-here) first.

- [ ] `src/lib/marketplace` validation + tests (7 distinct others, no self, ≥ ₹200 each, no repeated amount, sum = ₹5,000, integers)
- [ ] `investments` table + SQL functions; marketplace open only in the Investment Marketplace phase
- [ ] Team UI: select 7 → allocate → confirm each; idempotent confirmations
- [ ] Counted-investments view; draft and partial (< 7 confirmed) excluded
- [ ] Admin marketplace page: per-team draft/partial/complete, counted totals and ranking, audited void/correct (per OQ-15/16)
- [ ] Projector **Leaderboard** screen, default for the marketplace phase, live (OQ-31)
- [ ] Totals never shown on participant pages
- [ ] DB tests + unit tests for every rule in spec §17 Marketplace

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
| 2026-10-25 | OQ-33: rank = position in a random deck built at first open. OQ-5: free-text skills/preferences. OQ-6: swipes final, admin open/close switch. OQ-3: name + participant-entered phone (admin-only) | User decision |
| 2026-10-25 | Decks include only profiles complete at first open; summary max 160 chars | User decision |
| 2026-10-25 | Matching library: `edmonds-blossom-fixed` (MIT) | Supports max-cardinality; matched brute force on 3,000 random graphs; fixes the original port's accidental globals |
| 2026-10-25 | Multi-step admin changes are SQL functions with in-transaction audit rows | Atomic; no half-applied team changes; closes the Phase 1 audit-ordering shortcut for these actions |
| 2026-10-25 | Team "edit" = dissolve + create manual team | Keeps algorithm run records intact (spec §17) |
| 2026-10-25 | DB tests run migrations in PGlite with stand-in Supabase roles | Catches constraint/permission mistakes without a live project |
| 2026-10-26 | **Spec deviation (§4 step 6):** no shared team username/code. Members use their own participant login to reach the team workspace | User decision: nothing shared to leak, every action traceable to a person |
| 2026-10-26 | OQ-9: team changes = dissolve + recreate. OQ-10/29: no domain reroll. OQ-11: link-out Google Form set by admin. OQ-12: deck rules handled in the form. OQ-28: no notifications | User decision |
| 2026-10-26 | Marketplace pitch: no product length limit; 2,000-char abuse cap in DB and form | User said no limit; cap only blocks megabyte pastes |
| 2026-10-26 | Team numbers come from a sequence at approval | Rejected/superseded proposals don't leave gaps |
| 2026-10-27 | **Spec deviation (§3, §13):** the projector follows a default screen per phase; admin can override any time | User decision |
| 2026-10-27 | OQ-20/22/30/31/32 answered (see open-questions.md); Final Pitching uses per-team 7/2/1 timers; rules are typed text | User decision |
| 2026-10-27 | Advancing starts the next timer; at 0 the phase stays open until the admin advances | Admin stays in control of transitions |
| 2026-10-27 | Realtime carries only a "changed" signal on `event_state`; pages re-render on the server | One public row, no private data over the wire, no payload-building code |
| 2026-10-27 | `projector_state` merged into `event_state` | One row, one subscription |
| 2026-10-27 | Supersedes 2026-10-24 rows on admin live views and Realtime rows: admin pages also refresh live via the `event_state` signal (no polling), and browsers read no table data over Realtime | Same mechanism everywhere; less code |
| 2026-10-27 | Pages reading `getEventState()` call `connection()` | `/projector` was being prerendered at build time, which would have shown stale data |
