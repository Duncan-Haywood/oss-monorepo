---
kind: note
date: 2026-11-28
subjects: [cmmc, machine-shop-guides]
topics: [ci, hosting]
---
# Two failures that only main could see (2026-11-28)

Both were red on every merge to `main` on 2026-11-28 and green in every pull request, so no PR's
checks caught them.

## cmmc-deploy: production not updated since 06:28

`priv-cmmc-deploy.yml` checks out `ventures/cmmc` alone (sparse, it holds the Cloudflare secret).
`level1-parity.test.ts`, added 06:28 by PR #20096, statically imported
`ventures/machine-shop-guides/l1-data.mjs` to keep the app's Level 1 text equal to the free page's.
`cmmc CI` checks that venture out too, so PRs passed; the deploy failed in `pnpm test:unit` with
`ERR_MODULE_NOT_FOUND` on 12 consecutive merges (runs 30 to 41), and cmmc.marisstella.app kept the
06:28 build.

Fix: the test loads the file only when present (skipped in the deploy, run in cmmc CI), and fails if
it is missing while `GITHUB_WORKFLOW` is `cmmc CI`, so the check cannot go quiet where it runs. The
workflow was left alone: widening a secret-holding job's checkout for a test is the wrong trade.
Checked locally: present 3/3 pass, absent 1 pass 2 skipped, absent under `cmmc CI` fails, a one-word
edit to the free page's text fails; full unit (600) and worker (193) suites, provision tests, build
and the source-map check pass.

**For the next run:** a test in a venture with a sparse deploy must not import outside that venture
unconditionally. When a deploy is red, compare its `sparse-checkout` with the CI workflow's.

## Prompts: `test_duplicate_ids_are_refused`

`promptctl.backlog_files_added` returns `set()` on a push to main by design (a duplicate already on
main is a warning, P078). The test relied on the environment's answer being `None` (strict), which is
true locally and in PRs, false on main. It now pins `None` with a mock. Reproduced: main's copy fails
under `GITHUB_EVENT_NAME=push GITHUB_REF=refs/heads/main`; the fixed copy passes under both.
