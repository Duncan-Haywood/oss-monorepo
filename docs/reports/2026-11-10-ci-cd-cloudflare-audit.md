---
kind: analysis
subjects: [ci]
topics: [ci, hosting]
date: 2026-11-10
tagged: auto
---
# CI/CD and Cloudflare audit, 2026-11-10: what the next run should pick up

Audit files: `portfolio/quality/audits/2026-11-10-{github-workflows,platform-pages-cloudflare,platform-edge}.json`
(stratum `topical`). Post: `docs/posts/2026-11-10-quality-audit-ci-cd-and-cloudflare.md`.

## Owner-only (asks.yaml `cloudflare-mail-and-ruleset`)

- The live `main` ruleset (id 26239454) has no required checks and no code-owner review;
  `.github/rulesets/main.json` has both. Check with
  `curl -s https://api.github.com/repos/Duncan-Haywood/oss-monorepo/rulesets/26239454`.
- Email routing never applied: no MX, SPF or DMARC on marisstella.app (DNS-over-HTTPS).

## Agent-doable, not done in PR 14427 (largest value first)

1. `platform/edge/worker.mjs` `/hit`: origin check plus a per-IP limiter, and count only slugs in
   the built catalog, not anything matching `SLUG_RE`. Fix README.md:28 with it.
2. `platform/edge/worker.test.mjs`: run schema.sql on `node:sqlite` (Node 22) instead of the fake D1,
   so SQL defects can fail a test (a seeded `n < ?2` to `n <= ?2` passed 28 of 28).
3. Inbox privacy copy (`platform/pages/build.mjs:5790-5795`): say that agents read mail via an AI
   model provider.
4. DNS as code: `dns-records.json` plus a plan/apply script beside `email-routing.mjs` (Zone DNS Edit
   token), and `routes = [{ pattern = "marisstella.app", custom_domain = true }]` in wrangler.toml.
   Needs token permissions, so it pairs with the owner ask.
5. Control plane (own small PR, waits for the owner): move the blog front-matter lint out of the
   deploy path in `portfolio-pages.yml` (it froze deploys 23 times in ten hours); drop `vars.CI_RUNNER`
   from 172 `runs-on` lines; delete stale hetzner/gitops comments; fix dead `paths:` filters in
   agent-permission-harness-ci.yml:63 and workflow-self-audit.yml:15,18; add `concurrency` to the
   distribute-* posters; drop `EMAIL_FORWARD_TO` (PR 12773 already does).
6. `ventures/actions-self-hosted-exposure-check` cannot evaluate this repo's fork-guarded `runs-on`
   expression (173 of 177 jobs "dynamic"), so no automated check covers fork PRs on self-hosted runners.
7. `platform/ci/ci_starvation.py` says "failure is real" for runs where 0 jobs ran
   (42672967842 and three others).
8. `portfolio/ledger/test_no_duplicate_yaml_keys.py` fails on `venture-scores.yaml` on main.
9. Control plane: `prompts/promptctl.py` `validate_posts` reads only the checker's stdout, so a
   crash (non-zero exit, empty stdout) reads as "no problems". That hid the 2026-11-10 import
   crash for 14 h; report the stderr as an error instead. The import itself is fixed in PR 14427.
