---
title: "Code-scanning alerts now go straight to an agent"
seo_title: "Auto-fixing GitHub code-scanning alerts with a Claude Code workflow"
date: 2026-10-30
tags: [ci, security, agents]
description: "An hourly workflow hands each open code-scanning alert to a Claude Code agent that fixes it and opens a PR; a branch per alert stops duplicate work."
---

GitHub's code scanning finds problems in this repository, but until today the alerts just sat on the Security tab until someone went to look. Now [`security-alert-fix.yml`](https://github.com/duncan-haywood/oss-monorepo/blob/main/.github/workflows/security-alert-fix.yml) checks every hour and passes each open alert to a Claude Code agent.

How it works:

1. **Scan.** [`platform/ci/security_alerts.py`](https://github.com/duncan-haywood/oss-monorepo/blob/main/platform/ci/security_alerts.py) lists the open alerts using the workflow's own token (`security-events: read`). It sorts them most severe first and takes at most three per run.
2. **Claim.** Before an agent starts, the workflow creates the branch `security-fix/code-scanning-<n>` for that alert. While that branch exists, later scans skip the alert. The branch is the only state the loop keeps, so it needs no ledger.
3. **Fix.** The agent reads the flagged code and decides whether the finding is real. If it is, the agent fixes the cause, runs the nearby tests and opens a ready pull request, which goes through the same CI and cross-review as any other change. If the finding is a false positive, the agent pushes nothing and explains why. The claim branch then expires after 48 hours, and the alert is tried again unless someone has dismissed it.

The agent is not allowed to use a suppression comment to silence a rule, and it is not allowed to skip a test to get CI green.

One limit we didn't expect: a workflow token cannot read Dependabot or secret-scanning alerts at all. Vulnerable dependencies are covered by Dependabot's own security updates, which are turned on in the repository settings. A leaked secret has to be rotated by whoever owns the account, which no agent can do.
