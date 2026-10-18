# devsec-toolkit

Every DevSecOps check, one command. Free, open source (MIT), zero
dependencies, and nothing leaves your machine.

Supply-chain and CI security tooling is mostly paid, or scattered across a
dozen single-purpose scanners, each with its own install, output format and
suppression scheme. devsec-toolkit runs a repository through **23 static
security checks** and reports every finding once: one schema, one
high/medium/low scale, one baseline, and text, JSON, Markdown or SARIF output.

**After using this, you can** gate every pull request on GitHub Actions
injection and poisoning, secrets baked into images, privileged containers and
pods, dependency confusion, JWT misuse, ReDoS and over-broad AI-agent
permissions, with findings in GitHub's Security tab. **That used to take**
installing and wiring up a separate tool per area (or a paid platform), then
reconciling their output by hand.

Page: <https://duncan-haywood.github.io/monorepo-projects/devsec-toolkit/>.
It includes a local report viewer for the JSON or SARIF this writes.

## Quick start

```sh
# Fetch only the toolkit and the checks it runs (~3 MB, not the whole monorepo)
git clone --depth 1 --filter=blob:none --sparse https://github.com/Duncan-Haywood/oss-monorepo.git devsec-src
cd devsec-src && git sparse-checkout set ventures/devsec-toolkit \
  $(python3 ventures/devsec-toolkit/devsec.py list --paths) && cd ..
alias devsec="python3 $PWD/devsec-src/ventures/devsec-toolkit/devsec.py"

devsec scan .                                   # text report, exit 0
devsec scan . --fail-on high                    # exit 2 if a high finding exists
devsec scan . --format sarif -o devsec.sarif    # GitHub code scanning
devsec scan . --format markdown                 # PR comment / $GITHUB_STEP_SUMMARY
devsec scan . --format json -o devsec.json      # machine-readable; open it in the page's viewer
devsec list                                     # every check, by category
devsec bundle vendor/devsec                     # self-contained copy (about 0.7 MB) to commit or cache
```

Requirements: Python 3.9+. Node.js 18+ for the six checks written in
JavaScript. Without Node those are reported as **skipped**, never as passing;
add `--strict` to make a skipped or crashed check fail the run.

## In GitHub Actions

Copy [`github-workflow.yml`](github-workflow.yml) to
`.github/workflows/devsec.yml`. On every pull request and push to `main` it
fetches the toolkit sparsely at the commit you pin, writes a Markdown summary
to the job page, uploads SARIF to code scanning (alerts in the Security tab,
annotations on the PR), and fails on findings at or above `FAIL_ON`. Every
action in it is pinned to a full commit SHA, and devsec scans clean on it.

## Adopting it on an existing repository

A mature repository will have hundreds of findings on day one. Don't fix them
all before turning the gate on:

```sh
devsec scan . --write-baseline .devsec-baseline.json   # accept what exists today
echo '{"baseline": ".devsec-baseline.json", "fail_on": "low"}' > .devsec.json
git add .devsec.json .devsec-baseline.json
```

From then on, `devsec scan .` reports and fails only on findings that are
**new**. Fingerprints use the check, rule, file and message, not the line
number, so a known finding stays suppressed when code above it moves. Burn the
baseline down over time by deleting it and re-baselining after fixes.

## Configuration: `.devsec.json`

Read from the scan root when present (or `--config FILE`):

```json
{
  "skip": ["actions-timeout", "code"],
  "only": [],
  "ignore_paths": ["tests/fixtures/**", "vendor/**"],
  "severity": {
    "pinned-actions": "high",
    "actions-timeout/job-missing-timeout": "medium",
    "docker-base-image-pin": "off"
  },
  "fail_on": "high",
  "baseline": ".devsec-baseline.json"
}
```

`skip` and `only` take check ids or categories (`ci-cd`, `containers`,
`kubernetes`, `supply-chain`, `code`, `ai-agents`). `severity` overrides a
whole check or one `check/rule`, and `off` drops it. Command-line `--only`,
`--skip`, `--fail-on` and `--baseline` win over the file.

## What it checks

`devsec list` prints the live list. Each check is a separate tool in this
repository with its own tests, README and page. devsec-toolkit runs the ones
whose files exist and reports the rest as **not applicable**, so a repository
with no Dockerfile never reads as a clean Docker scan.

