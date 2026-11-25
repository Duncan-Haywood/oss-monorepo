---
kind: analysis
date: 2026-11-24
topics: [security-alerts, ci]
---
# First full-repository security scan (2026-11-24)

The first reading of the scanners that `security-scan` now runs on every PR
(`platform/security/scan.py`, pinned in `platform/security/tools.yaml`),
taken over the whole tree rather than a PR's changed files. It is a
baseline, not a gate: a PR fails only on findings it adds, so nothing below
blocks anyone. Task `sec-scan-pipeline` (`portfolio/work/tasks.yaml`).

## How the numbers were taken

- Tree: `git archive` of commit `241c4092e` (main on 2026-11-24, before
  `platform/aws/` landed), 2.3 GB of tracked files, in a cloud session.
- Tools, installed the way `scan.py install` pins them: Semgrep 1.184.0,
  Checkov 3.4.3 and zizmor 1.32.0 from hash-locked requirement files
  (`platform/security/locks/`); gitleaks v8.30.1, OSV-Scanner v2.7.1 and
  Trivy v0.76.2 built with `go install` from module versions whose go.sum
  hashes are pinned and checked against sum.golang.org. GitHub release
  downloads were blocked by this session's proxy, which is why the Go tools
  are built from source rather than downloaded.
- Settings as in CI: gitleaks with its default rules and `--redact`; zizmor
  `--offline`; Trivy `config --skip-check-update` (the checks embedded in
  the pinned version); Checkov with frameworks terraform, dockerfile,
  kubernetes, cloudformation and helm; OSV-Scanner with its offline
  databases (api.osv.dev was not reachable from here; the CI job queries
  it online). Semgrep with the repository's local rules only
  (`platform/security/semgrep/rules.yaml`); semgrep.dev was not reachable,
  so the registry ruleset (`semgrep-registry` in CI) has no reading yet.
- Counts are findings as `scan.py` normalises them (one per rule, file and
  location). "Outside fixtures" drops `*/fixtures/*` and `*/testdata/*`,
  which `scan.py` never scans in a PR.

## Results

| Tool | Wall time | Findings | Outside fixtures, by severity |
|---|---|---|---|
| gitleaks | 459 s | 94 | 94 critical (every secret-shaped match is critical) |
| zizmor | 1 s | 28 | 7 high, 6 medium, 11 low, 4 info |
| Trivy config | 27 s | 70 | 1 critical, 33 high, 5 medium, 7 low (46 in all) |
| Checkov | 6 s | 316 failed checks | 63, all medium (no check on the curated high list failed) |
| OSV-Scanner | 80 s | 344 (package x advisory) | 25 critical, 114 high, 189 medium, 14 low (342 in all) |
| Semgrep (local rules) | 76 s | 241 | 24 high, 217 medium |

What they are:

- **gitleaks, 94.** 51 are in test files (`*.test.mjs`, `test_*.py`,
  `tests/`), mostly the secret and JWT checkers' own samples. 27 are
  `key:` fields of citation records in seven statistics engines
  (`ventures/instrumental-variables/engine.mjs` and six others), which
  gitleaks' `generic-api-key` rule reads as keys. The other 16 were read one
  by one with the matched value masked: storage keys, citation and dataset
  keys, documented example tokens on the JWT and Terraform-plan checker
  pages, an LLM reply quoted in a research data file, and the IndexNow key in
  `platform/pages/build.mjs`, which the protocol publishes by design. None
  looked like a live credential; none was verified against a provider.
- **zizmor, 7 high.** `github-app` (5) in `priv-agent-cross-review.yml`,
  `priv-agent-pr-auto-merge.yml`, `priv-branch-cleanup.yml` and
  `priv-distribute-homebrew.yml`, and `dangerous-triggers` (2), the
  `pull_request_target`/`workflow_run` triggers those privileged workflows
  use. Three `cache-poisoning` findings are rated high by zizmor with low
  confidence, which `scan.py` reports as medium.
- **Trivy, 46 outside fixtures.** 29 are DS-0002 (a Dockerfile with no
  non-root `USER`) and 4 DS-0026 (no `HEALTHCHECK`), spread over venture
  Dockerfiles; 12 of the 46 are in `platform/deploy/`, including single AWS
  and Azure checks on its templates.
  Trivy rates hardening advice such as customer-managed KMS keys high, so
  its `block_at` is `critical`; Checkov's curated list blocks the exposures
  the baseline forbids.
