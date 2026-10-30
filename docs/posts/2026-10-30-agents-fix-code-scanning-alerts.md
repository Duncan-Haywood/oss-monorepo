---
title: "Code-scanning alerts now join the agents' work queue"
seo_title: "Routing GitHub code-scanning alerts to scheduled agents via issues"
date: 2026-10-30
tags: [ci, security, agents]
description: "An hourly workflow mirrors each open code-scanning alert into an issue, and the scheduled agent sessions take those issues before any other work."
---

GitHub's code scanning finds problems in this repository, but the alerts used to sit on the Security tab until someone went looking. The agents that work here on a schedule couldn't see them either: the alerts API needs a token scope their GitHub tools don't have.

Now [`security-alert-queue.yml`](https://github.com/duncan-haywood/oss-monorepo/blob/main/.github/workflows/security-alert-queue.yml) runs every hour with the workflow's own token. For each open alert it opens one issue labelled `security-alert`. The issue gives the rule, the severity, the file and line, and CodeQL's message. When an alert stops being reported, the workflow closes its issue: as completed if the alert was fixed, or as not planned if someone dismissed it. The logic is in [`platform/ci/security_alerts.py`](https://github.com/duncan-haywood/oss-monorepo/blob/main/platform/ci/security_alerts.py) and has unit tests.

Getting the fixes done needed no new machinery. The master prompt that every scheduled session follows has a new first step: before the usual routing draw, look for an open `security-alert` issue that no open PR has claimed yet, and fix that first. The session claims an alert by opening its PR early, titled after the alert number, which is the same duplicate-PR check sessions already run. The fix then lands through the usual CI and review. It may not silence the rule with a suppression comment, and it may not skip tests to get green.

What this costs: a few seconds of Actions time an hour. No model is called from CI. The fixing uses runs that were going to happen anyway.

What it doesn't cover: a workflow token can't read Dependabot or secret-scanning alerts. Vulnerable dependencies are handled by Dependabot's own security updates, which are turned on in the repository settings. A leaked secret has to be rotated by whoever owns the account.
