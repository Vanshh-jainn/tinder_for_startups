# Tinder for Startups

Event platform for **Tinder for Startups** at **DAMRU, Rishihood University**. Participants swipe to form 2-person teams, build a startup in a random domain, invest virtual ₹5,000 in other teams, and the top 7 go to final pitching.

Three interfaces:

- **Participant portal / team workspace:** profile, swiping, team pitch, investment marketplace
- **Admin control panel:** phases, timers, matching, team approval, marketplace, qualification, audit log
- **Projector display:** a default screen per phase (rules, matchmaking animation, teams formed, investment leaderboard, finalist reveal, team on stage) with admin override, and the timer in a corner

## Status

🟨 **Phases 1–6 built; not yet run against a live Supabase project.** Next: run the [full rehearsal](#full-event-rehearsal), then Phase 7 (hardening + deployment). See [PROGRESS.md](PROGRESS.md#next-session-start-here).

## Stack

Next.js (TypeScript) · Supabase (Postgres, Auth, Realtime) · Vercel. All on free tiers; see [architecture](docs/architecture.md#free-tier-limits-and-costs).

## Docs

| File | What's in it |
|---|---|
| [docs/spec.md](docs/spec.md) | Full requirements: **source of truth** |
| [docs/product.md](docs/product.md) | Plain-language overview, event flow, scope |
| [docs/architecture.md](docs/architecture.md) | Stack, data model, security model, timer, free-tier limits |
| [docs/design.md](docs/design.md) | Screens and visual design for the portal, admin, and projector |
| [docs/matching-algorithm.md](docs/matching-algorithm.md) | The team-matching optimiser explained, with tests |
| [docs/open-questions.md](docs/open-questions.md) | Undecided items: **do not guess these** |
| [PROGRESS.md](PROGRESS.md) | Phase checklist + decision log |
| [SECURITY.md](SECURITY.md) | Roles, rules, threats, audit |
| [AGENTS.md](AGENTS.md) / [CLAUDE.md](CLAUDE.md) | Instructions for AI coding agents |

## Setup

Needs Node.js 20+ and a free [Supabase](https://supabase.com) account. Docker is not needed.

1. **Install dependencies**
   ```bash
   npm install
   ```
2. **Create a Supabase project** (free tier) in the Supabase dashboard.
   - Authentication → Sign In / Providers → turn **off** "Allow new users to sign up". Admins are added by hand only.
3. **Environment variables.** Copy the example and fill it in from Project Settings → API Keys:
   ```bash
   cp .env.example .env.local
   ```
   `SUPABASE_SECRET_KEY` is server-only. Never commit `.env.local` and never give the secret key a `NEXT_PUBLIC_` prefix.
4. **Apply the database migrations.** The project ref is in the dashboard URL.
   ```bash
   npx supabase login
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push
   ```
5. **Create the first admin.** There is no default password.
   - Dashboard → Authentication → Users → **Add user**: enter an email and a strong password, and tick auto-confirm.
   - Dashboard → SQL Editor, run:
     ```sql
     insert into public.admins (user_id)
     select id from auth.users where email = 'you@example.com';
     ```
   - Repeat for each additional admin.
6. **Run the app**
   ```bash
   npm run dev
   ```
   Open http://localhost:3000.

### Logging in

| Who | Where | How |
|---|---|---|
| Admin | `/admin/login` | Email + password of a Supabase Auth user listed in `admins` (setup step 5) |
| Participant | `/login` | `P<n>` ID + 8-character code. Admin → Participants → **Add participant** shows the code once; **Reset code** issues a new one |
| Team member | `/team` | No separate login: a participant in an approved team is sent there from `/me` |
| Projector | `/projector` | No login; open it full-screen on the projector machine |

Testing on phones on the same Wi-Fi: `npm run dev -- -H 0.0.0.0`, then open `http://<laptop-IP>:3000`.

### Scripts

```bash
npm run dev     # dev server
npm test        # unit + DB tests (Vitest, PGlite)
npm run lint
npm run build
```

### Manual check

1. Open `/admin/login` and log in as the admin.
2. Add a participant. Note the `P<n>` ID and code; the code is shown only once.
3. In a private window, open `/login` and log in with that ID and code. You should see "Hi, <name>".
4. Enter a wrong code 5 times. The 6th attempt says "Too many wrong attempts".
5. As admin, click **Reset code**. The participant's open session is logged out, the old code fails, and the new code works.
6. While logged in as the participant, open `/admin`. You should be sent to the admin login.
7. In Supabase → Table Editor → `audit_log`, you should see `participant.create` and `participant.code_reset` rows with no codes or hashes in them.

### Phase 2 manual check

Run `npx supabase db push` first to apply the new migration. Use 4+ test participants (private windows or different browsers).

1. Each participant fills in their profile. Leave one incomplete. Admin → Participants shows Complete/Incomplete and phone numbers.
2. Admin → Event & projector → advance until **Advance → Matchmaking**. The confirm dialog warns about the incomplete profile.
3. Participants refresh `/me`: profiles are locked and a card appears ("Profile 1 of N"). The incomplete participant sees the "talk to an organiser" message.
4. Make two pairs swipe ♥ on each other; everything else ✕. Admin → Participants shows swipe progress.
5. Admin → Event & projector → **Advance → Rest** (closes swiping), then Matching → **Run matching**. Both mutual pairs appear as proposals with ranks and scores; the rest are listed as unassigned.
6. Approve one, reject the other. Create a manual team from two unassigned participants; it shows the "Manual override" badge.
7. A participant in an approved team refreshes `/me` and sees their teammate's name.
8. Supabase → `audit_log` has rows for discovery, the matching run, approve/reject, and the manual team.

### Phase 3 manual check

Run `npx supabase db push` first. Continue from the Phase 2 check (at least one approved team).

1. Admin → Teams & submissions: each approved team shows "Team N", one of the six domains, and its source.
2. Paste an `http://` link: rejected. Paste your `https://` Google Form link: saved.
3. A member of an approved team opens `/me` and is sent to `/team`: team number, domain, both member names, the Google Form button.
4. That member saves a pitch. The other member refreshes and sees it; the admin Teams page shows it.
5. Admin edits the pitch. The team page now says "(edited by an organiser)".
6. A participant without a team opens `/team` and is sent back to `/me`.
7. Admin dissolves a team: its members land on `/me` again and can be put in a new manual team (new number + domain).
8. `audit_log` has `config.google_form_url`, `submission.edit_pitch`, and approve/manual rows that include the number and domain.

### Phase 4 manual check

Run `npx supabase db push` first. `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` must be set when you build or run, because live updates use them in the browser.

1. Admin → Event & projector → in the phases table, type a few rules for Introduction (one per line), Save.
2. Open `/projector` in another window. It shows "Tinder for Startups".
3. Click **Advance → Introduction**. Without reloading, the projector shows the rules and a corner timer counting down; participant pages show the phase bar.
4. Pause, +1 min, Resume, Reset clock, End now: the projector and phone timers follow each one.
5. Advance to Matchmaking: participant pages switch to swipe cards by themselves, and the projector shows the animation. Advance again: swiping closes, and the projector shows "Teams formed", filling in as you approve teams.
6. In Startup Development, a team can save its pitch; one phase later, the editor disappears.
7. Pick a different screen under Projector: it switches; advancing returns it to the phase default.
8. In Final Pitching, choose a team and start its timer. The projector shows "Pitch · 07:00", then Q&A, then the rollover.

### Phase 5 manual check

Run `npx supabase db push` first. You need at least 3 approved teams with saved pitches (8+ to test the full "pick 7" rule).

1. Advance into **Investment Marketplace**. The confirm dialog mentions decision time (and fewer than 8 startups, if so). The projector shows the leaderboard with "Decision time · 10:00".
2. On a team page: cards for other teams with a pitch only (not its own). Pick, type amounts. Break each rule (₹150, ₹250, two equal amounts, total ≠ ₹5,000, too few picks): the list explains it and Save stays disabled. Fix and save; the other member sees the saved allocation.
3. Admin → Marketplace shows that team as "Saved, not confirmed".
4. Click **Start confirmation time** (Event or Marketplace page). The team page switches to Confirm buttons by itself; editing is gone; the projector says "Confirmation time · live · 05:00". The timer reaching 0 changes nothing.
5. Confirm 6 of 7: the leaderboard doesn't change. Confirm the 7th: totals appear on the projector and admin page within a second, and "1 of N teams fully confirmed".
6. Admin → **Void** that team: totals drop; the team can redo and re-confirm.
7. Advance past the marketplace: confirm buttons disappear; the team sees whether its investments counted. Participant pages never show totals.

### Phase 6 manual check

Continue from the Phase 5 check, with several teams fully confirmed.

1. Admin → Qualification before the marketplace closes: the result is shown, but confirming is not possible yet.
2. Advance to **Break & Top 7**. The projector switches to the finalist reveal with "?" slots ("Finalists will be announced soon…" until you confirm).
3. Confirm the finalists. If a tie crosses the cut, tick the tied teams who go through. Teams with ₹0 never appear.
4. Click **Reveal next finalist** repeatedly: the projector reveals from the lowest place up, one at a time.
5. Advance to **Final Pitching**: the team picker lists only finalists. Starting a team shows it on stage with "Pitch · 07:00".

## Full event rehearsal

Run this once on the real Supabase project, with the projector machine and at least 4 phones (more is better). It walks through every phase in order.

**Before:** setup done ([Setup](#setup)), rules typed for each phase (Event & projector → Phases), Google Form link saved (Teams & submissions), `/projector` open full-screen.

1. **Participants:** add everyone (Participants page); hand out each `P<n>` + code. Everyone logs in at `/login`.
2. **Introduction:** Advance. Projector: rules + corner timer. Phones: phase bar counting down. Try pause / +1 min / resume.
3. **Skill Filling:** Advance. Everyone fills in their profile (phone, skills, preferences, summary). Leave one incomplete on purpose.
4. **Matchmaking:** Advance (the dialog warns about the incomplete profile). Phones switch to swipe cards; the projector shows the animation. Make several pairs swipe ♥ on each other.
5. **Rest:** Advance (swiping closes). Matching → Run matching → approve some proposals, reject one, create one manual team. The projector's "Teams formed" grows live; approved members' phones jump to `/team`.
6. **Startup Development:** Advance. Each team saves a pitch and opens the Google Form. Leave one team without a pitch. As admin, edit one pitch.
7. **Break:** Advance. Pitch editors disappear.
8. **Investment Marketplace:** Advance. Teams pick and allocate (try breaking each rule). The team without a pitch can invest but isn't a target. Then **Start confirmation time**: confirm all for most teams, only some for one team, nothing for another. Watch the projector leaderboard update live; try a **Void** and a redo.
9. **Break & Top 7:** Advance (the incomplete teams count as zero). Qualification → confirm → reveal one by one on the projector.
10. **Final Pitching:** Advance. Start each finalist's pitch timer in turn; check Pitch → Q&A → Scoring rollover on the projector.
11. **After:** in Supabase, look through `audit_log` for every admin action above, with no codes or hashes in it. Note anything odd for Phase 7.

Also try, at any point: refresh a phone (state comes back), turn Wi-Fi off and on (it reconnects and catches up), log in as a participant and open `/admin` (refused), open `/team` without a team (sent back to `/me`).
