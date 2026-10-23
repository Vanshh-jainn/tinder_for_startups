# Tinder for Startups

Event platform for **Tinder for Startups** at **DAMRU, Rishihood University**. Participants swipe to form 2-person teams, build a startup in a random domain, invest virtual ₹5,000 in other teams, and the top 7 go to final pitching.

Three interfaces:

- **Participant portal / team workspace:** profile, swiping, team pitch, investment marketplace
- **Admin control panel:** phases, timers, matching, team approval, marketplace, qualification, audit log
- **Projector display:** admin-selected countdown, rules, teams, leaderboard, finalists

## Status

🟨 **Phases 1–3 coded; waiting for the live Supabase check.** See [PROGRESS.md](PROGRESS.md).

## Stack (planned)

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

### Scripts

```bash
npm run dev     # dev server
npm test        # unit tests (Vitest)
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
2. Admin → **Open matchmaking**. The confirm dialog warns about the incomplete profile.
3. Participants refresh `/me`: profiles are locked and a card appears ("Profile 1 of N"). The incomplete participant sees the "talk to an organiser" message.
4. Make two pairs swipe ♥ on each other; everything else ✕. Admin → Participants shows swipe progress.
5. Admin → **Close matchmaking**, then Matching & teams → **Run matching**. Both mutual pairs appear as proposals with ranks and scores; the rest are listed as unassigned.
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
