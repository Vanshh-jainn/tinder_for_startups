# UI & Visual Design

Screens, layouts, and visual rules for the three interfaces. The system design lives in [architecture.md](architecture.md).

No DAMRU or Rishihood brand assets have been supplied. Colours and fonts below are **placeholders** behind tokens, so branding can be swapped in later without touching components.

## Principles

- **Phone-first for participants.** Participants use their own phones, so design for 360 px width first.
- **Desktop-first for admin.** Dense and scannable, with every destructive or rule-changing action behind a confirm step.
- **Distance-first for the projector.** Readable from the back of a hall: huge type, high contrast, nothing interactive.
- **Never hide state.** The countdown and the current phase are visible on every participant and team screen.
- **Hiding is not security.** Controls that a role can't use are not rendered, but the server still rejects the action ([architecture.md](architecture.md#core-principle-the-server-is-the-only-writer)).

## Design tokens (placeholders)

```css
:root {
  --bg: #0f0f14;        --surface: #1a1a22;   --text: #f5f5f7;   --muted: #9a9aa8;
  --accent: #ff4f6d;    /* swipe right / primary */
  --reject: #6b6b78;    /* swipe left */
  --ok: #2ecc71;        --warn: #f5a623;      --danger: #e74c3c;
  --radius: 16px;
  --font: var(--font-body), system-ui, sans-serif;   /* Plus Jakarta Sans via next/font */
  --display: var(--font-display), var(--font);        /* Bricolage Grotesque, headings + projector */
  --grad: linear-gradient(135deg, #e0115f, #d93a1c);  /* buttons; white text stays AA */
  --grad-text: linear-gradient(90deg, #ff4f8b, #ff7a45);
  --border: #2c2c38;
}
```

Tinder-style theme (2026-10-26). Participant pages (`main.app`) are phone-first with a ≥768 px laptop layout; admin pages (`main.admin`) restyle tables, panels and a sticky nav bar, with tables scrolling sideways below 900 px; the projector (`main.projector`) adds ambient and per-screen entrance animations and a portrait fallback. Logo: the official Tinder 2017 flame + wordmark (`src/components/TinderLogo.tsx`, wordmark recoloured to `currentColor` for the dark theme) with "for Startups" beside it; the flame is also the favicon (`src/app/icon.svg`).

Every text/background pair must meet WCAG AA contrast (4.5:1). The projector should aim for AAA (7:1).

## Participant portal (phone)

**Persistent header (`PhaseBar`, built):** phase name + countdown, always visible; the page updates live.

1. **Profile** (editable until Matchmaking starts)
   - Fields: phone (organisers only), skills, preferences, summary. All free text ([OQ-3](open-questions.md), [OQ-5](open-questions.md)).
   - Summary max 160 characters; skills and preferences max 200. Partial saves allowed.
   - A completion indicator: "Profile 3/4 complete".
2. **Discovery / swipe** (Matchmaking phase)
   - One card at a time: summary, skills, and preferences. Show no private fields.
   - Visible ✕ Pass / ♥ Interested buttons (built). A swipe gesture can be added later on top, never instead.
   - Progress: "Profile 12 of 30".
   - No undo: swipes are final ([OQ-6](open-questions.md)).
   - Participants whose profile was incomplete when Matchmaking began are told to see an organiser.
3. **Waiting** (after Matchmaking, before approval): a neutral message only. Do not hint at match results before the admin approves. As soon as a team is approved, its members are moved to `/team` automatically.

## Team workspace (phone + laptop)

Members land here automatically (`/me` → `/team`) once their team is approved. There is no separate team login.

- **Header:** phase bar with countdown, "Team 7", assigned domain (prominent), member names.
- **Startup Development:**
  - A marketplace pitch editor, **only during Startup Development** (either member can edit; no product length limit; read-only text before and after), with save state ("saved at 14:02", flagged if an organiser edited it).
  - A Google Form button that opens the admin-configured URL in a new tab.
  - Submission status checklist: pitch saved ✓/✗; deck goes through the form (not tracked in the app).