- **Checkov, 63 outside fixtures.** CKV_DOCKER_3 (no `USER`, 31) and
  CKV_DOCKER_2 (no `HEALTHCHECK`, 6) lead; 26 are in `platform/deploy/`.
  None is a public bucket, wildcard IAM or unencrypted storage.
- **OSV-Scanner.** 16 lockfiles or requirement files carry 97 package
  versions with 64 distinct advisories. The most: the real-estate photo
  app (78 entries over three lockfiles), `ai-first-markets` (65),
  `quick-pick-survey` (53), `local-site-studio` (36). One of the 16 is a
  deliberate fixture (`devsec-toolkit`'s vulnerable sample repo).
  48 `failed resolution` messages came from unpinned `requirements.txt`
  files whose transitive versions OSV-Scanner resolves through
  api.deps.dev, also unreachable here; those files are under-counted.
- **Semgrep, 24 high.** 17 `js-child-process-dynamic` (shell commands
  built with template strings in the `platform/ci/check_*.js` browser
  checkers), 4 `py-shell-injection` (`run_workflow_locally.py`,
  `runner_probe.py` and two research scripts), 2 `js-eval-dynamic` in
  `platform/ci/check_enter_reload.mjs`, and 1 `js-tls-verify-off` in
  `ventures/status-keeper/certs.mjs` (a certificate checker, which has to
  read certificates it does not trust). The 217 medium are `innerHTML`
  assignments (176), `pickle` loads in research scripts (39) and two
  unfiltered `tarfile.extractall` calls. 24,444 files scanned; 36 could
  only be partly parsed. A first run of the same rules, before they were
  tuned, reported 651 findings (473 high): 362 were `new Function` and
  `eval` in tests, which evaluate page scripts on purpose, and 85 were
  `exec` and `pickle` in research experiment scripts. The eval rules now
  skip tests and `research/`, and `pickle` is medium; a PR adding the same
  patterns there would otherwise have been blocked for no gain.

## What this does and does not mean

- No finding here blocks a PR: `security-scan` compares each PR's head with
  its merge base. A PR that touches one of these files and leaves the
  finding as it was passes; one that adds a new one fails.
- The dependency advisories are real work: 25 critical and 114 high entries
  in shipped lockfiles. They belong in the product owners' queues
  (`npm audit fix` / version bumps per product), not in the gate.
- Not measured here: CodeQL (PR #18529 adds it), Semgrep's registry rules and OSV's
  online resolution (both need hosts this session could not reach; CI can).

## Added 2026-11-25: container base images (`trivy-image`)

`trivy-image` (Trivy v0.76.2, the same pinned binary as `trivy-config`)
reads the images that Dockerfiles and Compose files pull and scans each for
high and critical vulnerabilities that have a fix (`--ignore-unfixed`). It
also reports every image reference that is not pinned by `@sha256:` digest.
Full-tree reading, taken on main at `cb1b15e5b` (2026-11-25), in a cloud
session that could reach Docker Hub:

- **74 files** (Dockerfiles and Compose files, fixtures excluded) name **7
  distinct images**, and **none is pinned by digest**: `node:22-alpine` (41
  files), `nginx:1.27-alpine` (28), `node:22-slim` (2), and `nginx:alpine`,
  `node:22-bookworm`, `python:3.12-slim-bookworm` and `caddy:2-alpine` (1
  each). That is 75 `image-not-pinned-by-digest` findings, rated medium:
  reported, not blocking.
- **101 fixable vulnerabilities, 64 distinct CVEs, in 5 of the 7 images.**
  3 are critical and 98 high. `nginx:1.27-alpine` alone carries 70 of them
  (3 critical), mostly in libexpat (13), libcrypto3 and libssl3 (9 each),
  libpng and libxml2 (6 each) and curl/libcurl. Each of the three
  `node:22-*` images carries 10, all in npm's bundled packages. `caddy:2-alpine`
  carries 1. `python:3.12-slim-bookworm` and `nginx:alpine` had none at this
  severity.
- **0 images could not be fetched.** An image that cannot be pulled (a
  locally built name, a registry outage) is reported as
  `image-not-scanned`, never as clean.

In a PR, as with every scanner here, only findings the PR adds count. A PR
that keeps `nginx:1.27-alpine` is not blocked by its 70 old advisories. A PR
that moves an image to one with a new fixable high or critical CVE is
blocked. The scanner is not `required`: it pulls from public registries, so
an outage cannot stop development.

The obvious follow-up: move the 28 `nginx:1.27-alpine` Dockerfiles to a
current nginx release pinned by digest. That one change clears 70 of the 101.

