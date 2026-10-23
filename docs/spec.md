# Tinder for Startups — AI Agent Specification

**Event:** Tinder for Startups  
**Fest:** DAMRU, Rishihood University  
**Purpose:** Product requirements and implementation brief for the AI coding agent.  
**Status:** Working specification. Confirmed requirements are separated from open questions.

## 1. Instructions to the AI Agent

Build a secure event platform with three interfaces:
1. **Participant portal** for individual profiles, swiping, approved team workspace, startup pitch entry, and investment marketplace.
2. **Main admin control panel** for managing participants, teams, matching, rounds, timers, submissions, marketplace, leaderboard, and projector content.
3. **Projector display** showing the admin-selected phase information, countdown, rules, approved teams, investment leaderboard, or finalist announcement.

Inspect the existing repository before making changes. Choose an appropriate technology stack, prioritising free-to-use/free-tier services and security. Document service limits and any possible costs. Do not invent event rules or silently resolve open questions. Enforce permissions and critical rules server-side; hiding frontend controls is not sufficient. Keep matching logic separate from UI and database-access code. Never expose secrets or admin credentials in client code.

## 2. Event Overview

Tinder for Startups is an individual-participation event. Participants complete profiles, discover other participants, swipe to indicate interest, and form teams through mutual right-swipes. Approved teams receive a randomly assigned startup domain, develop a startup idea, submit a two-line idea pitch and a pitch deck, and invest virtual money in other teams' startups. The top seven teams qualify for final pitching.

Each team contains exactly two participants. The matching algorithm recommends teams; the admin reviews and approves them and can manually create/edit teams. Only mutual right-swipes are eligible for algorithmic matching. Participants without a valid mutual match remain unassigned unless the admin manually intervenes.

### Startup domains
1. Travel & Tourism
2. FinTech
3. EdTech
4. HealthTech
5. AI for Social Good
6. SaaS-Based Startups

Domains are assigned randomly per approved team. Repetition is allowed. Teams identify their own problem within the assigned domain.

## 3. Event Schedule and Timers

| Stage | Duration | What happens |
|---|---:|---|
| Introduction | 10 minutes | Introduction and explanation of event flow |
| Skill Filling | 5 minutes | Participants submit skills, preferences, and a two-line personal summary |
| Matchmaking | 10 minutes | Participants swipe; mutual right-swipes become eligible matches |
| Rest (going out not allowed) | 10 minutes | Rest period |
| Field Assignment & Startup Development | 50 minutes | Teams receive a random field, identify a problem, develop a startup, and submit deliverables |
| Break | 5 minutes | Rest period |
| Investment Marketplace | 15 minutes | Teams select and invest virtual money in other startups |
| Break & Top 7 Announcement | 5 minutes | Break and finalist announcement |
| Final Pitching | 70 minutes | Seven teams, each with 7-minute pitch, 2-minute Q&A, and 1-minute scoring rollover |
| **Total** | **180 minutes** | **3 hours** |

The schedule image's first eight stages total 110 minutes; final pitching adds 70 minutes for a three-hour event.

### Timer requirements
- Show a countdown for every phase, including rest/break periods.
- Main admin controls start, pause, resume, reset, end, and advance actions.
- Timer state must be authoritative and consistent across connected clients; refresh/reconnect must not silently reset it.
- The admin manually selects projector content. Do not automatically change the projector screen just because the phase changes.
- Log significant phase and timer changes.

## 4. Participant Access and Accounts

Workflow:
1. Participants enter skills, preferences, and a two-line personal summary.
2. Participants swipe through profiles.
3. The algorithm produces proposed teams.
4. The admin reviews and approves proposed teams, with manual team creation/editing available.
5. The system creates a shared team workspace/account.
6. Each approved team receives a unique team username and login code; both members use the shared team workspace.

Security:
- Separate participant/team permissions from admin permissions.
- Enforce authorisation server-side on every protected action/API.
- Never trust a client-supplied role, team ID, investment amount, score, or approval state without validating it against authoritative state.
- Generate team login codes securely; store safely, preferably hashed where practical; allow authorised reset/revocation.
- Rate-limit repeated login-code guesses.
- Do not expose private participant information to unrelated participants.
- Use secure sessions, input validation, least-privilege credentials, and audit logs.
- Do not log passwords, raw login codes, or secrets.
- Provide a secure initial-admin setup; do not hard-code a public default admin password.

## 5. Participant Portal

Before matchmaking, participants must complete:
- Skills
- Preferences
- Two-line personal summary