- **Investment Marketplace (built):** shown once the marketplace phase starts.
  1. **Decision time (until the admin starts confirmation time):** a card per startup (only teams with a pitch; "Team N" + pitch; not your own). Tick a card to pick it and type an amount. Live: "4/7 picked · ₹1,200 left to allocate", a list of broken rules (count, ≥ ₹200, multiples of ₹100, all different, total ₹5,000). Save is disabled until every rule passes; either member can save; the server re-checks everything.
  2. **Confirmation time (started by the admin, 5-minute display timer):** no edits. A row per investment with a **Confirm** button, "5/7 confirmed", and the warning **"Confirm all 7. If you don't confirm every one, none of your investments count."** A team that saved nothing is told it can't invest.
  3. **After the marketplace:** "All 7 confirmed, so they counted" or "none of them counted".
  - Investment totals and rankings are **never** shown on participant pages (the projector shows them in the hall, per [OQ-31](open-questions.md)).
- **Read-only afterwards:** team members can't edit membership, domain, other teams, totals, or timers. These controls simply don't exist in the UI.

## Admin control panel (desktop)

A top nav (`AdminHeader`) on every admin page; all admin pages update live.

| Page | Status | Key widgets |
|---|---|---|
| Event & projector (`/admin/event`) | Built | Phase + big timer (display only); start/pause/resume, +1/+5 min, reset clock, end now, advance (confirm names side effects); **Start confirmation time** in the marketplace; Final Pitching picker (finalists only); projector screen picker (follow phase / override) + link to `/projector`; phase durations and rules; **Reset event** for dry runs (type RESET) |
| Participants (`/admin`) | Built | Matchmaking status + incomplete-profile warning; add participant (code shown once); table: ID, name, phone, profile, swipe progress, team, reset code, delete (only before Matchmaking) |
| Matching (`/admin/matching`) | Built | Run matching, clear proposals, last-run summary + unassigned; proposed teams with ranks/score, approve/reject; eligible pairs table |
| Teams & submissions (`/admin/teams`) | Built | Google Form link; approved teams with number, members, domain, source badge, editable pitch, dissolve; manual team builder (**Manual override**) |
| Marketplace (`/admin/marketplace`) | Built | Stage + countdown; Start confirmation time; counted leaderboard with "X of N teams fully confirmed"; per-team status (no allocation / saved / confirming m/k / complete), allocation summary, void (audited) |
| Qualification (`/admin/qualification`) | Built | Top-7 result from counted totals; note for ties / ₹0 teams; checkboxes when a tie crosses the cut; confirm (from Break & Top 7); confirmed list; **Reveal next finalist** |
| Overview, Audit log | Not built | Counts and warnings; filterable audit table (the log is in Supabase meanwhile) |

Rules for the admin UI:

- Destructive or rule-changing actions (reset matching, void investment, reset timer, close marketplace, confirm qualification) need a confirm dialog that names the effect.
- Visually distinguish **algorithm** and **manual** teams everywhere, for example with a badge.
- Partial submissions are labelled by status on the admin Marketplace page and never appear in totals ([OQ-14](open-questions.md)).

## Projector (16:9, full screen)

- No navigation, no cursor, no controls. Sizes in `vw` so it scales to any projector.
- **Phase timer in the top-right corner on every screen** ([OQ-20](open-questions.md)); 0 shows "Time's up".
- Screens. Each phase has a default; the admin can override at any time (cleared on advance):
  - **Welcome** (before the event): title.
  - **Round rules** (default for Introduction, Skill Filling, Startup Development, Break): phase name + the admin's rules, one bullet per line.
  - **Matchmaking animation** (default for Matchmaking): cards swiping left/right, hearts floating, "Matchmaking in progress…". Static under `prefers-reduced-motion`.
  - **Teams formed** (default for Rest): grid of "Team 7 · names · domain", growing live as the admin approves.
  - **Team on stage** (default for Final Pitching): team number, names, domain, huge "Pitch · 06:12" segment timer.
  - **Investment leaderboard** (default for the marketplace): stage ("Decision time · 08:12" / "Confirmation time · live · 03:40"), "X of N teams fully confirmed", rank · team · counted total, updating live as teams confirm ([OQ-31](open-questions.md)).
  - **Finalist reveal** (default for Break & Top 7): one slot per finalist showing "?", revealed from the lowest up each time the admin clicks *Reveal next*: place, team, names, domain, with a short scale-in animation.
- Never show login codes, private profile data, or admin UI.

## Accessibility basics

- Every interactive element is reachable by keyboard and has a visible focus ring.
- Buttons have text labels, not only icons.
- Colour is never the only signal (pair it with an icon or text).
- Countdowns use `role="timer"`. Minute-boundary `aria-live` announcements are not built yet.
- Respect `prefers-reduced-motion` for swipe animations.
