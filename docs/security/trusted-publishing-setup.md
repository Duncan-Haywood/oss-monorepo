# Trusted publishing: the owner's setup

Goal (owner, 2026-11-24): manage identity and keys as code, keep as few
long-lived secrets as possible, and rotate nothing by hand. Registries now let
a GitHub Actions job prove who it is with a short-lived OIDC token, so the
PyPI and npm publish jobs need no stored token at all.

The full list of secrets, and what each one still needs, is
[`secrets-inventory.yaml`](secrets-inventory.yaml). CI fails if a workflow
reads a secret that file does not list
(`python3 platform/ci/secrets_inventory.py`).

## What changes

| Channel | Before | After |
|---|---|---|
| PyPI (`priv-distribute-pypi.yml`, `priv-distribute-pypi-packages.yml`) | `PYPI_TOKEN`, an account-wide API token, uploaded with twine | The scripts build into `dist/` (`PYPI_DIST_DIR`); `pypa/gh-action-pypi-publish` uploads with an OIDC token valid for minutes, for the listed projects only, and attaches attestations |
| npm (`priv-distribute-npm.yml`, `priv-distribute-mcp.yml`) | `NPM_TOKEN`, a granular token with an expiry | `npm publish --provenance` with npm 11.21.2 and `id-token: write`; npm exchanges the job's OIDC token for a one-use publish credential |
| Homebrew tap (`priv-distribute-homebrew.yml`) | `HOMEBREW_TAP_TOKEN`, a fine-grained PAT on your account | A one-hour installation token from a GitHub App that is installed on the tap repository only |

All five jobs keep running in the `publish` environment, now on GitHub-hosted
`ubuntu-latest` (npm's trusted publishing does not accept self-hosted runners,
and the PyPI action is a Linux container action). The script changes are
already on `main`. The workflow changes wait for your approval because
`.github/` is in `CODEOWNERS`. Until you add the publishers below, the publish
runs fail at the upload step with a "no trusted publisher" error and publish
nothing. Every channel is also still gated on its `DISTRIBUTE_*` variable.

## 1. The `publish` environment: `main` only

The trusted publishers below name the environment, so a job outside it cannot
publish. Make sure only `main` can deploy to it (step 4 of
[agent-hardening.md](agent-hardening.md)). As code, with an admin token:

```bash
gh api -X PUT repos/Duncan-Haywood/oss-monorepo/environments/publish -F 'deployment_branch_policy[protected_branches]=false' -F 'deployment_branch_policy[custom_branch_policies]=true'
```

```bash
gh api -X POST repos/Duncan-Haywood/oss-monorepo/environments/publish/deployment-branch-policies -f name=main -f type=branch
```

## 2. PyPI: add pending publishers

None of the three projects exists on PyPI yet (checked 2026-11-24), so use
**pypi.org → Your account → Publishing → "Add a new pending publisher" →
GitHub**. A pending publisher turns into a normal one on the first upload. Do
it before setting `DISTRIBUTE_PYPI=true`, because the name is not reserved
until the first upload.

| PyPI Project Name | Owner | Repository name | Workflow name | Environment name |
|---|---|---|---|---|
| `coverage-drop-check` | `Duncan-Haywood` | `oss-monorepo` | `priv-distribute-pypi.yml` | `publish` |
| `flaky-test-finder` | `Duncan-Haywood` | `oss-monorepo` | `priv-distribute-pypi.yml` | `publish` |
| `required-checks-drift-check` | `Duncan-Haywood` | `oss-monorepo` | `priv-distribute-pypi.yml` | `publish` |

These are the tools on the `pypi` channel of
`portfolio/distribution/allowlist.json`. The `pypi-packages` channel
(`priv-distribute-pypi-packages.yml`) has no tools yet. When one is added, add a row
for it with workflow `priv-distribute-pypi-packages.yml`. For a project that already
exists, use the project's own **Settings → Publishing** page; the fields are
the same.

## 3. npm: first publish, then add trusted publishers

npm attaches a trusted publisher to a package that already exists. On
2026-11-24 none of these exists, so each one needs a first publish from your
machine. After that, CI publishes every later version without a token. (If
npm's form has since started accepting a name that has not been published,
skip the first publish.) On the OIDC path the scripts skip a package that is
not on npm yet and log it; they do not fail.

`NPM_SCOPE` decides the names. Two unscoped names, `llm-spend-guard` and
`llms-txt-generator`, belong to other projects, so without a scope those two
are never published. Below, `<scope>` stands for the value of `NPM_SCOPE`
(for example `@marisstella`). With no scope, drop the `<scope>/` part.

First publish, once per package, from a clone of `main` while logged in to npm
with 2FA:

```bash
NPM_SCOPE=<scope> node platform/distribution/npm.mjs --pack agent-permission-config-check /tmp/pkg && (cd /tmp/pkg && npm publish --access public) && rm -rf /tmp/pkg
```

Repeat for each slug in the table, then publish the MCP bundle the same way:

```bash
node platform/distribution/mcp.mjs --pack /tmp/mcp && (cd /tmp/mcp && npm publish --access public) && rm -rf /tmp/mcp
```

Then, for each package: **npmjs.com → the package → Settings → Trusted
Publisher → GitHub Actions**:

