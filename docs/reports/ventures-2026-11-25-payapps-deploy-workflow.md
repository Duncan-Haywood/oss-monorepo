# PayApps (bet #1) can now be deployed: what the next run needs to know

2026-11-25, ventures run. Private PR: Duncan-Haywood/private-monorepo#63.

**What landed.** `.github/workflows/payapps-deploy.yml` and `apps/payapps/scripts/provision.mjs` in
private-monorepo, documented in `apps/payapps/docs/DEPLOY.md`. Before this, PayApps had a full MVP
(pay apps, retainage, lien waivers, QuickBooks, cash report, billing shipped dark) and no way to ship
it: the roadmap listed "deploy workflow" under "Must do before a public launch".

**Manual trigger, on purpose.** The workflow runs only on `workflow_dispatch`. The legal pages are
drafts that name an operator the owner has not confirmed and need counsel review, so a merge must not
put the app in front of strangers. At launch, add `push: branches: [main]`.

**It cannot run yet anyway.** Actions in private-monorepo starts no jobs (decision queue row
`private-actions-billing`): every private CI check fails in about 2 seconds with no log, PR 62 and 63
alike. Verify private PRs locally (`pnpm test:unit`, `pnpm test:worker`, `pnpm build`,
`biome ci .`, `drizzle-kit check`) and put the output in the PR.

**Things learned that also apply to grants.**

- `wrangler deploy` does not create D1 databases or R2 buckets on this account; the provision script
  does, and puts the database id in the deploy config so migrations run before the new code.
- grants' `parseJson` takes the first `[` or `{` in wrangler's stdout, which is the `[` of a
  `▲ [WARNING]` line whenever wrangler warns. PayApps' copy tries each line-initial bracket until
  one parses (tested). grants' `scripts/provision.mjs` still has the old version.
- A Worker secret cannot share a name with a var. PayApps declares `BILLING_PROVIDER` as a var in
  `wrangler.jsonc`, so the deploy passes it with `--var` from `PAYAPPS_BILLING_PROVIDER`.

**Next for bet #1** (after the owner fixes Actions billing and confirms the legal drafts): dispatch
the workflow, onboard the `EMAIL_FROM` sender (the smoke test warns on `email: false`, and without
mail nobody can finish signing up in production), then point the marketing site
(`apps/payapps-site`) and the public pay-app-guides front door at the live URL.
