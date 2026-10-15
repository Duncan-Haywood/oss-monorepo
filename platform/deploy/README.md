# platform/deploy — one-click self-deploy

The business model (`prompts/goals.md`, Mission): every app is an MIT,
open-source business that a stranger can run in their own account. We host
nothing and hold no one's credentials.

`node platform/deploy/build.mjs --out=dist/deploy` builds a static page where a
visitor:

1. picks one of the ~1,230 browser apps (the list comes from
   `discoverSurfaces()` in `platform/pages/build.mjs`; there is no second list),
2. picks **GitHub Pages** (free, needs only a GitHub token) or **AWS**
   (S3 + CloudFront through OpenTofu),
3. pastes their own credentials and ticks the operator acknowledgement,
4. clicks **Deploy** (their browser calls `api.github.com` directly:
   create repo, store secrets, push files, dispatch the workflow) or
   **Download** (the same repository as a .zip, no credentials at all).

## How credentials stay out of our hands

The page is static and loads no third-party script. AWS keys are sealed in the
browser (`sealedbox.mjs`, a libsodium `crypto_box_seal` built from vendored
tweetnacl + blakejs, tested against real libsodium output) with the new
repository's public key before they are sent as Actions secrets. The OpenTofu
state passphrase is generated in the tab and stored the same way. OpenTofu
state is encrypted (native state encryption, `enforced = true`) and committed
to `state/` in the visitor's own repository.

## Layout

| Path | What |
|------|------|
| `index.html`, `app.mjs` | the deploy page |
| `compose.mjs` | pure: builds the visitor's repository (shared by page and tests) |
| `catalog.mjs` | reads each app's static files (limits: 60 files, 3 MB, no root-absolute asset paths) |
| `sealedbox.mjs`, `vendor/` | libsodium-compatible sealed box |
| `zip.mjs` | store-only zip writer for the download path |
| `templates/github-pages/` | `deploy.yml` (Pages via Actions) |
| `templates/aws/` | `deploy.yml`, `destroy.yml`, `tofu/` (OpenTofu 1.8.5, providers pinned) |

The donate link (Buy Me a Coffee, plain link) and an operator notice are added
to every deployed `index.html`; the generated README tells the visitor they are
the operator.

## Tests

`node --test platform/deploy/*.test.mjs`. CI (`deploy-iac-check.yml`) also runs
`tofu fmt -check` and `tofu validate` on the module.

## Known gaps (next runs)

- No `.terraform.lock.hcl` yet: it needs a `tofu init` run with network access.
  Providers are pinned to exact versions in `versions.tf` meanwhile.
- More providers (GCS, Azure, DigitalOcean Spaces) and VM-based apps
  (cloud-init on Hetzner/DigitalOcean) for apps that need a process.
- Link the page from the hub and from each tool page; `?app=<slug>` already
  preselects an app.
- The AWS path is validated structurally and against a mocked GitHub API in a
  real browser, not yet against a live AWS account.

## History

An earlier, GitHub-Pages-only version (`core.mjs`, which read each app's files
from the source repository) landed from a parallel session. It is replaced by
this one: files are embedded at build time, so it works while the source
repository is private, and AWS is supported.
