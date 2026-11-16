# platform/deploy — one-click self-deploy

The business model (`prompts/goals.md`, Mission): every app is an MIT,
open-source business that a stranger can run in their own account. We host
nothing and hold no one's credentials.

`node platform/deploy/build.mjs --out=dist/deploy` builds a static page where a
visitor:

1. picks one of the browser apps (1,354 on 2026-11-16; the list comes from
   `discoverSurfaces()` in `platform/pages/build.mjs`, there is no second list;
   the 18 over the 60-file or 3 MB limit, mostly flagships such as
   `ai-bookkeeper` and `wall-framing-takeoff`, are named on the page as not
   deployable, from `skipped.json`, rather than left out silently),
2. picks **GitHub Pages** (free, needs only a GitHub token), **AWS**
   (S3 + CloudFront through OpenTofu), **Google Cloud Storage** (a public bucket through OpenTofu, service-account key sealed like the AWS keys), **Microsoft Azure** (a Storage static website through OpenTofu, service-principal values sealed the same way) **Cloudflare Pages** (free tier, wrangler in the visitor's own Actions, API token sealed like the others) or **Android** (a Capacitor shell built in
   the visitor's own GitHub Actions into a sideloadable APK, plus a signed Play
   bundle if they add their own keystore secrets; iOS is not covered),
3. pastes their own credentials and ticks the operator acknowledgement,
4. clicks **Deploy** (their browser calls `api.github.com` directly:
   create repo, store secrets, publish every file as one Git commit, dispatch
   the workflow; `publish.mjs`) or
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
| `publish.mjs` | the page's GitHub calls: `gh()` (a 404 is null only where the caller allows it), sealed secrets, one-commit upload through the Git data API, the failure message that says what was already created |
| `catalog.mjs` | reads each app's static files (limits: 60 files, 3 MB, no root-absolute asset paths) |
| `sealedbox.mjs`, `vendor/` | libsodium-compatible sealed box |
| `zip.mjs` | store-only zip writer for the download path |
| `templates/github-pages/` | `deploy.yml` (Pages via Actions) |
| `templates/android/` | `deploy.yml` (Capacitor 6.2.0 pinned, JDK 17, debug APK; signed `.aab` only with the visitor's four `ANDROID_*` secrets); `compose.mjs` writes `capacitor.config.json` and `package.json` |
| `templates/gcp/` | `deploy.yml`, `destroy.yml`, `tofu/` (OpenTofu 1.8.5, providers pinned; `GOOGLE_CREDENTIALS` secret, `GCP_PROJECT`/`GCP_LOCATION` variables) |
| `templates/azure/` | `deploy.yml`, `destroy.yml`, `tofu/` (OpenTofu 1.8.5, azurerm 4.14.0; `ARM_*` secrets, `AZURE_LOCATION` variable) |
| `templates/cloudflare/` | `deploy.yml` (wrangler 3.99.0 `pages deploy`; `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets) |
| `templates/aws/` | `deploy.yml`, `destroy.yml`, `tofu/` (OpenTofu 1.8.5, providers pinned) |
| `scaffold_static_deploy.py` | a separate helper, not part of the page: adds Dockerfile, compose, fly.toml and render.yaml self-host files to a static venture (`python3 platform/deploy/scaffold_static_deploy.py <slug>`); untested |

## Upload: one commit, not one per file

Until 2026-11-16 the page sent each file with its own contents-API `PUT`: one
commit per file, each a push that started the visitor's deploy workflow, and a
half-filled repository if a call failed midway (quality audit
[`2026-11-07-deploy.json`](../../portfolio/quality/audits/2026-11-07-deploy.json)).
`pushFiles()` now reads the branch head of the `auto_init` repository, sends
text files inline in one tree request and binary files as blobs (GitHub allows
about 80 content-creating requests a minute), then makes one commit and moves
the branch once. Nothing appears in the repository until that last call, so a
failure leaves the auto-init commit and nothing else. A 10-file GitHub Pages app
is 11 API calls in all, against 25 before (a GET and a PUT per file).

The donate link (Buy Me a Coffee, plain link) and an operator notice are added
to every deployed `index.html`; the generated README tells the visitor they are
the operator.

## Server apps (Render, or Docker Compose)

Some ventures are processes, not static pages: every `ventures/*/` with a
`Dockerfile` plus a `render.yaml` that is not `runtime: static` (33 on 2026-11-16,
from `cancel-flow` to `webhook-relay`; the list is derived at build time, and
`servers/<slug>.json` after a build is authoritative).
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

`node --test platform/deploy/*.test.mjs` (42 tests). `publish.test.mjs` drives
the Deploy button's GitHub calls against an in-memory GitHub: one tree, one
commit, one ref update; binary bytes intact; a 403 is an error, not "missing";
a failed ref update leaves the branch where it was. CI (`deploy-iac-check.yml`) also runs
`tofu fmt -check` and `tofu validate` on the module.

## Known gaps (next runs)

- No `.terraform.lock.hcl` yet: it needs a `tofu init` run with network access.
  Providers are pinned to exact versions in `versions.tf` meanwhile.
- More providers (DigitalOcean Spaces). The Azure path is validated with `tofu validate` in CI only, not against a live subscription. (DigitalOcean App Platform was considered for servers and skipped: no persistent disk, so most of the server apps would lose state.)
- The hub footer and every tool page footer link the page ("Deploy your own
  copy" / "Run your own copy", `deploy/?app=<slug>` preselects the app).
- The GCS path is validated with `tofu validate` only, not against a live project; it serves from `storage.googleapis.com` (no custom domain, no CDN).
- The AWS path is validated structurally, not against a live AWS account. The
  Deploy flow's GitHub calls are tested against a mocked GitHub in node
  (`publish.test.mjs`); a session on 2026-11-16 also ran the GitHub Pages flow
  in Chromium against a mocked API (11 calls, one commit), but that browser run
  is not a committed test.
- The AWS workflow uses long-lived access keys and `tofu apply -auto-approve` on
  every push; OIDC role assumption and a plan step are the release-engineering
  norm (audit 2026-11-07, open).
- The 60-file limit was sized for per-file commits. With the one-commit upload
  the binding cost is binary blobs against GitHub's rate limit, so the limit
  could count binary files only; each of the 18 apps it would admit needs
  checking as a standalone copy first.

## History

An earlier, GitHub-Pages-only version (`core.mjs`, which read each app's files
from the source repository) landed from a parallel session. It is replaced by
this one: files are embedded at build time, so it works while the source
repository is private, and AWS is supported.
