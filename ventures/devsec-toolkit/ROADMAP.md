# devsec-toolkit roadmap

**Goal (owner, 2026-10-16):** open-source DevSecOps toolkits, because most of
what exists is paid or piecemeal. This is a long-term project. This file is
the plan the next runs pick up from: take the first unchecked item in the
earliest phase that has one, ship it, and tick it here in the same PR.

**What "done" looks like:** a team with no security budget adds one workflow
file and gets, in one report, the coverage they would otherwise assemble from
a paid platform or six separately configured scanners. They can adopt it on a
large legacy repository in an afternoon (baseline), trust that a clean report
is not a silent skip (applicability and skip reporting), and run it with
nothing leaving their machine.

**Principles that do not change between phases:**

- **Reuse, never fork.** A check lives once, as its own tested venture. The
  toolkit only wraps it. Improving a check improves every consumer.
- **No silent passes.** Not applicable, skipped and errored are always
  reported as such, never folded into "0 findings".
- **Local and offline by default.** Anything that calls the network
  (registry lookups, live probes) is opt-in behind `--online`, says what it
  contacts, and only ever targets the user's own assets.
- **Honest output.** Findings are observations with a fix, never "you are
  secure" or "you are compliant".
- **Zero install.** Python standard library plus Node for the JS checks. A
  dependency needs a reason in this file.

## Phase 1: one runner over what exists (shipped 2026-10-16, v0.1.0)

- [x] `devsec.py scan`: applicability by file glob, parallel runs, one finding
      schema, high/medium/low, text/JSON/SARIF/Markdown.
- [x] 22 checks wrapped: 11 GitHub Actions, 4 container, 1 Kubernetes, 3
      supply chain, 2 code, 1 AI agent.
- [x] `.devsec.json`: skip/only by id or category, `ignore_paths`, per-rule
      severity overrides and `off`, `fail_on`, `baseline`.
- [x] Baselines with line-independent fingerprints (`--write-baseline`,
      `--baseline`).
- [x] `bundle`: self-contained copy with only the needed check files.
- [x] `github-workflow.yml`: a SHA-pinned template with a sparse fetch (about
      3 MB), SARIF upload and a step summary.
- [x] Drift guards: catalogue risk sets match each check's own constants;
      every check fires on the fixture; the page lists every check; the
      example report matches a fresh scan.
- [x] Page with a local report viewer (JSON and SARIF).

## Phase 2: wrap the rest of the portfolio's own checks

More security checks already exist here with CLIs that do not scan a whole
directory, so each needs file discovery in its adapter:

- [ ] `k8s-deprecated-api-check`, `k8s-resource-limits-check`,
      `k8s-rollout-safety-check`: per manifest file (`check <file>`).
- [ ] `helm-values-schema-check`: pair each `values.yaml` with its
      `values.schema.json`.
- [ ] `env-example-drift-check`: when `.env.example` exists.
- [ ] `agent-instructions-drift-check`: for `AGENTS.md`, `CLAUDE.md` and
      `.cursorrules`.
- [ ] `sql-migration-lock-check`: `migrations/**/*.sql`.
- [ ] `oidc-trust-policy-check`, `aws-iam-policy-risk-check`: IAM JSON policy
      files (detect by `"Statement"`).
- [ ] `terraform-plan-secret-exposure-check`, `terraform-plan-blast-radius-check`:
      take a `--terraform-plan plan.json` input, because a plan is not in the repo.
- [ ] `required-checks-drift-check`: take `--required-checks FILE`.
- [x] `hidden-unicode-check` (shipped 2026-10-17: `cli.mjs`, catalogue id
      `hidden-unicode`, emoji joiners ignored, Tag runs decoded).
- [ ] `mcp-config-risk-check`,
      `claude-code-hooks-security-check`, `claude-code-settings-check`,
      `claude-code-subagent-check`, `skill-manifest-check`,
      `lockfile-license-check`, `npm-lockfile-duplicates-check`,
      `requirements-pin-check`, `sri-check`: these are browser-only today.
      Give each a zero-dependency `cli.mjs` over its existing engine (the
      `docker-cache-order-check` shape), then wrap it.
- [ ] Known false-positive pattern, found by scanning this monorepo:
      `actions-checkout-credentials-check` escalates to high whenever the job
      also uploads an artifact, even when the upload path is a single file
      outside the workspace (`.github/workflows/public-surface-check.yml`).
      Escalate only when the upload path can include the checkout.

