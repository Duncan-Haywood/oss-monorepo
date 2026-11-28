---
kind: note
subjects: [security]
---
# Full-repository scan, part 3: osv-scanner, trivy-config, zizmor (and checkov), 2026-11-28

For the next session that takes `scan-repo-baseline` (`portfolio/work/tasks.yaml`). Part 1
(gitleaks, PR #20002) and part 2 (semgrep, PRs #19952 and #19962) are done; this is the
reading the task's step 3 asked a runner for, taken here instead, and the fixes it led to.

## How it was run

No dispatch needed: the pinned scanners install in a cloud session.

```
python3 -I platform/security/scan.py install --tools-dir /tmp/t --tools osv-scanner,trivy-config,zizmor
python3 -I platform/security/scan.py repo --root . --tools-dir /tmp/t --tools osv-scanner,trivy-config,zizmor --out /tmp/s
# checkov's lock needs Python >= 3.12 (numpy 2.5.4); the container's python3 is 3.11, but python3.12 is installed:
python3.12 -I platform/security/scan.py install --tools-dir /tmp/t2 --tools checkov
python3.12 -I platform/security/scan.py repo --root <fresh clone> --tools-dir /tmp/t2 --tools checkov --out /tmp/s2
```

The part 1 report said "checkov did not install on this container's Python": the cause is the
3.11 default, not the container. Run the scan before any `npm ci`, or in a fresh clone, so
`node_modules/` is not read.

## What it found, and what this PR did

First reading at `9ebe82c2c`: **276 blocking** (osv 257, zizmor 14, trivy-config 1; at or above
each tool's `block_at`). After this PR's fixes: **142**, of which the npm lockfiles of the
ventures account for none (the rest are below).

Fixed (PR #20020):

| where | was | now |
|---|---|---|
| `ventures/ai-first-markets` (deployed) | next 16.3.4 (3 critical, 2 high), undici 7.29, proxy-addr 2.0.7 (critical), body-parser, sharp, vite, zod, source-map-js, brace-expansion | `npm audit fix --package-lock-only` within the existing ranges: next 16.4.6, proxy-addr 2.0.8, body-parser 2.4.0, sharp 0.35.5, vite 8.4.0, zod 4.6.7, brace-expansion 1.1.22. Typecheck, lint, 60 tests and `next build` pass locally |
| `local-site-studio`, `print-atelier`, `vendor-watch`, `photo-editing/docs-site` | next pinned exactly at 16.3.3 (GHSA-h694-7cp9-m8p3 and others, up to 16.4.4) | next and eslint-config-next pinned at 16.4.6, plus the audit fixes |
| `quick-pick-survey`, `real-estate-agent-photo-app/{docs-site,pipeline,research}`, `research/marriage-divorce-evidence/report-app` | next 16.3.3, sharp, undici 8.9, vite, nanoid, zod | audit fixes within range; `npm audit` reports 0 |
| `ventures/retail-pilot-intel` (pnpm) | vite 6.4.3, js-yaml 4.3.1, brace-expansion 1.1.18 / 5.0.9 | vite ^6.4.6; the existing `pnpm.overrides` floors raised to brace-expansion ^1.1.22 / ^5.0.13 and js-yaml ^4.3.2 |
| `platform/uitest/action.yml`, two `portfolio/pipeline/probes/*/action.yml` | `actions/cache@v4`, `upload-artifact@v4`, `setup-python@v5` (zizmor unpinned-uses) | pinned to the SHAs the workflows already use (`git ls-remote` checked the tags) |

`local-site-studio` keeps two moderate findings (postcss-selector-parser under
@tailwindcss/typography), below `block_at`.

## Left, with a recommendation each

These need a decision, not a lockfile run. Entries in `platform/security/baseline.yaml` go in a
PR of their own (the adversarial gate reads it from main).

1. **Research and hardware `requirements.txt` (osv, ~120 of the 142).** pillow 9.5.0 (many
   highs) reached transitively in `research/homebot`, `research/marriage-divorce-evidence` and its
   `reproducibility/`; pyarrow 20.0.0 pinned directly in the last two; certifi 2026.7.22 in the
   three `ventures/open-*-robots/cad/` files. None is deployed: they are local analysis and CAD
   environments, and research is paused (owner, 2026-11-25). Recommendation: certifi and pyarrow
   can simply be bumped (certifi is a CA bundle; pyarrow is read-only parquet I/O there), with a
   line in each README that results were produced on the old pin; pillow is transitive (matplotlib
   / opencv), so add `pillow>=<fixed>` as a constraint. If a run would rather not touch pinned
   reproducibility environments, accept them in baseline.yaml with that reason, path-specific.
2. **zizmor `dangerous-triggers` (4):** `priv-risk-review.yml` and `priv-security-gate.yml` use
   `pull_request_target` on purpose (they must run main's copy of the gate, never the PR's; their
   headers say so), `priv-branch-cleanup.yml` checks out the base branch and takes only the PR
   number, `priv-agent-pr-auto-merge.yml` uses `workflow_run`. Read each job's checkout: if none
   checks out the PR head, accept them with that reason. All four are CODEOWNERS files.
3. **zizmor `github-app` (5):** `priv-agent-cross-review.yml` (4 steps) mints its app token with
   no `repositories:` and no `permission-*` inputs, so each token carries every permission the app
   has on every repository it is installed on; `priv-distribute-homebrew.yml` scopes the repository
   but not the permissions. This one is a real hardening: add `permission-pull-requests: write`,
   `permission-contents: read` (and whatever the step's API calls need) and
   `repositories: ${{ github.event.repository.name }}`. Control-plane file, so expect the
   adversarial gate's LLM review; check the calls each step makes before narrowing.
4. **trivy-config AZU-0012 (1):** `platform/deploy/templates/azure/tofu/main.tf` leaves the storage
   account's network default at allow. It serves a public static website
   (`azurerm_storage_account_static_website`), so deny would break the template's purpose; accept
   it with that reason.
5. **checkov: nothing blocking.** checkov 3.4.3 over a fresh clone reported 63 findings, all
   below its `block_at` (for example CKV_AWS_86, CloudFront access logging, in
   `platform/deploy/templates/aws/tofu/main.tf`), so it needs no baseline entry.

Once 1 to 4 are fixed or accepted, `priv-security-scan-repo.yml` can get its weekly
`schedule: cron "29 7 * * 1"` back (the task's last step).

## Follow-up, 2026-11-28 (later run)

- **Item 3 done:** every `create-github-app-token` step now names its repository and its
  permissions. The four cross-review tokens get `pull-requests: write`, `checks: read` and
  `contents: read`, which is every call `platform/ci/agent_review/review.py --reviewer` makes (PR,
  files, reviews, check runs, POST review, `gh repo view`); the README's App setup now lists
  Checks → Read, which it had left out. The Homebrew tap token gets `contents: write` (its only
  call is the push). A rerun of zizmor over the branch reports no `github-app` finding. The
  reviewer jobs were all skipped in the last runs (no App secrets set), so nothing live changed.
- **Items 2 and 4** were re-read for a baseline entry: all four `dangerous-triggers` workflows check
  out the base branch only (`persist-credentials: false`, `ref:` the base SHA, the default branch, or
  the trigger's default), and the security gate reads the PR only as files through
  `materialize.py`. Accepted in `platform/security/baseline.yaml` (path and fingerprint each) in
  the PR after #20073; with them `scan.py repo --tools zizmor,trivy-config` reports **0 blocking**,
  so only item 1 (osv) stands between the task and its weekly schedule.
- **Item 1 not rerun:** osv-scanner could not reach its API from this session (the proxy refused
  the host), so the `requirements.txt` fixed versions were not read again. The next session with
  osv access takes it.

## Part 4, item 1 done and the schedule back (2026-11-28, a third run)

api.osv.dev and api.deps.dev were still refused by this session's proxy, but two other routes
answered, and they are the way to take an osv reading from a cloud session:

```
# osv's own database, offline (the bucket osv-vulnerabilities.storage.googleapis.com answers):
OSV_SCANNER_LOCAL_DB_CACHE_DIRECTORY=/tmp/db osv-scanner scan source -r --no-resolve \
  --offline-vulnerabilities --download-offline-databases --format json .
# transitive Python dependencies, which --no-resolve skips: pip's own resolution, then
# each resolved version's advisories from https://pypi.org/pypi/<name>/<version>/json
# ("vulnerabilities", the OSV records)
pip install --dry-run --ignore-installed --python-version 3.11 --only-binary :all: --report r.json -r requirements.txt
```

What that showed for the 20 `requirements.txt` files of item 1 (`research/homebot`,
`research/marriage-divorce-evidence` and its 16 `reproducibility/` folders, the two
`ventures/open-*-robots/cad/`):

- **pyarrow 20.0.0** (PYSEC-2026-113 / GHSA-rgxp-2hwp-jwgg, CVSS 7.0, fixed in 23.0.1) pinned
  directly in `marriage-divorce-evidence/requirements.txt` and `reproducibility/requirements.txt`:
  the only real finding. Pinned to 23.0.1 (supersedes Dependabot's PR #8509); a parquet round trip
  with pandas 2.3.3 on Python 3.11 passes, no parquet file is committed, and the reproducibility
  README says the published results were made on 20.0.0.
- **Pillow 9.5.0 and certifi 2026.7.22 were never what pip installs.** pip resolves Pillow 13.0.0
  and certifi 2026.11.20 (no advisories) for every file; the old versions were deps.dev's
  resolution, which osv-scanner uses for unpinned transitive dependencies. Floors
  (`pillow>=13.0.0`, `certifi>=2026.10.18`) now keep any resolver on fixed versions.
- Every other resolved package (92 for homebot without torch's CPU index, which the proxy refuses,
  58 for each CAD file, 4 to 18 for the rest) has no advisory.

Repo-wide, the offline osv reading with `scan.py`'s parser, `block_at` and `baseline.yaml` is
**0 blocking** (10 medium reported: esbuild 0.18.20 in four pnpm lockfiles, a devsec-toolkit test
fixture, golang.org/x/sys in one go.mod, postcss-selector-parser, minimatch, pytest 8.0). That
reading skips transitive resolution for unlocked `requirements.txt` files elsewhere in the tree,
so the first scheduled run (which can reach deps.dev) may queue a few more; that is the queue
working, not noise. With gitleaks, semgrep, zizmor, trivy-config and checkov already at 0,
`priv-security-scan-repo.yml` has its `schedule: cron "29 7 * * 1"` back and `scan-repo-baseline`
is done.
