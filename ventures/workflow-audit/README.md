# Workflow Audit

One free GitHub Action (and zero-dependency CLI) that runs twelve read-only
checks over `.github/workflows` and merges the findings into one
severity-ranked report: job summary, JSON, Markdown or SARIF for Code
Scanning. Nothing is uploaded and it makes no network calls.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/workflow-audit/

## Why use this instead of what you have today

| Option | Trade-off |
|---|---|
| Read workflows by eye | Misses `${{ }}` injection, `secrets: inherit`, cache poisoning. |
| zizmor | Broader and more mature. Needs install and config. Use it too if you want depth. |
| OpenSSF Scorecard | Scores whole-repo posture, not each workflow line. |
| Hosted platforms | Dashboards and enforcement, paid, your YAML leaves the runner. |
| **Workflow Audit** | One `uses:` line, one report, nothing leaves the runner. Shallower than zizmor. |

## Use

```yaml
- uses: actions/checkout@v5
  with: { persist-credentials: false }
- uses: Duncan-Haywood/oss-monorepo/ventures/workflow-audit@main   # pin a SHA once reviewed
  with:
    fail-on: high          # high | medium | low | none (default none)
    sarif-file: audit.sarif  # optional, for github/codeql-action/upload-sarif
```

CLI: `python3 audit.py [path] [--format text|json|markdown|sarif] [--fail-on high]`.

## Adopt it on a repo that already has findings

A gate that fails on day one gets deleted on day two. Accept what exists, fail on what is new:

```
python3 audit.py --write-baseline .workflow-audit-baseline.json   # commit the file
```
```yaml
- uses: Duncan-Haywood/oss-monorepo/ventures/workflow-audit@main
  with: { fail-on: medium, baseline: .workflow-audit-baseline.json }
```

Baseline entries match on file, rule, job and the offending line's text, not its line number, so
editing above a finding does not bring it back. A second copy of an accepted line is new and is
reported. A missing or unreadable baseline is an error, never a silent pass. To silence one finding
for a stated reason, comment its line or the line above:
`# workflow-audit: ignore[unpinned-third-party-action]` (or a bare `# workflow-audit: ignore`).
Reports say how many findings were suppressed. On this monorepo the scan finds 1,182; the baseline
is what makes `fail-on` usable there.

## What it runs

Vendored copies, in `checks/`, of the sibling ventures `actions-injection-check`,
`actions-secret-leak-check`, `actions-artifact-poisoning-check`,
`actions-cache-poisoning-check`, `actions-self-hosted-exposure-check`,
`actions-secrets-inherit-check`, `actions-permissions-check`,
`actions-checkout-credentials-check`, `actions-runtime-deprecation-check` and
`actions-timeout-check` and `deploy-concurrency-check` (run through an adapter in `audit.py`), plus `checks/unpinned-action.py` (new here, no
standalone venture yet). Each runs as a subprocess so one failure never hides
the others. `test_audit.py` fails if a vendored copy drifts from its source
venture: re-copy `check.py` to `checks/<name>.py` when it does.

Severity is set in `audit.py` (`CHECKS`). Informational classifications are
dropped.

## Tests

`python3 -m unittest test_audit` and `node --test page.test.mjs`.

## Limits

Pattern matching on YAML, not a security audit or compliance attestation. It
cannot see what a called action or reusable workflow does, and it flags only direct
`uses:` refs that are not a full commit SHA, not the refs inside actions they
call (see `actions-transitive-pin-check`). A clean report
means these twelve patterns were absent.

## Licence and support

MIT ([`LICENSE`](LICENSE)). Optional support: https://github.com/sponsors/Duncan-Haywood.
No warranty; best-effort hosting, no SLA.