| Package | Organization or user | Repository | Workflow filename | Environment name |
|---|---|---|---|---|
| `<scope>/agent-instructions-drift-check` | `Duncan-Haywood` | `oss-monorepo` | `priv-distribute-npm.yml` | `publish` |
| `<scope>/agent-permission-config-check` | `Duncan-Haywood` | `oss-monorepo` | `priv-distribute-npm.yml` | `publish` |
| `<scope>/env-example-drift-check` | `Duncan-Haywood` | `oss-monorepo` | `priv-distribute-npm.yml` | `publish` |
| `<scope>/llm-spend-guard` (scope required) | `Duncan-Haywood` | `oss-monorepo` | `priv-distribute-npm.yml` | `publish` |
| `<scope>/llms-txt-generator` (scope required) | `Duncan-Haywood` | `oss-monorepo` | `priv-distribute-npm.yml` | `publish` |
| `<scope>/npm-lifecycle-script-check` | `Duncan-Haywood` | `oss-monorepo` | `priv-distribute-npm.yml` | `publish` |
| `<scope>/slopsquatting-check` | `Duncan-Haywood` | `oss-monorepo` | `priv-distribute-npm.yml` | `publish` |
| `monorepo-projects-mcp` | `Duncan-Haywood` | `oss-monorepo` | `priv-distribute-mcp.yml` | `publish` |

The MCP bundle's name is fixed (`DEFAULT_NAME` in
`platform/distribution/mcp.mjs`, not scoped). npm allows one trusted publisher
per package, which is why the bundle names its own workflow.

On the same Settings page, set **Publishing access → "Require two-factor
authentication and disallow tokens"**. Trusted publishing still works, and a
leaked token no longer can.

## 4. Homebrew tap: a GitHub App instead of a PAT

1. **github.com → Settings → Developer settings → GitHub Apps → New GitHub
   App.** Any name (for example `marisstella-homebrew-tap`). Untick
   *Webhook → Active*. Repository permissions: **Contents: Read and write**
   (Metadata: read is added automatically); nothing else. *Where can this
   GitHub App be installed?* **Only on this account.**
2. On the app's page: note the **App ID**, then **Generate a private key**
   (a `.pem` file downloads).
3. **Install App → your account → Only select repositories →** the tap
   repository (the one in `HOMEBREW_TAP_REPO`). Nothing else.
4. In this repository: **Settings → Environments → publish**:
   - secret `HOMEBREW_TAP_APP_PRIVATE_KEY`: the whole `.pem` file;
   - variable `HOMEBREW_TAP_APP_ID`: the App ID (not a secret; a repository
     variable works too).
5. Delete the downloaded `.pem` from your machine.

The workflow mints a token for the tap repository only, valid for an hour, on
each run (`actions/create-github-app-token`). The private key does not expire,
but it acts only through that one installation, not as your account. If it
ever leaks, generate a new key on the app's page and delete the old one.

The job skips while `HOMEBREW_TAP_APP_ID` is unset, as it already does while
`DISTRIBUTE_HOMEBREW` or `HOMEBREW_TAP_REPO` is unset.

A setup with no stored secret at all is possible: move the formula step
into a scheduled workflow inside the tap repository. That workflow would check
out this public repository without a token, run
`node platform/distribution/homebrew.mjs --write .`, and push with the tap's
own `GITHUB_TOKEN`. It is not done here because the tap repository is outside
this one. It is the better end state if you want zero long-lived keys for the
tap.

## 5. Then delete (after the workflow PR has merged and one run is green)

| Where | Delete | Also revoke at |
|---|---|---|
| Settings → Environments → publish (and repository secrets, if a copy is still there) | `PYPI_TOKEN` | pypi.org → Account settings → API tokens |
| same | `NPM_TOKEN` | npmjs.com → Access Tokens |
| same | `HOMEBREW_TAP_TOKEN` | github.com → Settings → Developer settings → Fine-grained tokens |

The workflow PR moves those three names to `retired` in
`secrets-inventory.yaml`, so CI fails if any workflow starts reading them
again.

## Other secrets: what can and cannot go the same way

From the inventory, as of 2026-11-24:

- **Cloudflare** (`CLOUDFLARE_API_TOKEN` and four other spellings): Cloudflare
  has no OIDC federation for GitHub Actions, so this stays a long-lived token.
  To limit it, give it an expiry and keep it to the permissions listed in the
  inventory. Settle on one spelling. In this repository,
  `CLOUDFLAREAPITOKEN`, `CLOUDFLARERESTRICTEDAPIKEY` and `CLOUDFLAREACCOUNTID`
  are fallbacks. In `private-monorepo`, there are six token spellings. Delete
  the extras, then a later workflow PR drops the fallbacks.
- **Google Search Console** (`GSC_SERVICE_ACCOUNT_JSON`, not set yet): use
  Workload Identity Federation (`google-github-actions/auth` with an OIDC
  provider) when you set it up, and no JSON key is ever stored.
- **GitHub reads** (`TRAFFIC_TOKEN`, a fine-grained PAT): a GitHub App with
  Administration read would replace it with one-hour tokens, the same pattern
  as the tap.
- **Social and newsletter APIs, Anthropic, OpenCode, Vercel**: none offers
  OIDC to GitHub Actions. They stay manual, stored only in the environment
  that uses them, with spend limits where money is involved.
