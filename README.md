# Tinder for Startups

Event platform for **Tinder for Startups** at **DAMRU, Rishihood University**. Participants swipe to form 2-person teams, build a startup in a random domain, invest virtual ₹5,000 in other teams, and the top 7 go to final pitching.

Three interfaces:

- **Participant portal / team workspace:** profile, swiping, team pitch, investment marketplace
- **Admin control panel:** phases, timers, matching, random pairing, marketplace, qualification, audit log
- **Projector display:** a default screen per phase (rules, matchmaking animation, teams formed, investment leaderboard, finalist reveal, team on stage) with admin override, and the timer in a corner

## Status

🟨 **Phases 1–6 built; live Supabase project set up and admin login works.** Next: run the [event rehearsal](docs/rehearsal.md), then Phase 7 (hardening + deployment). See [PROGRESS.md](PROGRESS.md#next-session-start-here).

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
| [docs/rehearsal.md](docs/rehearsal.md) | Step-by-step manual rehearsal of the whole event, with known problems and fixes |
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
   If you ran the migration files by hand in the SQL Editor instead, record them so a later `db push` doesn't re-run them: after `link`, run `npx supabase migration repair --status applied <version> ...` with each file's timestamp prefix, then check `npx supabase migration list`.
5. **Create the first admin.** There is no default password.
   - Dashboard → Authentication → Users → **Add user**: enter an email and a strong password, and tick auto-confirm.
   - Dashboard → SQL Editor, run:
     ```sql
     insert into public.admins (user_id)
     select id from auth.users where email = 'you@example.com';
     ```
   - Repeat for each additional admin.
   - Admin login says "Wrong email or password" both for a wrong password **and** for a user missing from `admins`. Check this insert first. Five failures lock the email for 15 minutes; to clear them: `delete from public.login_attempts where key = 'admin:<email>';`
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

## Testing

Automated: `npm test` (unit tests + DB tests in PGlite). End to end: the manual **[event rehearsal](docs/rehearsal.md)** on the real Supabase project: setup checks, login and security checks, every phase step by step, and known problems with their fixes.
