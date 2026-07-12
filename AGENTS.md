# AGENTS.md

## Process system — read this first

This repo is worked on by multiple independent agent sessions (different
branches, different schedules, no shared memory). Before starting work,
read `process/prompt_process.tsx` (start there — it links to the rest):

- `process/roadmap.ts` — phases/tasks with status (`not_started` /
  `in_progress` / `blocked` / `done`) and owner (`agent` / `human` / `both`).
- `process/decisions-log.ts` — append-only business/product decisions with
  rationale.
- `process/progress-log.ts` — append-only per-session summary of what changed.
- `process/interview-script.ts`, `process/capture-checklist.ts` — working
  product artifacts produced by the process, not just tracking data.

It's also rendered live at `/process/` on the docs site
(`docs-site/src/app/process/page.tsx` imports `ProcessDashboard` straight
from the repo-root `process/prompt_process.tsx`).

Convention going forward: default to TypeScript/TSX for documentation and
tracking (typed, greppable, buildable, and renderable on the docs site)
instead of freeform markdown, unless there's a strong reason otherwise
(e.g. long-form prose docs like this file, or content authored by humans
outside an editor with TS tooling).

When you finish a session that did real work: update the relevant
roadmap.ts task status, log a decision if you made one, and always append
one progress-log.ts entry — then build `research/` and `docs-site/` (and
run `npm test` in `pipeline/`) for anything you touched, before pushing.

## Cursor Cloud specific instructions

This repo has two Next.js 14 (App Router) static-export sites and one Node CLI package — no backend, database, or app auth.

### Enhancement pipeline (`pipeline/`)

Local CLI (Node + TypeScript, run via `tsx`, no build step) for the
concierge MVP's "Enhance" step — see `process/decisions-log.ts` for why
it's a local `sharp` pipeline and not a paid cloud AI API.

- **Test:** `cd pipeline && npm install && npm test` (generates synthetic
  images in a temp dir; no real listing photos or network calls needed).
- **Run:** `npm run enhance -- --in <raw-dir> --out <delivery-dir> --listing "<address>"`
- **Typecheck:** `npx tsc --noEmit` (strict mode).

### Lead intake (`pipeline/src/log-lead.ts`)

Appends one real entry to `process/leads-log.ts` without hand-editing
TypeScript, so a real reply/booking can be logged from a terminal (or a
phone SSH session) right after it happens. Never fabricates data — every
field is required input; there's no default lead content.

```bash
cd pipeline
npm run log-lead -- --audience agent --contact "Agent — Keller Williams downtown" \
  --channel email --stage contacted --notes "Replied interested to cold email" --dry-run
```

Drop `--dry-run` to actually write. Review the resulting `git diff
process/leads-log.ts` before committing, same as any other edit.

### Research report (`research/`)

- **Run (dev):** `cd research && npm run dev` → http://localhost:3000
- **Build:** `cd research && npm run build` → static export in `research/out/`
- **Lint/typecheck gotcha:** `npm run lint` hangs without an ESLint config. Use `npm run build` instead (runs typecheck + lint non-interactively).
- No environment variables required for dev or build.

### Docs site (`docs-site/`)

Private documentation deployed to **Cloudflare Pages** with **Cloudflare Access** (single-email allowlist: `duncan.andrew.haywood@gmail.com`).

- **Run (dev):** `cd docs-site && npm run dev` → http://localhost:3000
- **Build:** `cd docs-site && npm run build` → static export in `docs-site/out/`
- **Deploy:** `cd docs-site && npm run pages:deploy` (requires `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`)
- **Live URL:** https://listing-lens-docs.pages.dev
- **Access policy:** `DOCS_HOSTNAME=listing-lens-docs.pages.dev ./docs-site/scripts/setup-cloudflare-access.sh`
- GitHub Actions deploy: `.github/workflows/deploy-docs.yml` (secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`)
- Local dev does not enforce Access; production is gated at the Cloudflare edge.
