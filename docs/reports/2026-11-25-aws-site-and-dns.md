---
kind: note
date: 2026-11-25
subjects: [aws, pages]
---
# AWS site and DNS stacks: state and next steps (2026-11-25)

For the next session on `aws-site-cloudfront` / `aws-route53-zone`.

## What exists

- `platform/aws/modules/static-site/`: bucket, OAC, CloudFront, WAF + logs,
  headers policy, two CloudFront Functions, optional ACM + aliases, app
  origins, OIDC publisher role. `tofu test` file in `tests/`.
- `platform/aws/stacks/site/`: the marisstella.app stack (phase 1 without custom
  domains, phase 2 with), `deploy/publish.mjs` (+ `sdk.mjs`, pinned AWS SDK
  3.1165.0 with lockfile), `deploy/emulate.mjs`, the draft job
  `ci/deploy-aws.job.yml` for `priv-portfolio-pages.yml`.
- `platform/aws/stacks/dns/`: the zone stack, `records.json` (unverified seed),
  `planned.json`, `scripts/cf_export.py`, `scripts/zone_diff.py`, runbook.

## Verified here

- `node --test` on functions (9), publish (8), emulator (4): all pass.
- `python3 -m unittest` on the DNS scripts (12): pass.
- Every `.tf`/`.tftest.hcl` parses (python-hcl2).
- Checkov 3: 45 passed, 0 failed, 12 skipped with inline reasons.

## Not verified here, and why

- **`tofu fmt -check`, `tofu init`, `tofu validate`, `tofu test` never ran.**
  Downloading the OpenTofu release binary was refused by this session's
  permission classifier (twice, even with the checksum verified). The first
  session with `tofu` available should run them in each of the three
  directories and commit `.terraform.lock.hcl`; expect small fixes (the
  tests were written against the provider 6.x schema from memory).
- Trivy was not run (same binary-download question).
- The Cloudflare export: no token.

## Decisions a reader might question

- SSE-S3 not KMS on the site bucket: ETag = MD5 makes changed-only deploys
  possible (see `site/README.md`, "Scanner baseline").
- 307 (not 301) for trailing-slash and `.html` redirects: matches
  Cloudflare's auto-trailing-slash today, so nothing changes for search
  engines at cutover. Host redirects (`www.`, `grants.`) are 301 as before.
- Directory stubs + viewer-response function instead of a KeyValueStore:
  no extra API calls in the deploy, and the layout is plain S3 objects.
- The site stack owns the apex/www/grants alias records and the ACM
  validation records; the dns stack owns everything else, and other stacks
  add apex TXT/MX through its `extra_records` (one record set per name and
  type in Route 53).

## Fits with PR 18749 (the org, baseline, email and llm stacks)

- Layout `platform/aws/stacks/<stack>/` + `platform/aws/modules/<name>/`,
  as that PR set (the orchestrating session asked for it mid-run).
- Record ownership in the zone: `stacks/email` writes `_dmarc`, SES DKIM
  and the `bounce.` MAIL FROM records once its `route53_zone_id` is set;
  `stacks/site` writes the aliases and ACM validation; `stacks/dns` the
  rest. `planned.json`'s `allow` list holds the map, and `cf_export.py`
  marks exported records on an owned name `replaced_by` their owner. This
  run first had DMARC `p=reject` in `planned.json`; it was dropped because
  the email stack owns `_dmarc` and starts it at `p=none`.
- Roles (the coming `stacks/github-oidc`): OpenTofu uses
  `gha-oss-monorepo-site-{plan,apply}` / `-dns-` in `shared-infra`; the one
  role this work creates is `site-publish`, under the account's
  `workload-boundary` (`permissions_boundary_arn`). GitHub's OIDC provider
  there is that stack's; `create_github_oidc_provider` is off by default.
- State keys: the brief said `stacks/<stack>/terraform.tfstate`, which these
  stacks' `backend.hcl.example` use; PR 18749 says `<stack>/terraform.tfstate`.
  Whichever the apply workflow settles on, only `backend.hcl` changes.
- `shared-infra`'s budget in that PR's spend stack is $20 a month; the site's
  estimate is about $10-12.
