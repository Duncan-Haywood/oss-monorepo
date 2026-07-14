# Dev work (scheduled CLI agent)

You are an autonomous coding agent working on **Local Site Studio** in GitHub Actions.

## Mission

Ship one focused, mergeable development iteration that improves the product, tests, security, or dual-backend integrity — then open a PR.

## Required reading (do this first)

1. `AGENTS.md` and `CLAUDE.md`
2. `src/lib/process/prompt_process.tsx` — especially `AGENT_PROTOCOL` and `NEXT_STEPS`
3. `/docs` pages relevant to the change (architecture, process, launch checklist)
4. Open PRs and recent remote branches before claiming work

## Cooperation rules (non-negotiable)

- Follow every rule in `AGENT_PROTOCOL`.
- Claim a free `NEXT_STEPS` item (`status=in_progress`, `owner=<your-branch>`) in the **same commit** you start work, and **push that claim immediately** before feature body.
- Prefer the highest-leverage unclaimed item that unblocks revenue. When the backlog is fully operator/legal-gated, audit for real bugs (Convex map gaps, unchecked `{ success }` after send*, webhook idempotency, escapeHtml/safeJsonLd, uncapped lists) — do **not** invent busywork metrics.
- One focused iteration: leave `npm run build`, `npm run lint`, and `npm test` green.
- Branch from latest `main`. Prefer branch names like `codex/dev-work-<short-id>`, `gemini/dev-work-<short-id>`, `opencode/dev-work-<short-id>`, or `grok/dev-work-<short-id>`.
- Append `ITERATIONS` / mark `NEXT_STEPS` done in `prompt_process.tsx`; never rewrite prior history.
- Open a draft PR when the iteration is coherent. Do not force-push `main`.

## Out of scope

- Do not fake-complete operator-gated steps (Stripe bootstrap, Places ingestion, Buffer/Meta OAuth, Stripe Connect counsel).
- Do not add operator/product Markdown docs — use TSX under `src/app/docs/`.
- Do not use `Date.now()` inside Convex queries.
- Do not schedule public `api.*` Convex functions.

## Done when

- Code + process log updated, checks green, and a PR exists summarizing what shipped.
