# Security scan

One command runs every scanner in the dev-workflow security baseline on what a
change touches, and writes all findings to one JSON file. This is the gate
that has to be in place before any production workload lands on AWS (owner,
2026-11-24; [`docs/reports/2026-11-24-cloud-provider-comparison.md`](../../../docs/reports/2026-11-24-cloud-provider-comparison.md),
section 7, "Scanning baseline").

```sh
python3 platform/security/scan/install.py     # once: pinned, checksum-verified scanners
python3 platform/security/scan/scan.py        # this branch vs origin/main
python3 platform/security/scan/test_scan.py   # tests (unittest; Semgrep rules run if installed)
```

| Area | Scanner | Runs on | Blocks at `high` |
|---|---|---|---|
| secrets | gitleaks 8.30.1 | the commits in the change (`--all`: the whole tree) | every finding (rated critical) |
| code | Semgrep 1.187.0, [`rules/semgrep.yml`](rules/semgrep.yml) | changed `.py .js .mjs .cjs .ts .tsx .jsx .sh` | ERROR rules |
| dependencies | OSV-Scanner 2.7.1 | changed lockfiles and `requirements*.txt` | CVSS 7.0 and up |
| IaC | Checkov 3.4.10 | changed `.tf` dirs, Dockerfiles, Compose, Kubernetes, CloudFormation | the checks in [`policy.json`](policy.json) |
| IaC | Trivy 0.76.2 `config` | the same | Trivy's HIGH and CRITICAL |
| containers | Trivy 0.76.2 `image` | base images named by changed Dockerfiles and Compose files | HIGH/CRITICAL with a fix; an image not pinned by digest is a medium finding |
| workflows | zizmor 1.33.1 (`--offline`) | changed `.github/workflows/*` and `action.yml` | zizmor's High |
| AWS stacks | OpenTofu 1.13.10 | changed `platform/aws/<stack>` and `platform/aws/modules/<name>` | `validate` errors and failing `tofu test`; `fmt` drift is low |

CodeQL is not here: it is a GitHub workflow with its own PR gate
(`.github/workflows/codeql.yml` and `platform/ci/codeql_gate.py`, PR 18529).

## How it decides

- **Changed paths.** `git diff --name-only <merge-base>...HEAD`, routed by
  `route()` in `scan.py`. Vendored trees (`node_modules`, `platform/deploy/vendor`)
  are skipped, as CodeQL's config skips them.
- **Fails closed.** A scanner that had targets but crashed, printed something
  other than JSON, or is not installed fails the run. An empty result and an
  unreadable one must look different (the lesson of PR 18529, where the
  security queue stayed green for 581 runs because CodeQL never ran).
  `--allow-missing` relaxes only the not-installed case, for local runs.
- **Severity.** Each finding gets `critical | high | medium | low | info`. The run
  fails on any new finding at or above `--fail-on` (default `high`). Medium and
  below are reported, not blocking.
- **Fingerprints** leave out line numbers (tool, rule, path and the line's
  text or the resource), so an accepted finding stays accepted when code above
  it moves.
- **Output.** `.security-scan/findings.json` (gitignored): per-scanner status,
  version, target count and time, a summary, and every finding with
  `baselined` and `baseline_reason`. A Markdown table goes to stdout and, in
  Actions, to the job summary, with an `::error` annotation per blocking
  finding.

## Accepting a finding

Fix it if you can. If it is a false positive, or a risk you accept, add it to
[`baseline.json`](baseline.json):

```json
{"tool": "osv-scanner", "rule": "GHSA-xxxx-xxxx-xxxx", "path": "ventures/x/requirements.txt",
 "reason": "why this is safe here, and what would change that", "added": "YYYY-MM-DD"}
```

- `reason` is required; `scan.py` refuses a baseline with an empty one (exit 2).
- Match by `fingerprint` (one finding; copy it from the JSON) or by `tool` +
  `rule`, optionally narrowed by a `path` glob. A wildcard tool is refused.
