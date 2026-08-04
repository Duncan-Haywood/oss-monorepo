# Security operations

The repository security workflow runs on pull requests, pushes to `main`,
weekly, and on demand. It provides:

- high/critical npm and pnpm dependency audits;
- tracked-file policy checks for secret-bearing file types, private-key
  markers, and merge conflicts;
- full-history secret scanning with redacted evidence;
- high/critical dependency and infrastructure-configuration scanning;
- JSON and Markdown reports retained as Gitea Actions artifacts for 30 days;
  and
- automatic creation or update of a Gitea remediation issue after failed
  default-branch or scheduled scans.

Gitea has no GitHub Security-tab SARIF ingestion, so the retained artifacts,
workflow result, remediation log, and automated issue are the system of record.
Container-image scanning remains a roadmap item.

## Triage process

1. Confirm the finding without copying sensitive values into logs.
2. Assign an owner and add an entry to `REMEDIATION_LOG.md`.
3. Fix critical findings immediately and high findings before release.
4. Add a regression test or policy check where practical.
5. Link the pull request, Actions run, and Gitea issue, then record verification.

False positives must be documented with evidence. Suppressions belong as close
as possible to the scanner configuration or affected code and require a review
date; do not broadly disable a scanner.

## Repository settings to enable

The workflow cannot enforce repository settings. An administrator should:

- enable Gitea Actions for the repository;
- restrict runner registration to trusted owners and use isolated job
  containers;
- set the default `GITEA_TOKEN` mode to restricted;
- allow `issues: write` only for the security issue-logging job;
- require the `Security` and venture CI checks before merging;
- require pull requests and at least one approving review for `main`;
- prevent force pushes and branch deletion on `main`; and
- deploy Renovate or another Gitea-compatible dependency updater.
