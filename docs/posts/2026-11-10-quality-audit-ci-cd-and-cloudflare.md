---
title: "Auditing our own CI/CD and Cloudflare setup: secure, but it doesn't gate"
seo_title: "Auditing our CI/CD and Cloudflare setup: secure, but not gating"
date: 2026-11-10
tags: [quality-audit, ci, cloudflare, infrastructure]
description: "None of three CI/CD and Cloudflare subjects meets the bar. The workflows are hardened; merges, deploy checks and mail DNS are not. Six fixes shipped."
---

This was a topical audit: the owner asked for a thorough one of the CI/CD process and the Cloudflare infrastructure. It continues the 2026-11-08 audit of `platform/ci`, which checked five scripts and left the workflows and Cloudflare alone. Same rubric as the rounds ([`portfolio/quality/README.md`](../../portfolio/quality/README.md)). The subjects were chosen, not drawn, so they are filed under a new `topical` stratum. They don't count toward the sampled share. Evidence is in [`portfolio/quality/audits/`](../../portfolio/quality/audits/), in the three `2026-11-10-` files below. Scores are before any fix.

## The number

**0 of 3 subjects meet the senior-professional bar.** One is finished (all it claims works end to end).

| subject | correctness | completeness | verification | craft | claims | fitness | domain |
|---|---|---|---|---|---|---|---|
| `.github/workflows` (129 files) | 3 | 3 | 3 | 2 | 2 | 2 | 3 |
| `platform/pages/cloudflare` (site Workers, email routing, zone) | 3 | 2 | 2 | 3 | 3 | 3 | 2 |
| `platform/edge` (counts, feedback, inbox Worker) | 2 | 2 | 2 | 3 | 2 | 2 | 2 |

## What is good

The workflow fleet is hardened past what most public repositories manage. All 129 files parse. Every one of 177 jobs has a timeout, and every file declares its permissions. All 414 action references are pinned to a full commit SHA. The one `pull_request_target` and the one `workflow_run` both check out trusted code without credentials, and no fork PR can reach a self-hosted runner. Runners are not the bottleneck either: jobs waited 2 to 4 seconds for one across 20 sampled runs.

The Cloudflare side does what its README says. Each part of the two-Worker split checked out against the live site, which served the commit of the last successful deploy. The edge Worker binds every SQL parameter, and its privacy copy matches what it stores.

## What is not at the bar

- **Merges don't wait for green.** The live `main` ruleset requires no status checks and no code-owner review. The file that describes it, `.github/rulesets/main.json`, asks for both. On the audit day three workflows were red on main. One PR merged 10 seconds after its own site check failed.
- **The site deploy can freeze on a blog title.** In 100 runs on main over about ten hours, the live site updated in 33 of the 60 that weren't superseded. 23 failures were one lint: a just-merged post whose title ran past 70 characters stopped the whole deploy. The longest stretch without a deploy was 96 minutes.
- **The deploy check could not tell old from new.** `verify-live.sh` confirmed that pages answer. The previous build answers too, so a deploy that published nothing would have passed.
- **The mail addresses bounce.** `marisstella.app` has no MX record, no SPF and no DMARC. Email routing is written as code but has never been applied. So `support@`, `hello@` and `accounts@` bounce, and anyone can send mail claiming to be the domain.
- **Page counts can be forged.** The count endpoint takes any slug from any origin, with no limit. That would also let a script spend the free database quota that the feedback form and inbox share. Its tests use a fake database that ignores the SQL, and a seeded bug in the SQL passed all 28 tests.
- **"Everything as code" stops at the zone.** DNS, the custom domain and HTTPS settings exist only in the Cloudflare dashboard.
- **Upkeep debt.** 172 `runs-on` lines still route through a switch for the self-hosted runner retired on 2026-10-01. 24 comment lines cite files deleted on 2026-10-30.

## What changed in this PR

1. `verify-live.sh` now fails unless the live `version.json` names this run's commit, on both hosts. A new test covers it, and a seeded bug in the comparison fails that test.
2. Both Workers now send HSTS, `nosniff` and a Referrer-Policy. Frame protection and a CSP are left out, with the reasons in the code.
3. The email-routing apply is a no-op on a re-run again: the old comparison depended on key order. It also reads a full page of rules.
4. 39 committed `.wrangler/` dev-state files are removed and ignored. One of them recorded the build machine's city and postal code.
5. Our Actions minutes estimator flagged every hourly cron as "more often than hourly", because 730 runs a month is more than 720.
6. Main's red checks are fixed: an over-long flagship entry and a post title, plus a 14-hour red test. The blog-post checker had started importing a helper that a test's standalone copy could not find, and the crash read as "no problems".

Two steps only the owner can take now have a row in the decision queue (`cloudflare-mail-and-ruleset`): apply the ruleset, and apply email routing plus a DMARC record. A later round re-audits; these scores do not move for fixes made in the same audit.
