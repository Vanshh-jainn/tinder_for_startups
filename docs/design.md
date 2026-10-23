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
  --font: system-ui, sans-serif;
}
```

Every text/background pair must meet WCAG AA contrast (4.5:1). The projector should aim for AAA (7:1).

## Participant portal (phone)

**Persistent header:** phase name + countdown, always visible.

1. **Profile** (Skill Filling phase)
   - Fields: phone (organisers only), skills, preferences, summary. All free text ([OQ-3](open-questions.md), [OQ-5](open-questions.md)).
   - Summary max 160 characters; skills and preferences max 200. Partial saves allowed.
   - A completion indicator: "Profile 2/3 complete".
2. **Discovery / swipe** (Matchmaking phase)
   - One card at a time: summary, skills, and preferences. Show no private fields.
   - Visible ✕ Pass / ♥ Interested buttons (built). A swipe gesture can be added later on top, never instead.
   - Progress: "Profile 12 of 30".
   - No undo: swipes are final ([OQ-6](open-questions.md)).
   - Locked state: "Discovery closed. Waiting for team approval."
3. **Waiting** (after Matchmaking, before approval): a neutral message only. Do not hint at match results before the admin approves.

## Team workspace (phone + laptop)

Members land here automatically (`/me` → `/team`) once their team is approved. There is no separate team login.

- **Header:** "Team 7", assigned domain (prominent), member names. Phase countdown arrives in Phase 4.
- **Startup Development:**
  - A marketplace pitch editor (either member can edit; no product length limit) with save state ("saved at 14:02", flagged if an organiser edited it).
  - A Google Form button that opens the admin-configured URL in a new tab.
  - Submission status checklist: pitch saved ✓/✗; deck goes through the form (not tracked in the app).
- **Investment Marketplace:**
  1. **Select:** a grid of cards. Each card shows **only** the team/startup identifier and the two-line pitch (spec §8). The team's own card is excluded. A counter reads "4 / 7 selected".
  2. **Allocate:** 7 rows, each with an integer ₹ input. Live checks:
     - remaining = ₹5,000 − sum, shown big;
     - each amount ≥ ₹200;
     - duplicate amounts highlighted;
     - the confirm action is disabled until all rules pass.
     The server re-validates everything.
  3. **Confirm:** one confirm button per investment, with a progress bar "5 / 7 confirmed".
     - Clear warning: **"If you don't confirm all 7, none of your investments count."**
  - Investment totals and rankings are **never** shown to participants during the marketplace.
- **Read-only afterwards:** team members can't edit membership, domain, other teams, totals, or timers. These controls simply don't exist in the UI.

## Admin control panel (desktop)

A left nav with one page per section from spec §12, and a top bar with phase + timer + quick controls.

| Page | Key widgets |
|---|---|
| Overview | Phase/timer card; counts (participants, teams, unassigned, submissions, marketplace completion); warnings list |
| Participants | Searchable table, completion badge, swipe/match status, unassigned filter |
| Matching & Teams | "Run matching" button; eligible pairs table (ranks, score); proposed teams with approve/reject; unassigned list; manual team builder (labelled **Manual override**); credential status |
| Domains & Submissions | Domain per team; Google Form URL setting; pitch editor per team (logged) |
| Timers | Phase list with durations; start, pause, resume, reset, end, advance |
| Marketplace | Open/close switch; per-team status: draft / partial (n/7) / complete; counted totals and ranking; void/correct actions (audited) |
| Qualification | Ranking; top-7 result; **unresolved tie banner** when [OQ-18](open-questions.md) applies; confirm button |
| Projector | Content picker: timer, rules, confirmed teams, leaderboard, finalists. Shows a live preview of what is on screen. |
| Audit log | Filterable table: actor, action, entity, time, before/after |

Rules for the admin UI:

- Destructive or rule-changing actions (reset matching, void investment, reset timer, close marketplace, confirm qualification) need a confirm dialog that names the effect.
- Visually distinguish **algorithm** and **manual** teams everywhere, for example with a badge.
- Partial investments are shown with a different colour or label from counted ones. The exact treatment is open ([OQ-14](open-questions.md)).

## Projector (16:9, full screen)

- No navigation, no cursor, no controls. Sizes in `vw` so it scales to any projector.
- **Phase timer in the top-right corner on every screen** ([OQ-20](open-questions.md)); 0 shows "Time's up".
- Screens. Each phase has a default; the admin can override at any time (cleared on advance):
  - **Welcome** (before the event): title.
  - **Round rules** (default for Introduction, Skill Filling, Startup Development, breaks, Marketplace until Phase 5, Top 7): phase name + the admin's rules, one bullet per line.
  - **Matchmaking animation** (default for Matchmaking): cards swiping left/right, hearts floating, "Matchmaking in progress…". Static under `prefers-reduced-motion`.
  - **Teams formed** (default for Rest): grid of "Team 7 · names · domain", growing live as the admin approves.
  - **Team on stage** (default for Final Pitching): team number, names, domain, huge "Pitch · 06:12" segment timer.
  - **Leaderboard** (Phase 5, shown live during the marketplace per [OQ-31](open-questions.md)) and **Finalists** (Phase 6) come later.
- Never show login codes, private profile data, or admin UI.

## Accessibility basics

- Every interactive element is reachable by keyboard and has a visible focus ring.
- Buttons have text labels, not only icons.
- Colour is never the only signal (pair it with an icon or text).
- Countdown changes are announced via `aria-live="polite"` at minute boundaries only, to avoid noise.
- Respect `prefers-reduced-motion` for swipe animations.
