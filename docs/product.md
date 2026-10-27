# Product Overview

A plain-language summary of what we are building and why. The binding requirements are in [spec.md](spec.md).

## What it is

**Tinder for Startups** is a 3-hour event at **DAMRU, Rishihood University**. Individuals arrive alone, build a profile, swipe on each other, and form 2-person teams. Each team gets a random startup domain, builds a startup idea, pitches it in two lines, and invests virtual money in other teams. The top 7 teams by investment received pitch to judges.

This platform runs the event: profiles, swiping, matching, team workspaces, timers, the investment marketplace, the leaderboard, and the projector screen.

## Users

| User | Device | Goal |
|---|---|---|
| Participant (individual) | Phone | Build a profile, swipe, get matched |
| Team (2 members, each using their own login) | Phone / laptop | See the domain, submit the pitch, invest ₹5,000 across 7 startups |
| Admin (organiser) | Laptop | Run the event: phases, timers, matching and random pairing, marketplace, qualification, projector |
| Audience | Projector screen | Follow the phase, the countdown, teams, the leaderboard, and the finalists |

Judges do **not** use the platform.

## Event flow

| # | Stage | Minutes | Platform does |
|---:|---|---:|---|
| 1 | Introduction | 10 | Shows the countdown; the projector shows the rules |
| 2 | Skill Filling | 5 | Participants fill in phone, skills, preferences, and a short summary (editable until Matchmaking starts) |
| 3 | Matchmaking | 10 | Advancing into this phase builds random swipe decks; participants swipe; mutual right-swipes become eligible pairs. The projector shows the matchmaking animation |
| 4 | Rest | 10 | Admin runs matching (matched pairs become teams at once), then **Random pairing** pairs everyone left. Each team gets a number and a random domain; members' own logins open the team workspace. |
| 5 | Startup Development | 50 | Teams write the pitch in their workspace (editable only in this phase) and submit pitch + deck via the Google Form |
| 6 | Break | 5 | Countdown |
| 7 | Investment Marketplace | 15 | Teams pick 7 startups and split ₹5,000, save drafts, then lock their whole allocation; each lock counts at once and the projector leaderboard updates live with animations |
| 8 | Break & Top 7 | 5 | Admin confirms the top 7 (choosing only if a tie crosses the cut); the projector reveals the finalists one by one |
| 9 | Final Pitching | 70 | 7 teams × (7 min pitch + 2 min Q&A + 1 min rollover); the admin starts each team's timer; the projector shows the team on stage |

Total: 180 minutes.

## Core rules (summary)

- **Teams:** 2 people (3 only for the odd one out after random pairing, OQ-36). Only mutual right-swipes can be matched by the algorithm; those pairs become teams at once. Leftover participants with complete profiles are paired at random. The admin can build teams manually; manual teams are marked as overrides.
- **Matching:** maximise the number of teams first, then minimise the total `Rank(A→B) × Rank(B→A)`. See [matching-algorithm.md](matching-algorithm.md).
- **Domains:** Travel & Tourism, FinTech, EdTech, HealthTech, AI for Social Good, SaaS. Assigned randomly per team; repeats are allowed.
- **Marketplace:** ₹5,000 per team. Exactly 7 other startups with a pitch (all of them if fewer), at least ₹200 each in multiples of ₹100, all amounts different, the full ₹5,000 used. **Only a locked allocation counts; a team locks all of it at once, and it's final.** The admin can void a team's submission so it can redo it.
- **Top 7:** ranked by counted investment; ₹0 teams are out. Equal totals share a place; whole places fit into 7 seats from the top, so lower places drop. A tie at 7th place: all out, nobody promoted. A higher tie across the cut: the admin chooses.
- **Timers** only display time. The admin moves every stage on.

## Out of scope

Do not build these unless the requirements change:

- Judge scoring portal, judging rubric, final-pitch tie-breaker
- Reading Google Form responses (link-out only unless an integration is approved)
- Pitch deck display on marketplace cards
- Full startup document
- Email or WhatsApp notifications ([OQ-28](open-questions.md))
- Publishing final winners (decided: finalists only, [OQ-23](open-questions.md))

## Success criteria

See [spec.md §19 Definition of Done](spec.md#19-definition-of-done). In short: a full 3-hour rehearsal runs end-to-end with correct matching, correct marketplace counting, a reliable timer and projector, and no way for participants to change anything they shouldn't.
