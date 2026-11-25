# CMMC Workspace: legal pages and acceptance gate (private PR 159)

Bet #4 (`portfolio/monetization/bets.md`). `private-monorepo/apps/cmmc` ROADMAP "Billing, part 2",
merged as private PR 159 on 2026-11-25.

## What landed
- `apps/cmmc/docs/legal/{terms,privacy,refunds,acceptable-use}.md`, drafts ported from
  `apps/jobshop-quote` and rewritten for self-assessment (not a certification, not a C3PAO, not
  DoD-endorsed; the affirming official owns SPRS; AI drafts stay drafts; not a CUI enclave).
- The privacy page lists exactly what `services/drafting/prompts.ts` sends to Anthropic (evidence
  titles, never contents) and says the app sends no email (it has no email port). A unit test pins
  these phrases. **When someone adds an email port or changes the drafting context, update
  `privacy.md`, run `node docs/legal/sync-documents.mjs` and bump `POLICY_VERSION`.**
- `POST /api/orgs` refuses with 403 `legal_not_accepted` until the user accepts the current
  version, so the gate is enforced on the server, not only in the SPA (jobshop-quote only gates in the
  client).

## For the next run
- Step 1 of `apps/cmmc/docs/BILLING.md` "Turning it on" is done as drafts. Next billing item:
  part 3, the `cmmc-deploy` workflow with the Paddle catalog sync.
- Private-monorepo CI (`cmmc-ci.yml` and the others) failed within seconds on PRs 157 and 159,
  before `pnpm install`, so no runner ever reached the code. Verify locally: biome ci, typecheck,
  test:unit, test:worker, build, and the drizzle-kit drift check (all passed here).
- This session's network policy refused `downloads.leginfo.legislature.ca.gov`, which earlier runs
  reached. The PayApps California preliminary notice (§ 8200 ff.) is still open for a session that
  can reach that host.
