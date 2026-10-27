# Deployment and event-day runbook

How to put the app online on the free tiers (Vercel Hobby + Supabase Free, no custom domain) and run the event safely with about 70–90 participants. Decisions: [PROGRESS.md](../PROGRESS.md#decision-log), 2026-10-27.

## 1. Before deploying

1. **Database is up to date.** In the Supabase SQL Editor, every file in `supabase/migrations/` must have been run once, in filename order. The latest is `20261105000000_admin_edit_profile.sql`. To check: Table Editor → `teams` has a `driver_id` column, and Database → Functions lists `admin_update_profile` and `lock_allocation`.
2. **Sign-ups are off.** Supabase → Authentication → Sign In / Providers → "Allow new users to sign up" is **off**. Admins are added by hand ([README](../README.md#setup), step 5).
3. **Checks pass locally:**
   ```bash
   npm test && npm run lint && npm run build
   ```

## 2. Deploy on Vercel

1. Push the repo to GitHub (private is fine).
2. [vercel.com](https://vercel.com) → **Add New → Project** → import the repo. Framework: Next.js (detected). Leave build settings as they are.
3. **Environment variables** (Production, and Preview if you use it). Copy them from `.env.local`:

   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable key |
   | `SUPABASE_SECRET_KEY` | Secret key: **server only**, never with a `NEXT_PUBLIC_` prefix |

4. **Deploy.** The site gets a URL like `https://<project>.vercel.app`.
5. **Region.** `vercel.json` pins server functions to `bom1` (Mumbai), next to the Supabase project (`ap-south-1`). Check Vercel → Project → Settings → Functions → Function Region shows **Mumbai (bom1)**. If it shows Washington (iad1), every click waits for several trips to the US and back.
6. Changing an environment variable later needs a **Redeploy** (Deployments → ⋯ → Redeploy).

## 3. Smoke test on the live URL

Use phones on mobile data, not the dev laptop.

- [ ] `/` and `/login` load fast and show the theme.
- [ ] Paste the live URL into a WhatsApp chat: the preview shows the pink flame card. (Link previews are cached; a URL shared before deploying may show the old preview.)
- [ ] `/admin/login` works for each admin.
- [ ] Add a test participant, log in on a phone, log out, log back in.
- [ ] `/projector` on the projector laptop, full screen (F11 / Ctrl+Cmd+F). Advance a phase on the admin page: the projector follows within about a second.
- [ ] Event & projector → **Reset event** (type `RESET`) to remove the test data. **Never use Reset event during the real event.**

Then run the full [rehearsal](rehearsal.md) on the live URL once.

## 4. Free-tier check for 70–90 participants

Verify the numbers on the vendor pricing pages; they change.

| Limit | Event need | Verdict |
|---|---|---|
| Supabase Realtime: ~200 concurrent connections | ~90 phones + projector + 2 admin devices ≈ 95 | OK, about half the cap. Ask people to keep one tab open. |
| Supabase Realtime messages: ~2 M / month | One signal per change × ~95 devices; a few hundred changes | OK (tens of thousands) |
| Supabase database: 500 MB | A few MB | OK |
| Supabase **pauses after ~7 days without activity** | | Open the dashboard and the site **the day before** and again in the morning |
| Vercel Hobby: function invocations / bandwidth | ~95 devices × a few hundred refreshes | OK. Hobby is for non-commercial use; a college fest fits |

The heaviest moment is each marketplace lock: every open page refreshes once, spread over about a second (Phase 7A). Drafts don't trigger refreshes.

## 5. Event-day runbook

**Day before**
- Open Supabase and the live site (stops the free project from pausing).
- **Reset event**, then add every participant (Admin → Participants). Write each `P<n>` + code on a slip; codes are shown only once (**Reset code** issues a new one).
- Set phase durations and rules (Event & projector) and the Google Form link (Teams & submissions).
- Test the projector laptop on the venue Wi-Fi.

**At the start**
- Main admin on the laptop. **Second admin device** logged in at `/admin` with its own account, ideally on mobile data or a hotspot so it survives a venue Wi-Fi outage.
- Projector on `/projector`, full screen.

**If something goes wrong**

| Problem | What to do |
|---|---|
| Admin laptop dies or freezes | Carry on from the second admin device. Everything lives in the database; timers keep running. |
| Projector laptop dies | Open `/projector` on any other device. It shows the current screen and timer at once. |
| Venue Wi-Fi drops | Phones switch to mobile data; the site is on the internet, not the laptop. Pages catch up by themselves when they reconnect. |
| Participant logged out or switched phones | Log in again with the same ID and code. |
| Participant lost their code, or "Too many wrong codes" | Admin → Participants → **Reset code**; read out the new code. It also clears the lockout. |
| Team's driver phone dies | Admin → Teams & submissions → **Driver phone**: pick the other member. |
| Profile typo | Admin → Participants → **Edit** (audited). |
| Wrong team | Teams & submissions → **Dissolve**, then create a manual team. |
| Team locked wrong investments | Admin → Marketplace → **Void**; the team redoes and locks again while the marketplace is open. |
| A page looks stuck | Reload it. |
| Timer wrong | Event & projector: pause, +1/+5 min, reset clock. Timers only display time; nothing happens automatically. |

**Data.** All data is kept after the event (OQ-25). Supabase Free has no downloadable backups, so for a copy: Table Editor → each table (`investments`, `teams`, `team_members`, `finalists`, `participants`) → **Export to CSV**, after the marketplace and after the finalists are confirmed.
