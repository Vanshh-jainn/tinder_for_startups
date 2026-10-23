# Open Questions Tracker

This is the live list of unresolved decisions. Questions 1–32 come from [spec.md §18](spec.md#18-open-questions--keep-open-do-not-invent-answers). Questions 33 onward were found while analysing the spec to write the other docs.

**Rule for every contributor and AI agent:** do not answer a question here yourself. Do not turn a question into code behaviour. Build so the answer can be plugged in later, for example as a config value, an admin action, or a clearly marked `TODO(OQ-n)`. When the organisers decide something, write the answer here, set the status to `Resolved`, and copy the decision into [PROGRESS.md](../PROGRESS.md#decision-log).

Status values: `Open` · `Proposed` (someone suggested an answer and is waiting for approval) · `Resolved`.

| # | Area | Question | Blocks phase | Status | Answer |
|---:|---|---|---|---|---|
| 1 | Capacity | Earlier notes say both 20 teams and 10 participants. What is the real capacity? | 1, 7 | Open | |
| 2 | Registration | Who can take part? Do people register only on Unstop, or inside this app as well? | 1, 2 | Open | |
| 3 | Identity | Which identity fields are required beyond skills, preferences, and the two-line summary? | 2 | Resolved | 2026-10-25: display name (entered by admin) + phone (entered by participant, visible to admins only, never on cards). |
| 4 | Credentials | How do participants get individual access before matchmaking? How are team credentials handed over after approval? | 1, 3 | Resolved | **Participants (2026-10-24):** the admin adds each participant and issues a login code (ID `P<n>` + 8-character code, shown to the admin once, reusable until reset). **Teams (2026-10-26):** no separate team code; once a team is approved, each member's own login opens the team workspace (`/me` → `/team`). |
| 5 | Preferences | What exact options and structure do preferences have? Can a profile change after matchmaking starts? | 2 | Resolved | 2026-10-25: skills and preferences are free text (max 200 chars each); summary max 160 chars. Profiles lock when the admin opens matchmaking. |
| 6 | Swipes | Can a swipe be undone or changed? When does discovery lock? | 2 | Resolved | 2026-10-25: swipes are final. The admin opens/closes matchmaking with a switch; closing stops all swiping. Only profiles complete at the first open get a deck and appear in decks. |
| 7 | Matching tie-break | Which stable, deterministic tie-break rule should apply? It must not depend on database order. | 2 | Open | Determinism (sorted inputs) is built; the human-readable rule is still open. See [matching-algorithm.md §Tie-breaking](matching-algorithm.md#tie-breaking). |
| 8 | Manual overrides | Admin-made teams without mutual right-swipes are recorded as overrides. Are any other guardrails needed? | 2 | Open | |
| 9 | Team changes | What happens if an approved team changes after its credentials are issued? | 3 | Resolved | 2026-10-26: the admin dissolves the team and creates a new manual team (new number and domain; the pitch starts empty). |
| 10 | Domain reroll | Can the admin reroll or change a domain after it is assigned? | 3 | Resolved | 2026-10-26: no. The domain is random at approval/creation and fixed. |
| 11 | Google Form | What is the exact URL? Is the Form only a link-out, or are submissions verified or imported? | 3 | Resolved | 2026-10-26: the organiser builds the form and pastes its https link in the admin panel. Link-out only; no import. |
| 12 | Pitch deck | Which file types and size limits are allowed? What is the late-submission policy? How are decks verified? | 3 | Resolved | 2026-10-26: handled entirely in the Google Form; the organiser closes the form when time ends. The app does not track deck status. |
| 13 | Marketplace timing | The marketplace is 15 minutes with a 5-minute allocation period. How long is the confirmation phase, and what starts it? | 5 | Open | |
| 14 | Live leaderboard | How should confirmation progress be shown while making sure partial investments never count? | 5 | Open | |
| 15 | Incomplete investments | How does the admin handle a team that confirms fewer than 7 before close? The current rule is that none of its investments count. | 5 | Open | |
| 16 | Corrections | Can the admin edit or void a confirmed investment, and how are totals recalculated? | 5 | Open | |
| 17 | Marketplace visibility | Do teams see every startup, or only those with valid pitches? Do startup names need approval? | 5 | Open | |
| 18 | Tie above 7th | What deterministic procedure applies when a tie above 7th creates more than 7 potential finalists? | 6 | Open | |
| 19 | Top-7 edge cases | What happens if fewer than 7 teams have valid counted submissions, or several teams have zero investment? | 6 | Open | |
| 20 | Projector content | What exactly shows in each phase? May participant or team-member names be shown publicly? | 4 | Open | |
| 21 | Admin accounts | Is there one admin or several? Are there different permission levels? | 1 | Resolved | 2026-10-24: several admin accounts, all with the same permissions. |
| 22 | Schedule recovery | What happens if a phase is extended, skipped, or reset? Do the later durations stay the same? | 4 | Open | |
| 23 | Final results | Does the platform only show finalists and timers, or can the admin publish winners after judging? | 6 | Open | |
| 24 | Judging rubric | The earlier rubric and final-pitch tie-breaker were not approved. They stay out of enforced logic until confirmed. | 6 | Open | |
| 25 | Privacy and retention | When should profiles, swipes, login records, and investment records be exported, archived, or deleted? | 7 | Open | |
| 26 | Concurrency | How many participants and teams are expected? This decides quota and load needs. | 7 | Open | |
| 27 | Deployment | Is there a preferred host or domain? The current default is the free tiers of Vercel and Supabase. | 7 | Open | |
| 28 | Notifications | Do participants need email or WhatsApp messages for credentials, approvals, or phase changes? | 3 | Resolved | 2026-10-26: none. |
| 29 | Admin domain controls | Can domains change after random assignment? This overlaps with #10. | 3 | Resolved | Same as #10: no. |
| 30 | Timer reset | Does resetting a timer reset only the clock, or also the data submitted in that phase? | 4 | Open | |
| 31 | Leaderboard privacy | Can the projector show live counted totals during the marketplace, or only after it closes? Participants must not see totals during the marketplace. | 4, 5 | Open | |
| 32 | Phase transitions | Does advancing a phase close the previous phase's participant actions automatically? Can the admin reopen it? | 4 | Open | |
| 33 | Suggestion rank source | The algorithm uses `Rank(A→B)`, defined as "suggestion rank" in the discovery sequence (§5). Is the rank the order in which the system showed profiles, or does the participant rank people? If the system decides the order, what decides it? | 2 | Resolved | 2026-10-25: each participant's deck is a random order built when matchmaking first opens; rank = position in that deck (1 = shown first). |
| 34 | Investment granularity | Can amounts be any whole rupee, or must they be multiples of something like ₹50 or ₹100? The spec requires integers only. | 5 | Open | Found during analysis. |
| 35 | Minimum team count | Each team must pick exactly 7 other startups, so at least 8 teams with marketplace pitches are needed. What happens if fewer exist? | 5 | Open | Found during analysis. Related to #19. |
| 36 | Odd participant count | With 2-person teams, an odd number of participants always leaves someone unassigned. Is the admin expected to handle this (for example with a manual team of 3)? The spec says teams have exactly 2. | 2, 3 | Open | Found during analysis. |