## Phase 3: close the gaps paid platforms charge for

Each of these is a new check venture first, then a catalogue entry:

- [ ] **Secrets in the working tree.** High-precision provider token formats
      (AWS, GitHub, Stripe, Slack, OpenAI and similar) plus entropy, with
      `--history` to walk `git log -p`. This is the gap people pay
      GitGuardian for. It must redact values in all output.
- [ ] **Known-vulnerable dependency versions, offline.** Read lockfiles
      (`package-lock.json`, `pnpm-lock.yaml`, `poetry.lock`,
      `requirements.txt`, `go.sum`, `Cargo.lock`) and match them against an
      OSV database the user downloads (`--osv-db path`), with no per-scan API
      calls. `npm-audit-triage`, `pip-audit-triage` and `cargo-audit-triage`
      already triage existing audit output, so reuse their ranking.
- [ ] **Malicious-package signals.** Install scripts, typosquat distance,
      very new versions and maintainer changes on lockfile diffs.
      `npm-lifecycle-script-check` and `slopsquatting-check` exist; the second
      is online, so it goes behind `--online`.
- [ ] **SBOM out.** `--format cyclonedx` from the same lockfile parse, and
      wrap `sbom-diff-check` for PRs.
- [ ] **IaC.** Terraform HCL (public buckets, open security groups,
      unencrypted storage, wildcard IAM) without needing a plan.

## Phase 4: be the front door to the best free tools

- [ ] Adapters that run zizmor, Trivy (fs and config), Checkov, Semgrep CE,
      gitleaks and OSV-Scanner **when they are on PATH**, and merge their
      SARIF into the same report, severity scale and baseline. That covers
      the "piecemeal" complaint directly: one config, one baseline and one
      report over everything a team already trusts. Licences: invoke them as
      separate programs, never vendor them.
- [ ] A coverage map in every report: which areas this repository has (it has
      Terraform, Helm and a Python service) against which areas were scanned,
      so gaps are visible.
- [ ] Dedupe across tools: the same file, line and issue reported by two
      tools appears once, attributed to both.

## Phase 5: distribution (automated, unpaid, compliant)

Per `portfolio/distribution/`: each channel is built off by default with a
dry run, and the owner enables it once.

- [ ] A standalone `devsec-toolkit` repository (built by `bundle`) with a
      marketplace `action.yml`, so users write `uses: …/devsec-toolkit@<sha>`
      instead of copying a template. Publishing under the portfolio's name is
      an owner step; building the artifact is not.
- [x] Versioned releases (2026-10-30): `platform/distribution/tool-releases.mjs`
      tags `devsec-toolkit-v<version>` and attaches the `bundle` output as a
      reproducible tarball with its SHA-256. Off until the owner sets
      `DISTRIBUTE_TOOL_RELEASES=true`; the version follows a hash of the
      bundle (`portfolio/distribution/versions.json`).
- [ ] PyPI package (`pipx run devsec-toolkit`) via the existing
      `pypi-packages` distribution channel.
- [ ] pre-commit hook definition (`.pre-commit-hooks.yaml`).
- [ ] A GitLab CI template and a generic SARIF and JUnit output for other CIs.
- [ ] Listings on awesome-lists and OpenSSF tool directories, through each
      list's own contribution process only.

## Phase 6: depth that keeps people

- [ ] `devsec fix`: apply the mechanical fixes (pin actions to SHAs via
      `git ls-remote`, add `persist-credentials: false`, add `permissions:`
      blocks, add `timeout-minutes`) as a reviewable diff, never silently.
- [ ] Org mode: scan many checkouts and print one roll-up table per repository
      (for a platform team's weekly review).
- [ ] Trend file: append each scan's counts to `.devsec-history.jsonl` and
      chart it in the page's viewer.
- [ ] AI explain (opt-in, on the user's own API key via `platform/llm`): a
      plain-language walkthrough of a finding in the context of the file,
      never auto-applied.

## Measuring it

Usage is unmeasured, not zero (`portfolio/usage/`). Signals worth reading
once the page is live: the page's local `report_opened` and `example_loaded`
events, which only the visitor can see; GitHub code search for
`devsec-toolkit/devsec.py` in other repositories' workflows (the external
adoption signal in `VENTURE.yaml`); and stars or issues once a standalone
repository exists.
