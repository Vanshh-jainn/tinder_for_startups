# Tinder for Startups

Event platform for **Tinder for Startups** at **DAMRU, Rishihood University**. Participants swipe to form 2-person teams, build a startup in a random domain, invest virtual ₹5,000 in other teams, and the top 7 go to final pitching.

Three interfaces:

- **Participant portal / team workspace:** profile, swiping, team pitch, investment marketplace
- **Admin control panel:** phases, timers, matching, team approval, marketplace, qualification, audit log
- **Projector display:** admin-selected countdown, rules, teams, leaderboard, finalists

## Status

📄 **Planning complete; no code yet.** See [PROGRESS.md](PROGRESS.md).

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

Added in Phase 1 (environment variables, Supabase project, first-admin setup, local dev).
