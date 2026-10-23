# AGENTS.md

Instructions for any AI coding agent working in this repo (Claude Code, Codex, Cursor, etc.).

## Read first, in this order

1. [PROGRESS.md](PROGRESS.md): the current phase and what is done.
2. [docs/spec.md](docs/spec.md): **the binding requirements.** If any other doc conflicts with it, the spec wins.
3. [docs/open-questions.md](docs/open-questions.md): what is *not* decided.
4. [docs/architecture.md](docs/architecture.md): stack, data model, the server-only-writes rule.
5. As needed: [docs/matching-algorithm.md](docs/matching-algorithm.md), [docs/design.md](docs/design.md), [SECURITY.md](SECURITY.md), [docs/product.md](docs/product.md).

## Hard rules

1. **Do not invent event rules.** If behaviour depends on an open question, do not choose an answer. Leave it configurable or admin-decided, add `TODO(OQ-n)`, and tell the user. If you find a new gap, add it to `docs/open-questions.md` as `Open`.
2. **Enforce on the server.** Every protected action checks role and ownership on the server. Never trust a client-sent role, team ID, amount, total, score, or approval state. Hiding UI is not enforcement.
3. **Use DB constraints where possible** (unique, check, partial unique index) as well as server validation.
4. **Keep domain logic pure.** Matching, marketplace validation, qualification, and timer maths live in `src/lib/*` with no DB/HTTP/UI imports.
5. **Matching must be the global optimiser** (max cardinality, then min total score) from [docs/matching-algorithm.md](docs/matching-algorithm.md). Never a greedy loop.
6. **Money is integer rupees.** No floats.
7. **Audit every admin mutation** (actor, action, entity, before/after). Never log secrets, login codes, or tokens.
8. **Keep secrets out of the client.** No service-role key or secret in `NEXT_PUBLIC_*`, client code, logs, or git.
9. **The projector never switches content by itself** on phase change. Only the admin selects what it shows.
10. **Don't build out-of-scope features**: judge portal, rubric, notifications, Google Form response import ([docs/product.md](docs/product.md#out-of-scope)).

## Workflow

- **One phase (or smaller) per change.** Never implement several phases in one unreviewable diff.
- For each change: write or adjust tests first for rule logic → implement → run tests → update `PROGRESS.md` checkboxes.
- Record any stack or design decision in the `PROGRESS.md` decision log with the date.
- When an open question gets answered, update `docs/open-questions.md` (status `Resolved` + answer) **and** the decision log.
- Keep docs in sync: if the code diverges from `docs/architecture.md`, update the doc in the same change.

## Commands

```bash
npm run dev            # local dev server
npm test               # Vitest unit tests
npm run lint
npm run build          # also generates Next's route types (LayoutProps/PageProps) used by `npx tsc --noEmit`
npx supabase db push   # apply new migrations to the linked Supabase project
```

## Code map

- `src/server/`: server-only code. `supabase.ts` (DB clients), `session.ts` (cookie sessions), `auth.ts` (`requireAdmin`, `requireParticipant`, `requireTeamMember`), `rateLimit.ts`, `audit.ts`, `queries.ts` (`rpc` + `adminResult` for admin DB functions, `fetchAll`, shared reads).
- `src/lib/`: pure, tested logic. `matching/` is the team optimiser.
- `supabase/migrations/`: schema + SQL functions. Multi-step admin changes go in a SQL function that also writes the audit row; revoke `EXECUTE` from `public, anon, authenticated` on every new function.
- `supabase/db.test.ts`: runs all migrations in PGlite and checks constraints and permissions. Add a test there for every new DB rule.
- `src/components/ActionForm.tsx`: the one form component; wraps a server action with `useActionState` and shows `error`/`notice`.
- Every admin page and admin server action calls `requireAdmin()` first.

## Conventions

- TypeScript strict mode. Validate request bodies with `zod`.
- DB changes go only through `supabase/migrations/`; never edit the live schema by hand.
- Tests live next to the code (`*.test.ts`); rule modules need the tests listed in spec §17.
- Commit messages use the conventional prefixes `feat:`, `fix:`, `docs:`, `test:`, `chore:`.

## Git and attribution

- **Never run `git commit` or `git push` yourself.** Stage changes only if asked. When work is ready, give the user the exact commit commands to run.
- **Never add AI/tool attribution anywhere**: no `Co-Authored-By: Claude …`, no "Generated with Claude Code", no AI tags in commit messages, PR descriptions, code comments, or docs.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