- **Secrets are accepted by fingerprint only**, and only when the value is not
  a credential (a test fixture, a public key). A real secret is revoked and
  rotated, never baselined.
- `exclude_paths` (`{"glob": ..., "reason": ...}`) drops whole trees from
  routing. Use it for generated or vendored code only.
- Never weaken a rule in `rules/semgrep.yml` or `policy.json` to get a PR
  through. Changing a rule is its own PR with the reason.

## Pinning: how the scanners are installed

[`install.py`](install.py) reads [`tools.json`](tools.json).

- **Go scanners** (gitleaks, OSV-Scanner, Trivy, OpenTofu). `go mod download`
  fetches the module zip from the Go module proxy. The go command checks it
  against sum.golang.org's transparency log, and `install.py` refuses to
  build unless its `h1:` hash equals the `sum` pinned here. It then builds
  from that exact source with `-mod=readonly`, so the module's own `go.sum`
  verifies every dependency. `GOSUMDB=off` is refused. Building in the module
  directory honours the module's `replace` lines; OpenTofu needs that, and
  `go install mod@ver` refuses it.
- **Python scanners** (Semgrep, Checkov, zizmor). One virtualenv each, with
  `pip install --require-hashes --no-deps --only-binary=:all:` from
  `requirements/<tool>.txt`.
- A `.pin` file per tool records what was built, so a rerun with unchanged
  pins does nothing. In CI, `actions/cache` keys on `tools.json`, the lock
  files and `install.py`.

Why not the GitHub release binaries: the cloud sessions that maintain this
cannot reach github.com release assets through their proxy (HTTP 403).
A single install path for CI and sessions keeps the two from drifting. The
module proxy and sum.golang.org give the same guarantee as a release checksum:
the bytes are the ones the version was published with.

### Bumping a scanner

1. Go: `curl -s https://sum.golang.org/lookup/<module>@<version>`. Copy the
   first `h1:` line into `sum` and set `version` (and any `-X ...version` in
   `ldflags`).
2. Python: put `<tool>==<version>` in a file and run
   `uv pip compile --generate-hashes --python-version 3.12 --python-platform x86_64-manylinux_2_28 --no-header <file> -o requirements/<tool>.txt`.
3. Run `install.py`, `test_scan.py`, and a `scan.py --all` on the scanners'
   own paths. Review every `baseline.json` entry for that tool.

## Network

- OSV-Scanner calls api.osv.dev by default. With `--osv-offline` (or
  `SCAN_OSV_OFFLINE=1`) it downloads the per-ecosystem databases from
  osv-vulnerabilities.storage.googleapis.com instead. Cloud sessions need
  this mode.
- Trivy `config` uses the checks built into the pinned binary
  (`--skip-check-update`), so results change only with a version bump.
  Trivy `image` downloads its vulnerability database from mirror.gcr.io or
  ghcr.io and pulls images from their registries.
- Semgrep runs only the local rules, with metrics off. Registry packs would
  need semgrep.dev, change without a pin, and send metrics.
- `tofu init` needs registry.opentofu.org for providers. Cloud sessions
  cannot reach it, so the `tofu` scanner errors there (fails closed). It runs
  in CI.

## In CI

The workflow that runs this on every PR is a control-plane change, so it ships
in its own PR for the owner (PR 18759). In short: `pull_request` scans the merge commit (`--base HEAD^1
--exact-base`) and gitleaks scans the PR's own commits. `push` to main scans
the merged change. A weekly `--all` reports on the whole tree. There are no
secrets, permissions are `contents: read`, and every action is pinned by SHA.
Making the check required and sending new findings to the `security-alerts`
queue is the next task, `sec-codeowners-scan-gate`.

## Relation to the risk review

[`../risk_review.py`](../risk_review.py) is the cyber and legal checklist
the merging agent answers on every PR. It flags a few likely-secret patterns
and sends them to the owner. This scan does not replace it and does not copy
its patterns: gitleaks is the broad secret detector here. The scan's findings
answer the review's `C-deps`, `C-iac` and `C-workflows` checks. Paste the
summary table into the PR body under them.