The portal should show profile completion status and allow discovery of every other participant. For each suggested profile, record:
- Viewer participant
- Viewed participant
- Swipe direction (right/left)
- Suggestion rank
- Timestamp, if available

Suggestion ranks must be unique within each participant's discovery sequence, start at 1, and lower ranks mean stronger preference. Prevent self-swipes and duplicate/conflicting swipe records. Skills may be displayed but must not affect the matching score unless the admin explicitly configures skill-based scoring.

After team approval, show the team workspace, assigned domain, phase countdown, startup submission information, marketplace pitch, and submission status. Participants cannot change team membership, domain assignment, another team's submission, investment totals, rankings, timers, or admin settings.

## 6. Required Matching Algorithm

Implement the supplied global optimisation algorithm; do not replace it with a greedy loop.

### Objective and eligibility
Form the maximum possible number of valid teams, then minimise the total combined preference score among all maximum-cardinality matchings. Only mutual right-swipes qualify.

For each eligible pair:
`Pair Score = Rank(A → B) × Rank(B → A)`

Lower score means stronger combined preference. Model participants as vertices and eligible mutual matches as edges; edge cost is Pair Score. Find a maximum-cardinality matching, then minimise total cost among maximum-cardinality matchings.

### Priorities
1. Maximise number of teams; each participant can belong to at most one algorithmic team.
2. Minimise total Pair Score among arrangements with the maximum team count.
3. Resolve ties deterministically; results must not depend on database processing order.

### Example
Eligible pairs: A–B 10, A–C 12, B–C 15, D–E 8, D–F 11, E–F 14. The algorithm should choose A–B and D–E, yielding two teams and total score 18.

### Requirements
- Exclude non-mutual right-swipes; never invent matches.
- Prevent duplicate teams and multiple active team memberships.
- Store team assignments, both original ranks, pair score, matching-run ID, and timestamp.
- Re-running with unchanged preferences/configuration must produce the same result.
- Keep matching logic separate from UI and database-access code.
- Handle ties and disconnected groups.

### Admin matching controls
Admin can trigger matching, inspect eligible pairs and ranks/scores, review proposed assignments, view unassigned participants, rerun/reset matching, approve/reject proposals, and manually create/edit teams. Manual assignments must be marked as admin overrides, not algorithm-generated matches.

Expected matching output:
1. Maximum number of algorithm-generated teams
2. Team participant IDs
3. Both suggestion ranks per team
4. Pair Score per team
5. Total matching score
6. Unassigned participant list
7. Matching-run record

Participants without mutual right-swipes remain unassigned unless manually assigned by admin.

## 7. Team Approval and Domain Assignment

Algorithm-generated teams are proposals until admin approval. Admin can approve/reject and manually create/edit teams. A participant cannot belong to multiple active teams. Approved teams receive shared team credentials and access to the team workspace. Record approvals and manual changes in audit logs.

Assign one of the six domains randomly to each approved team; domains may repeat. Whether domains can be changed/rerolled after assignment is an open question.

## 8. Startup Development and Submissions

**Duration: 50 minutes.**

Each team must submit:
1. A two-line startup pitch/solution for the marketplace.
2. A pitch deck for final pitching if the team qualifies.

Submission process:
- The website contains a configurable Google Form link through which teams submit the two-line idea pitch and pitch deck.
- Teams also enter the two-line idea pitch in the website dashboard for marketplace display.
- The dashboard pitch is the source shown on marketplace cards.
- Admin can edit/correct a team's two-line marketplace pitch; log the edit.
- Do not show the full pitch deck on marketplace cards.
- A full startup document is not required.
- Do not assume the application can read Google Form responses unless an integration is explicitly configured.
- Show submission status and validation messages.

Marketplace cards show the two-line pitch/solution and a team/startup identifier. Do not invent additional card fields. Pitch deck file type/size, late-submission policy, and verification of Google Form submissions remain open questions.

## 9. Investment Marketplace

**Total duration: 15 minutes.** The user specifies a five-minute evaluation/allocation period before confirmations count. The exact time split for the remaining confirmation phase should be configurable/open until confirmed; do not extend the total marketplace duration without approval.

### Rules
Each team:
- Receives ₹5,000 virtual money.
- Selects exactly seven different startups.
- Cannot invest in its own startup.
- Must invest at least ₹200 in each selected startup.
- Cannot use the same investment amount for two different startups.
- Must allocate the entire ₹5,000 with nothing left unallocated.
- Sees the two-line marketplace pitch, not the pitch deck.

