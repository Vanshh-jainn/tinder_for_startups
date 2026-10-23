# Product Overview

A plain-language summary of what we are building and why. The binding requirements are in [spec.md](spec.md).

## What it is

**Tinder for Startups** is a 3-hour event at **DAMRU, Rishihood University**. Individuals arrive alone, build a profile, swipe on each other, and form 2-person teams. Each team gets a random startup domain, builds a startup idea, pitches it in two lines, and invests virtual money in other teams. The top 7 teams by investment received pitch to judges.

This platform runs the event: profiles, swiping, matching, team workspaces, timers, the investment marketplace, the leaderboard, and the projector screen.

## Users

| User | Device | Goal |
|---|---|---|
| Participant (individual) | Phone | Build a profile, swipe, get matched |
| Team (2 members, shared login) | Phone / laptop | See the domain, submit the pitch, invest ₹5,000 across 7 startups |
| Admin (organiser) | Laptop | Run the event: phases, timers, matching approval, marketplace, qualification, projector |
| Audience | Projector screen | Follow the phase, the countdown, teams, the leaderboard, and the finalists |

Judges do **not** use the platform.

## Event flow

| # | Stage | Minutes | Platform does |
|---:|---|---:|---|
| 1 | Introduction | 10 | Shows the countdown; the projector shows the rules |
| 2 | Skill Filling | 5 | Participants fill in skills, preferences, and a two-line summary |
| 3 | Matchmaking | 10 | Participants swipe; mutual right-swipes become eligible pairs |
| 4 | Rest | 10 | Admin runs matching, reviews it, and approves teams. Teams get credentials and a random domain. |
| 5 | Startup Development | 50 | Teams write the 2-line pitch in the dashboard and submit pitch + deck via the Google Form |
| 6 | Break | 5 | Countdown |
| 7 | Investment Marketplace | 15 | Teams pick 7 startups, allocate ₹5,000, and confirm each investment |
| 8 | Break & Top 7 | 5 | Admin confirms the top 7; the projector reveals the finalists |
| 9 | Final Pitching | 70 | 7 teams × (7 min pitch + 2 min Q&A + 1 min rollover); the projector shows the timer |

Total: 180 minutes.

## Core rules (summary)

- **Teams:** exactly 2 people. Only mutual right-swipes can be matched by the algorithm. The admin approves every team and can build teams manually; manual teams are marked as overrides.
- **Matching:** maximise the number of teams first, then minimise the total `Rank(A→B) × Rank(B→A)`. See [matching-algorithm.md](matching-algorithm.md).
- **Domains:** Travel & Tourism, FinTech, EdTech, HealthTech, AI for Social Good, SaaS. Assigned randomly per team; repeats are allowed.
- **Marketplace:** ₹5,000 per team. Exactly 7 other startups, at least ₹200 each, all amounts different, the full ₹5,000 used. **All 7 must be confirmed or none count.**
- **Top 7:** ranked by total investment received. Ties above 7th keep their position and the lowest-ranked teams are removed; ties at 7th are all eliminated and the next teams are promoted. Some edge cases are open ([OQ-18](open-questions.md), [OQ-19](open-questions.md)).

## Out of scope

Do not build these unless the requirements change:

- Judge scoring portal, judging rubric, final-pitch tie-breaker
- Reading Google Form responses (link-out only unless an integration is approved)
- Pitch deck display on marketplace cards
- Full startup document
- Email or WhatsApp notifications ([OQ-28](open-questions.md))
- Publishing final winners ([OQ-23](open-questions.md))

## Success criteria

See [spec.md §19 Definition of Done](spec.md#19-definition-of-done). In short: a full 3-hour rehearsal runs end-to-end with correct matching, correct marketplace counting, a reliable timer and projector, and no way for participants to change anything they shouldn't.
