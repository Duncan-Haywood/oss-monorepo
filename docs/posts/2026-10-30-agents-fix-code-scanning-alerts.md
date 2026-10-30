---
title: "Code-scanning alerts now join the agents' work queue, as files"
seo_title: "Routing GitHub code-scanning alerts to scheduled agents as files"
date: 2026-10-30
tags: [ci, security, agents]
description: "An hourly workflow writes each open code-scanning alert as a file on a queue branch, and scheduled agent sessions fix the top one before other work."
---

GitHub's code scanning finds problems in this repository, but the alerts used to sit on the Security tab until someone went looking. The agents that work here on a schedule couldn't see them either: the alerts API needs a token scope their GitHub tools don't have.

Now [`security-alert-queue.yml`](https://github.com/duncan-haywood/oss-monorepo/blob/main/.github/workflows/security-alert-queue.yml) runs every hour with the workflow's own token and writes the open alerts as plain files on a branch called `security-alerts`. `QUEUE.md` lists them, most severe first. Each alert also gets its own file, `alerts/<n>.md`, with the rule, the file and line, CodeQL's message and the steps to fix it. When an alert stops being reported, its file disappears on the next run. The logic is in [`platform/ci/security_alerts.py`](https://github.com/duncan-haywood/oss-monorepo/blob/main/platform/ci/security_alerts.py) and has unit tests.

Why files rather than GitHub issues? An agent reads a file with one `git show`. It needs no API scope, no pagination, and no parsing of issue bodies. `main` only accepts changes through pull requests, and an hourly PR would be noise, so the queue lives on a branch of its own that is never merged.

The master prompt that every scheduled session follows has a new first step: read `QUEUE.md`, and take the top alert that has no `security-fix/code-scanning-<n>` branch yet. Pushing that branch is how a session claims an alert. If two sessions try at once, only one push succeeds. The fix then lands through the usual CI and review. It may not silence the rule with a suppression comment, and it may not skip tests to get green. If a session claims an alert and abandons it, the branch-cleanup job deletes the claim after 48 hours and the alert is offered again.

What this costs: a few seconds of Actions time an hour. No model is called from CI. The fixing uses runs that were going to happen anyway.

What it doesn't cover: a workflow token can't read Dependabot or secret-scanning alerts. Vulnerable dependencies are handled by Dependabot's own security updates, which are turned on in the repository settings. A leaked secret has to be rotated by whoever owns the account.