### Workflow
1. Select top seven startups.
2. During the five-minute preparation period, distribute the ₹5,000 across the selected seven. Draft allocations do not count on the leaderboard.
3. When confirmation begins, confirm each of the seven investments individually.
4. Each individual confirmation updates confirmation progress/live admin view.
5. **A team's investments count only if all seven investments are confirmed. If fewer than seven are confirmed, none of that team's investments count.**
6. Validate constraints server-side. Prevent duplicate confirmations and double-counting.
7. Record timestamps and submission state.

Because incomplete submissions count as zero, the live display must not count partial investments toward the leaderboard. It may show pending/confirmation progress separately, but the exact visual treatment is an open question.

### Leaderboard
- Admin panel updates live.
- Projector can show the leaderboard when manually selected by admin.
- Investment totals remain hidden from participants during the marketplace.
- At close, calculate totals and rank teams by total investment received.
- Admin can open/close the marketplace, inspect selections/allocations/confirmations, and correct or void records only through authorised actions with audit logs.
- Participants cannot alter counted totals or rankings.

## 10. Top Seven Qualification and Ties

Rank teams by total virtual investment received. Exactly seven teams should qualify for final pitching.

Confirmed tie rules:
- Tie above seventh: tied teams retain their tied position; remove lowest-ranked team(s) as needed to maintain exactly seven finalists.
- Tie at seventh: all teams tied at seventh are eliminated.
- If eliminating seventh-place ties leaves fewer than seven finalists, promote next-highest-ranked eligible teams until exactly seven finalists remain.

Example: a tie for fifth preserves the tied position and lowest-ranked team(s) are removed as needed. A tie for seventh eliminates all teams tied at seventh; next-highest-ranked eligible teams are promoted.

The exact deterministic procedure for choosing which lowest-ranked team(s) to remove when a tie above seventh creates more than seven potential finalists remains open. Do not invent a tie-breaker.

Admin can review rankings, trigger/confirm qualification, display finalists, and log overrides.

## 11. Final Pitching

The website is not used by judges and must not include a judge scoring portal unless requirements change.

- Seven finalist teams.
- Each team: 7-minute pitch + 2-minute judges' Q&A + 1-minute scoring rollover.
- 10 minutes per team; 70 minutes total.
- Website responsibilities: show the phase and countdown, let admin control the timer, and let admin choose to display finalist announcements and event information.
- A previously drafted judging rubric and final-pitch tie-breaker were not approved; do not enforce or build them into a judging workflow.

## 12. Main Admin Control Panel

Securely restrict this interface to authorised admins. Required sections:

### Event overview
- Current phase and timer state
- Counts of participants, approved teams, unassigned participants, submissions, and marketplace completion
- Warnings/incomplete actions

### Participant management
- View/search profiles and completion status
- Review swipe/match status
- View unassigned participants
- Make authorised corrections with audit logging

### Matchmaking and teams
- Trigger/review global matching
- Inspect eligible pairs, ranks, scores, and proposed teams
- Approve/reject proposals
- Rerun/reset matching
- Create/edit teams manually
- Prevent duplicate active membership
- View team approval and credential status

### Domains and submissions
- View assigned domains
- Configure Google Form URL
- View/edit marketplace pitches
- Track pitch-deck submission status where available
- Audit admin edits

### Rounds and timers
- Start/pause/resume/reset/end/advance phases
- Control countdowns for all phases including breaks
- Manually select projector content
- Log phase/timer changes

### Marketplace and leaderboard
- Open/close marketplace
- View seven selections, draft allocation, individual confirmations, and completion status
- Distinguish draft/partial/complete submissions
- View counted totals and rankings
- Correct/void records only through authorised audited actions
- Control whether leaderboard is shown on projector

### Qualification and projector
- Review rankings and confirm top-seven qualification
- Choose projector content: phase timer/details, rules, confirmed teams, investment leaderboard, or finalist announcement
- Record qualification overrides and projector selection changes

### Audit log
Record actor, action, affected record, timestamp, and appropriate before/after values for team approvals/edits, manual assignments, domain changes if supported, timer actions, pitch edits, marketplace open/close, investment corrections, leaderboard actions, and qualification overrides. Never log secrets.

## 13. Projector Display

A separate presentation-friendly display controlled manually from the main admin panel. Use large readable typography, high contrast, and minimal clutter. It can show:
- Current phase and countdown
- Phase details/rules
- Confirmed teams
- Investment leaderboard
- Top-seven finalist announcement

Do not automatically change projector content solely because the phase changes. Update live when the admin changes the selected content or the selected content has live data. Never expose private participant information, login codes, or admin controls. The leaderboard remains hidden until admin chooses to show it.

