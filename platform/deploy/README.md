# platform/deploy — one-click self-deploy

The business model (`prompts/goals.md`, Mission): every app is an MIT,
open-source business that a stranger can run in their own account. We host
nothing and hold no one's credentials.

`node platform/deploy/build.mjs --out=dist/deploy` builds a static page where a
visitor:

1. picks one of the ~1,230 browser apps (the list comes from
   `discoverSurfaces()` in `platform/pages/build.mjs`; there is no second list),
2. picks **GitHub Pages** (free, needs only a GitHub token), **AWS**
   (S3 + CloudFront through OpenTofu), **Google Cloud Storage** (a public bucket through OpenTofu, service-account key sealed like the AWS keys) or **Android** (a Capacitor shell built in
   the visitor's own GitHub Actions into a sideloadable APK, plus a signed Play
   bundle if they add their own keystore secrets; iOS is not covered),
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
| `templates/android/` | `deploy.yml` (Capacitor 6.2.0 pinned, JDK 17, debug APK; signed `.aab` only with the visitor's four `ANDROID_*` secrets); `compose.mjs` writes `capacitor.config.json` and `package.json` |
| `templates/gcp/` | `deploy.yml`, `destroy.yml`, `tofu/` (OpenTofu 1.8.5, providers pinned; `GOOGLE_CREDENTIALS` secret, `GCP_PROJECT`/`GCP_LOCATION` variables) |
| `templates/aws/` | `deploy.yml`, `destroy.yml`, `tofu/` (OpenTofu 1.8.5, providers pinned) |

The donate link (Buy Me a Coffee, plain link) and an operator notice are added
to every deployed `index.html`; the generated README tells the visitor they are
the operator.

## Server apps (Render, or Docker Compose)

Sixteen ventures are processes, not static pages (every `ventures/*/` that has a
`Dockerfile` plus a `render.yaml`: `cancel-flow`, `cron-heartbeat`, `dunning-engine`,
`einvoice-preflight`, `feedback-board`, `form-inbox`, `license-keeper`, `mrr-pulse`,
`referral-keeper`, `rev-rec`, `rfp-compliance-matrix`, `status-keeper`,
`testimonial-keeper`, `trial-converter`, `waitlist-keeper`, `webhook-relay`; the list is
derived at build time, `servers/<slug>.json` after a build is authoritative).
For these the page also offers **Render**: it creates a public repository in the
visitor's GitHub account holding `ventures/<slug>/` and the venture's
`render.yaml` at the root, then links `render.com/deploy?repo=<that repo>`.
Render shows the blueprint, asks for the `sync: false` secrets (Stripe keys and
so on) and bills the visitor. Secrets are typed into Render, never into this
page, and the repository holds none. `build.mjs` writes `servers/<slug>.json`
for each; tests check every `COPY` in the Dockerfile is present.

**Docker Compose** (download only, no token or account): the same server apps can be
downloaded as a folder with the app, a `compose.yaml`, a `.env.example` and a
`setup.sh` that writes `.env` with random values for the secrets the blueprint
generates (unset optional variables stay commented out so each app's own default
applies). Run it on any VPS, Raspberry Pi or home server. Unlike Render's blueprint
it keeps state in a Docker volume, so stateful apps lose nothing on restart. The
env list is read from the venture's `render.yaml` (`blueprintEnv`), so there is no
second list to drift.

**Fly.io** (download only, no token here): the server apps can also be downloaded as a
folder with the app, a `fly.toml` derived from the venture's `render.yaml` (port from
`EXPOSE`, health check, volume mount, literal env) and a README with the exact `flyctl`
commands. Generated secrets use `openssl rand`, other secrets go through `fly secrets set`;
nothing secret is in the folder and no `app` name is hard-coded (Fly names are global).
Not yet validated against a live Fly account.

## Tests

`node --test platform/deploy/*.test.mjs`. CI (`deploy-iac-check.yml`) also runs
`tofu fmt -check` and `tofu validate` on the module.

## Known gaps (next runs)

- No `.terraform.lock.hcl` yet: it needs a `tofu init` run with network access.
  Providers are pinned to exact versions in `versions.tf` meanwhile.
- More providers (Azure, DigitalOcean Spaces). (DigitalOcean App Platform was considered for servers and skipped: no persistent disk, so most of the server apps would lose state.)
- The hub footer and every tool page footer link the page ("Deploy your own
  copy" / "Run your own copy", `deploy/?app=<slug>` preselects the app).
- The GCS path is validated with `tofu validate` only, not against a live project; it serves from `storage.googleapis.com` (no custom domain, no CDN).
- The AWS path is validated structurally and against a mocked GitHub API in a
  real browser, not yet against a live AWS account.

## History

An earlier, GitHub-Pages-only version (`core.mjs`, which read each app's files
from the source repository) landed from a parallel session. It is replaced by
this one: files are embedded at build time, so it works while the source
repository is private, and AWS is supported.
