# Event rehearsal

A full practice run of the event on the real Supabase project, start to finish, before event day. It's the only end-to-end test: there is no automated simulation (user decision, 2026-10-29). Tick each box as you go and note anything that breaks.

**Time:** about 1 hour. **People:** you as admin plus at least 4 participants on phones; 8+ is better (see [How many people](#how-many-people)).

## Contents

1. [Before you start](#1-before-you-start)
2. [Start the app](#2-start-the-app)
3. [Prepare the event](#3-prepare-the-event)
4. [Login and security checks](#4-login-and-security-checks)
5. [Run the event, phase by phase](#5-run-the-event-phase-by-phase)
6. [Checks to try at any point](#6-checks-to-try-at-any-point)
7. [After the rehearsal](#7-after-the-rehearsal)
8. [If something breaks](#8-if-something-breaks)

After a run: [Running it again](#running-it-again).

## 1. Before you start

- [ ] Setup is done ([README → Setup](../README.md#setup)): Supabase project, all migrations applied, `.env.local` filled in, first admin created, admin login works.
- [ ] Supabase → Authentication → Sign In / Providers → **"Allow new users to sign up" is off**.
- [ ] A Google Form exists for the team submissions (any test form is fine).

### How many people

| People | What you can test |
|---|---|
| 4 | Everything once: 2 teams, matching, marketplace, top 7 (with only 2 teams) |
| 8+ | Several teams, a rejected proposal, a manual team, a team with no pitch |
| 16+ (8+ teams) | The full marketplace rule "pick exactly 7 startups" |

With fewer than 8 teams, each team invests in all the other teams that have a pitch (approved deviation, OQ-35).

### Devices

| Device | Opens | Who |
|---|---|---|
| Admin laptop | `/admin` | You |
| Projector (second screen or tab, full-screen) | `/projector` | Nobody, it runs by itself |
| Phones (or private browser windows) | `/login` | Participants |

## 2. Start the app

1. In the project folder, start the app so phones on the same Wi-Fi can reach it:
   ```bash
   npm run dev -- -H 0.0.0.0
   ```
   Wait for "Ready". Leave the terminal running.
2. Find the laptop's IP: System Settings → Wi-Fi → Details (looks like `192.168.x.x`).
3. Phones on the **same Wi-Fi** open `http://192.168.x.x:3000/login`.
4. The admin opens http://localhost:3000/admin/login and logs in.

The first time each page opens in dev mode, it can take a while to load (it is being built). Reload if it seems stuck.

## 3. Prepare the event

- [ ] **Participants:** Admin → Participants → **Add participant** for each person. Note each `P<n>` ID and code: **the code is shown only once.** Hand them out.
- [ ] **Rules:** Admin → Event & projector → Phases table: type rules for each phase (one per line) and Save. Change durations here if you want a shorter rehearsal.
- [ ] **Google Form:** Admin → Teams & submissions: paste an `http://` link (should be refused), then your `https://` form link (saved).
- [ ] **Projector:** open `/projector` full-screen. It shows "Tinder for Startups".
- [ ] **Delete:** add a test participant with a typo, then Admin → Participants → **Delete** it. (Delete is only offered before Matchmaking opens.)

The 9 phases and their default timers:

| # | Phase | Timer |
|---:|---|---|
| 0 | Introduction | 10 min |
| 1 | Skill Filling | 5 min |
| 2 | Matchmaking | 10 min |
| 3 | Rest | 10 min |
| 4 | Field Assignment & Startup Development | 50 min |
| 5 | Break | 5 min |
| 6 | Investment Marketplace | 10 min decision time + 5 min confirmation time |
| 7 | Break & Top 7 Announcement | 5 min |
| 8 | Final Pitching | 10 min per finalist (Pitch 7 / Q&A 2 / rollover 1) |

**Timers only show time.** Nothing happens when a timer reaches 0; the admin moves every stage on with **Advance**.

## 4. Login and security checks

Use one test participant (say P1) in a private window.

- [ ] P1 logs in at `/login` with ID + code and sees "Hi, <name>".
- [ ] **Log out** asks "Log out?" first. Log back in with the same ID and code: it works. `P-1` and `p 1` work as the ID too.
- [ ] An ID that doesn't exist says "There is no participant P…". Enter a wrong code 5 times: each says "Wrong code for P1"; the 6th attempt says "Too many wrong codes … Try again in N min".
- [ ] Admin → Participants → **Reset code** for P1: P1's open session is logged out, the old code fails, the new code works (after the 15-minute lockout, or after clearing it, see [section 8](#8-if-something-breaks)).
- [ ] While logged in as P1, open `/admin`: you are sent to the admin login.
- [ ] P1 opens `/team` without a team: sent back to `/me`.

## 5. Run the event, phase by phase

Every step starts with Admin → Event & projector → **Advance**. Watch three places each time: the projector, the phones, and the admin page. All of them should update **by themselves, without reloading**.

### Phase 0: Introduction

- [ ] Advance. The projector shows the rules and a corner timer counting down; phones show the phase bar.
- [ ] Try **Pause**, **+1 min**, **Resume**, **Reset clock**, **End now**: the projector and phone timers follow each one.
- [ ] Under Projector, pick a different screen: the projector switches. Pick **Follow the phase** to go back.

### Phase 1: Skill Filling

- [ ] Advance. Everyone fills in their profile on their phone: phone number, skills, preferences, summary (max 160 characters). Saving part of it is fine.
- [ ] **Leave one profile incomplete on purpose.**
- [ ] Admin → Participants shows Complete/Incomplete and phone numbers.

### Phase 2: Matchmaking

- [ ] Advance. The confirm dialog warns about the incomplete profile.
- [ ] Phones switch to swipe cards by themselves ("Profile 1 of N"); profiles are now locked. The projector shows the matchmaking animation.
- [ ] The participant with the incomplete profile sees "talk to an organiser" and can't swipe.
- [ ] Make several pairs swipe ♥ on each other. Everything else ✕.
- [ ] Admin → Participants shows swipe progress.

### Phase 3: Rest (matching)

- [ ] Advance. Swiping closes on the phones.
- [ ] Admin → Matching → **Run matching**. Mutual ♥ pairs appear as proposals with ranks and scores; everyone else is listed as unassigned.
- [ ] Approve some proposals and **reject one**.
- [ ] Create a **manual team** from two unassigned participants: it shows the "Manual override" badge.
- [ ] The projector's "Teams formed" grows as you approve. Approved members' phones jump to `/team` by themselves.
- [ ] Admin → Teams & submissions: each approved team has "Team N", one of the six domains, and its source (algorithm or manual).
- [ ] Optional: **dissolve** a team. Its members land on `/me` again and can be put in a new manual team (new number and domain).

### Phase 4: Field Assignment & Startup Development

- [ ] Advance. Each team page shows the team number, domain, both member names, and the Google Form button.
- [ ] Each team saves a pitch; the other member sees it after it saves. The admin Teams page shows it.
- [ ] **Leave one team without a pitch on purpose.**
- [ ] As admin, edit one team's pitch: that team's page says "(edited by an organiser)".
- [ ] Teams open the Google Form from their button.

### Phase 5: Break

- [ ] Advance. Pitch editors disappear from team pages.

### Phase 6: Investment Marketplace

**Decision time** (10 min):

- [ ] Advance. The confirm dialog mentions decision time (and "fewer than 8 startups", if so). The projector shows the leaderboard with "Decision time · 10:00".
- [ ] A team page shows cards for the other teams **with a pitch** only (not itself, not the team without a pitch).
- [ ] The team without a pitch can still invest.
- [ ] Try to break each rule. The page explains what's wrong and **Save** stays disabled:
  - [ ] An amount that isn't a multiple of ₹100 (₹150)
  - [ ] Less than ₹200 (₹100)
  - [ ] Two equal amounts
  - [ ] Total not ₹5,000
  - [ ] Too few picks (7, or all available with fewer than 8 teams)
- [ ] Fix it and Save. The other member sees the saved allocation. Admin → Marketplace shows "Saved, not confirmed".

**Confirmation time** (5 min):

- [ ] Click **Start confirmation time** (Event or Marketplace page). Team pages switch to Confirm buttons by themselves and editing is gone. The projector says "Confirmation time · live · 05:00".
- [ ] Most teams confirm all their investments.
- [ ] One team confirms only some: the leaderboard doesn't change for it.
- [ ] One team confirms nothing.
- [ ] When a team confirms its last investment, totals appear on the projector and admin page within a second, with "X of N teams fully confirmed".
- [ ] Admin → Marketplace → **Void** one team: its totals drop; the team can redo and re-confirm.
- [ ] Let the timer reach 0: nothing changes until you Advance.
- [ ] Participant pages **never show totals**.

### Phase 7: Break & Top 7 Announcement

- [ ] Before advancing, open Admin → Qualification: the result is shown but **Confirm** is not possible yet.
- [ ] Advance. Partly confirmed and unconfirmed teams count as ₹0. The projector switches to the finalist reveal with "?" slots ("Finalists will be announced soon…").
- [ ] Admin → Qualification → **Confirm** the finalists. Teams with ₹0 never appear. If a tie crosses the 7-seat cut, tick the tied teams who go through.
- [ ] Click **Reveal next finalist** repeatedly: the projector reveals one at a time, from the lowest place up.

Qualification rules, for checking the result: top 7 by counted total; ₹0 teams never qualify; equal totals share a place; a tie at 7th place puts **all** the tied teams out, with nobody promoted; a tie at a higher place that crosses the cut is decided by the admin.

### Phase 8: Final Pitching

- [ ] Advance. The team picker lists **only finalists**.
- [ ] Start each finalist's timer in turn. The projector shows the team on stage with "Pitch · 07:00", then "Q&A" (2 min), then the rollover (1 min).

## 6. Checks to try at any point

- [ ] Refresh a phone: everything comes back as it was.
- [ ] Turn a phone's Wi-Fi off and on: it reconnects and catches up by itself.
- [ ] A participant opens `/admin`: refused (sent to the admin login).
- [ ] The projector never shows phone numbers, login codes, or admin controls.

## 7. After the rehearsal

- [ ] Supabase → Table Editor → `audit_log`: there is a row for every admin action above (participant create/reset, phase changes, matching, approvals, pitch edit, void, finalists, reveals), and **no codes or hashes** anywhere in it.
- [ ] Write down anything that was slow, confusing, or broken, for fixing before Phase 7.

## Running it again

After a run, Admin → Event & projector → **Reset event** (at the bottom). Type `RESET` and confirm.

- [ ] Participants, swipes, teams, pitches, investments and finalists are gone; participants' phones are logged out.
- [ ] The event is back to before Introduction; the projector shows "Tinder for Startups".
- [ ] New participants start at P1 again; new teams start at Team 1.
- [ ] Phase durations, rules, the Google Form link and your admin login are unchanged.
- [ ] `audit_log` has an `event.reset` row.

Then start again from [section 3](#3-prepare-the-event). Before the real event, reset once more so it starts clean.

## 8. If something breaks

**Report it like this** (a screenshot is best):

- Which page and which phase
- What you clicked
- What you expected, and what happened
- The error text: the red popup in dev mode (click the "Issues" badge, bottom left), the browser console (**Cmd + Option + J**), and any red lines in the `npm run dev` terminal

**Known problems and fixes:**

| Symptom | Cause | Fix |
|---|---|---|
| Admin login says "Wrong email or password" with the right password | The user isn't in the `admins` table | SQL Editor: `insert into public.admins (user_id) select id from auth.users where email = '<email>';` |
| "Too many wrong attempts" | 5 failed logins in 15 minutes | Wait 15 minutes, or SQL Editor: `delete from public.login_attempts where key = 'admin:<email>';` (participants: `'participant:<number>'`, e.g. `'participant:1'`) |
| Error `21000` / "UPDATE requires a WHERE clause" | A SQL function updates without `WHERE`; Supabase refuses it | Fixed in migration `20261030000000_safeupdate_where.sql`; make sure it is applied |
| Every database call fails with "Unregistered API key" | `SUPABASE_SECRET_KEY` is from another project or cut short | Copy it again from Project Settings → API Keys, then restart `npm run dev` |
| A page keeps loading the first time | Dev mode builds each page on first open | Reload the page |
| On another device, Login just clears the fields | Dev server blocks its JS for hosts other than `localhost` (`Blocked cross-origin request` in the terminal) | `allowedDevOrigins` in `next.config.ts` allows `10.*.*.*` and `192.168.*.*`; restart `npm run dev`. Other IP range? Add it there |
| A phone can't open the app | Not on the same Wi-Fi, or the app was started without `-H 0.0.0.0` | Check both; use the laptop's IP, not `localhost` |