## 14. Suggested Data Model

Adapt these conceptual entities to the chosen stack and existing project:

- **Participants:** ID, display/identity fields, skills, preferences, two-line personal summary, profile status, auth reference, timestamps.
- **Swipes:** viewer ID, viewed ID, direction, suggestion rank, timestamp; prevent conflicting duplicate records.
- **Matching runs:** ID, admin trigger, timestamp, algorithm/config version, result summary, status.
- **Teams:** ID, name/identifier, approval state, formation source (algorithm/manual), matching run, ranks/score if algorithmic, assigned domain, team auth reference, timestamps.
- **Team membership:** team ID, participant ID, membership status; prevent multiple active team memberships.
- **Startup submissions:** team ID, two-line pitch, pitch-deck submission status/reference where available, timestamps, last editor/audit reference.
- **Investment allocations:** investing team, target team, draft amount, confirmation state/time, submission state, counted/void state. Store rupee amounts as integers, not floating-point values.
- **Event phase/timer:** phase, duration, status, authoritative timing fields, actor/change history.
- **Projector state:** selected content type/context, last update, admin actor.
- **Audit log:** actor, action, entity, timestamp, before/after values excluding secrets.
- **Configuration:** Google Form URL, phase durations, domains, and other approved settings.

## 15. Validation and Security

At minimum, server-side validation must enforce:
- Approved complete team has exactly two participants.
- A participant cannot belong to multiple active teams.
- Algorithmic teams arise only from mutual right-swipes.
- Manual overrides are clearly labelled.
- No self-investment; exactly seven distinct targets; minimum ₹200 per target; no repeated amount within a team's allocation; total exactly ₹5,000.
- Incomplete seven-investment submissions count as zero.
- Confirmations are idempotent or otherwise protected from duplicate processing.
- Participants cannot edit other teams' submissions, team approvals, event phase, timers, investment totals, or rankings.
- Marketplace close state is enforced.
- Validate all request bodies and use database constraints where possible.
- Protect against common web vulnerabilities, insecure direct object references, injection, cross-site scripting, request forgery, and accidental data exposure.
- Use least-privilege credentials and secure session handling.
- Never trust client-calculated totals or scores.

## 16. Implementation Phases

1. **Foundation:** inspect repository, choose stack/services, set up app/database/migrations/authentication and roles.
2. **Profiles and matching:** profile forms, swipe records, global optimiser, deterministic tie-breaking, admin review and manual team controls.
3. **Team workspace and submissions:** team credentials, random domain assignment, Google Form link, dashboard pitch entry/editing, submission status.
4. **Timers and projector:** authoritative timers for every phase and break; manual projector content selection.
5. **Marketplace:** select seven, allocate ₹5,000, validate, individual confirmations, complete-submission counting, live admin leaderboard.
6. **Qualification and rehearsal:** ranking, top-seven tie logic with unresolved ambiguity surfaced, finalist display, full event simulation.
7. **Hardening/deployment:** permission/security tests, concurrency tests appropriate to expected capacity, backup/export plan, free-tier review, deployment and event-day recovery instructions.

Do not implement all phases in one unreviewable change. Report progress and test each phase.

## 17. Required Tests

### Matching
- Only mutual right-swipes are eligible.
- Maximise team count before minimising total score.
- Each participant appears in at most one algorithmic team.
- Deterministic reruns produce the same result with unchanged data/configuration.
- Unassigned participants are reported.
- Manual overrides do not corrupt algorithm-run records.

### Marketplace
- Reject self-investment.
- Reject other than seven unique targets.
- Reject amounts under ₹200.
- Reject repeated investment amounts within the same allocation.
- Reject total other than ₹5,000.
- Draft allocations do not affect counted totals.
- Confirmations update progress without double-counting.
- Incomplete seven-investment submissions count as zero.
- Complete valid submissions affect totals exactly once.
- Participants cannot alter another team's investments.
- Marketplace close is enforced.

### Security/admin
- Participants cannot access admin routes/actions.
- Participants cannot alter roles, teams, domains, approvals, timers, totals, or rankings.
- Team credentials cannot access another team's workspace.
- Admin actions are authorised and audited.
- Secrets are absent from frontend bundles and logs.
- Projector does not expose private information.
- Reconnecting clients receive current timer and display state.

### Full event rehearsal
Simulate the full three-hour event, including breaks, matching, approval, team credentials, submissions, marketplace, live leaderboard, top-seven calculation, and manually controlled projector screens.

## 18. Open Questions — Keep Open, Do Not Invent Answers

