---
kind: note
date: 2026-11-24
subjects: [ci]
---
# Cloudflare: minted one-hour tokens replace the CI secret aliases (2026-11-24)

For the next session. Owner, 2026-11-24: key management was "click ops" and
"very poor"; goal: no long-lived broad Cloudflare credential in CI, no manual
rotation.

- **Landed:** `platform/ci/cloudflare_mint/` (action, library, 15 mocked
  tests, profiles, README with the alias map and the owner's one-time steps).
- **Waiting for the owner** (control plane): the oss-monorepo workflow PR
  that switches the seven Cloudflare jobs to the action, adds its tests to
  `portfolio-validate.yml` and puts the directory in CODEOWNERS; and the
  private-monorepo PR for `grants-deploy`, `grants-backup`,
  `grants-set-admins`. Links are in the README's history once merged.
- **Global API Key:** the code path exists in private-monorepo
  `grants-deploy.yml` (37-hex check, `X-Auth-Key`, wrangler
  `CLOUDFLARE_API_KEY` + `CLOUDFLARE_EMAIL`). Run 45339823076 (2026-11-24)
  authenticated as a token (`CF_AUTH_MODE: token`) through the secret named
  `CLOUDFLARE_API_KEY`. Do not claim a Global API Key is in use; the owner
  step "roll the Global API Key" covers it either way.
- **Unverified until the first live run:** the minter's permission name and
  the permission-group names in `profiles.json` (developers.cloudflare.com was
  blocked by the session's network policy; the API shape came from npm
  `cloudflare` 7.3.0). `node platform/ci/cloudflare_mint/mint.mjs check` with
  the minter resolves every name and creates nothing. A wrong name fails the
  job loudly with close matches; fix it in `profiles.json`.
- **Runner note:** the action runs on `node24`. A self-hosted runner behind
  `vars.CI_RUNNER` must be recent enough to offer it.