| Area | Checks |
|---|---|
| GitHub Actions | pwn-request checkout and script injection · artifact poisoning · cache poisoning · secrets re-encoded past log masking · `secrets: inherit` to external or fork-reachable workflows · self-hosted runners reachable from forks · `write-all` / missing `permissions:` · checkout leaving the token in `.git/config` · actions pinned to mutable tags · deprecated action runtimes · jobs with no timeout |
| Containers | secrets in `ENV`/`ARG`/`COPY` layers · privileged, socket-mounting and exposed Compose services · end-of-life base images · base images on mutable tags |
| Kubernetes | privileged pods, host namespaces, root containers, missing seccomp, writable root filesystems, `:latest` images |
| Supply chain | dependency confusion (`--extra-index-url`, unscoped private npm names) · end-of-life or disagreeing Node.js versions · Dependabot missing or not covering an ecosystem |
| Code | JWT verification switched off, `alg: none`, unpinned algorithms, hard-coded secrets · regular expressions open to catastrophic backtracking |
| AI agents | Claude Code `Bash(*)`-style allow-all rules, destructive allows with no deny, MCP servers over plain HTTP or with literal secrets |

Severities are this toolkit's defaults, chosen for how directly a finding is
exploitable. They are in [`catalog.py`](catalog.py), and any can be overridden
per repository.

## Why use this rather than…

- **Paid platforms (Snyk, GitGuardian, Socket, Aikido, Wiz).** They add
  dashboards, triage workflows, vulnerability databases and support, priced per
  developer or repository. If you need those, buy them. This is the free, local
  layer: no account, no upload, output you own.
- **Free single-purpose scanners (zizmor, Trivy, Checkov, Semgrep, gitleaks,
  OSV-Scanner).** Excellent, and worth running. devsec-toolkit is not a
  replacement for vulnerable-version scanning (OSV-Scanner, Trivy) or
  git-history secret scanning (gitleaks). It covers ground they leave open:
  Actions cache and artifact poisoning, `secrets: inherit`, secret
  re-encoding, AI-agent permission configs, ReDoS and JWT misuse. It does this
  behind one report and one baseline. Adapters that run those tools and merge
  their findings into the same report are next on the [roadmap](ROADMAP.md).
- **Linter aggregators (MegaLinter, Super-Linter).** They run many linters
  from a multi-gigabyte Docker image and concatenate the logs. This is
  security-only, needs no Docker, fetches about 3 MB, and normalises every
  finding onto one schema with stable fingerprints.

## How it works

`devsec.py` walks the repository once, decides which checks apply from
[`catalog.py`](catalog.py)'s file globs, and runs those checks in parallel as
subprocesses, each with the repository as its working directory. Each check's
own output is read by a small adapter in `catalog.py`. An adapter keeps exactly
what the check itself counts as a risk (its `--fail-on-risk` logic). A test
fails if a Python check's `RISK_CLASSIFICATIONS` drifts from the catalogue. The
adapter then maps everything onto one finding schema:

```json
{"check": "actions-injection", "rule": "script-injection", "severity": "high",
 "category": "ci-cd", "file": ".github/workflows/pr.yml", "line": 17,
 "message": "Untrusted event text is interpolated straight into a shell command: github.event.pull_request.title",
 "fix": "Pass github.event.pull_request.title through a step `env:` var ...",
 "fingerprint": "5c0d..."}
```

Scanning this whole monorepo (about 300 MB, around 1,300 workflows) takes
about 30 seconds.

## Development

```sh
python3 -m unittest test_devsec -v        # runner, adapters, SARIF, baseline, bundle
node --test viewer.test.mjs page.test.mjs # report viewer and page
python3 test_devsec.py --regenerate-example   # after changing the fixture or a check
```

`tests/fixtures/vulnerable-repo/` is a deliberately vulnerable repository: its
workflows never run (they are not under the repository root's
`.github/workflows`) and every "secret" in it is a labelled fake. A test fails
if any catalogued check produces no finding on it, so adding a check means
adding a fixture case that makes it fire.

## No warranty

**No warranty.** This tool is provided free and as-is, without warranty of any
kind, express or implied. It is not a security audit, a penetration test, a
compliance attestation or security advice, and it does not replace a qualified
professional. **You are responsible for reviewing and verifying its output
before relying on it**, and for deciding what to change in your own systems. To
the maximum extent permitted by law, the authors accept no liability for any
loss or damage arising from its use.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be
slow, broken, moved, or taken offline without notice. We do not promise uptime,
backups of anything you type, or that a URL will keep working. Do not use this
as a system of record. If a tool needs to survive, export your inputs and run
it yourself.

A clean report means these checks found nothing. It does not mean the
repository is secure.

MIT licensed. If it helped, [sponsoring](https://github.com/sponsors/Duncan-Haywood)
is optional and never changes what the tool does.