The user explicitly requested that remaining doubts be left open for resolution in another AI-agent conversation. Keep this list in the project documentation.

1. **Capacity:** Earlier discussion mentioned 20 teams and also 10 participants, which conflict. Confirm actual capacity.
2. **Eligibility/registration:** Who can participate? Is registration on Unstop only, or also inside this application?
3. **Participant identity:** Required identity fields beyond skills, preferences, and two-line summary.
4. **Credential distribution:** How individual access is issued before matchmaking and how team credentials are delivered after approval.
5. **Preference schema:** Exact options/structure and whether profiles can be changed after matchmaking starts.
6. **Swipe lifecycle:** Whether swipes can be undone/changed and when discovery locks.
7. **Algorithm tie-breaking:** Choose a stable deterministic tie-break rule independent of database processing order.
8. **Manual overrides:** Record admin-created teams that lack mutual right-swipes as overrides. Define any additional guardrails.
9. **Team changes:** What happens if an approved team changes after credentials are issued.
10. **Domain reassignment:** Whether the admin can reroll/change a domain after assignment.
11. **Google Form:** Exact URL and whether submissions are merely linked out to Forms or verified/imported by integration. Do not assume access to Google Form responses without configured permissions.
12. **Pitch deck:** Permitted file types, size limits, late-submission policy, and verification method.
13. **Marketplace time split:** The marketplace totals 15 minutes and includes a five-minute preparation/allocation period. Confirm the exact duration/start trigger of the confirmation phase.
14. **Live leaderboard:** Decide how to show confirmation progress while ensuring partial team investments do not count toward totals.
15. **Incomplete investments:** Confirm admin handling when a team fails to confirm all seven before close; the current rule is that none of that team's investments count.
16. **Investment corrections:** Whether and how admin can edit/void a confirmed investment and recalculate totals.
17. **Marketplace visibility:** Whether teams see every startup or only those with valid pitches; whether startup names require approval.
18. **Tie above seventh:** Define a deterministic procedure when a tie above seventh creates more than seven potential finalists.
19. **Top-seven edge cases:** What if fewer than seven teams have valid counted submissions or several teams have zero investment?
20. **Projector content:** Exact content per phase and whether participant/team-member names may be shown publicly.
21. **Admin accounts:** One admin or multiple admins; any different permission levels?
22. **Schedule recovery:** What happens if a phase is extended, skipped, or reset? Do later durations remain unchanged?
23. **Final results:** Does the platform only show finalists/timers, or should admin be able to publish final winners after judging?
24. **Judging rubric/tie-breaker:** Previously drafted rubric and final-pitch tie-breaker were not approved; exclude from enforced logic until confirmed.
25. **Privacy/retention:** When should participant profiles, swipes, login records, and investment records be exported, archived, or deleted?
26. **Expected concurrency:** Confirm participant/team count so service quotas and load requirements can be assessed.
27. **Deployment/domain:** Preferred hosting/domain, if any. Otherwise recommend a free-tier-compatible setup and document limits.
28. **Notifications:** Whether participants need email/WhatsApp notifications for credentials, approvals, or phase changes. Do not add integrations without approval.
29. **Admin domain controls:** Confirm whether domains may be changed after random assignment; do not silently assume.
30. **Timer reset behaviour:** Confirm whether resetting a timer resets only the clock or also phase-specific submissions/data.
31. **Leaderboard privacy:** Confirm whether the projector can show live counted totals during the marketplace or only after the marketplace closes. Totals must remain hidden from participants during the marketplace.
32. **Phase transitions:** Confirm whether advancing a phase automatically closes the previous phase's participant actions and whether admin can reopen it.

## 19. Definition of Done

The platform is ready for rehearsal when:
- Participants can complete profiles and swipe.
- Matching follows maximum-cardinality first, minimum total preference score second.
- Admin can approve/reject teams and manually intervene.
- Approved teams receive secure shared access.
- Teams can enter marketplace pitches and use the Google Form pitch-deck process.
- Every phase and break has an admin-controlled countdown.
- Projector content is manually selected from the main admin panel.
- Marketplace validates seven distinct startups and the complete ₹5,000 allocation.
- Investments are confirmed individually, but incomplete seven-investment submissions count as zero.
- Admin leaderboard updates reliably and can be selected for projector display.
- Top-seven qualification follows confirmed rules and surfaces unresolved tie behaviour.
- Participants cannot alter admin settings, other teams' data, counted investments, rankings, or timers.
- Setup, deployment, security, event-day testing, and recovery instructions exist.
- Unresolved questions remain explicit and are not silently converted into rules.

**End of specification.**
