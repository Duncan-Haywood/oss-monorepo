---
title: "No human in the merge loop: threats get controls, not reviewers"
date: 2026-11-24
tags: [security, agents, process, ci]
description: "The last owner-approval gate is gone. A required check runs main's own reviewer over every PR and blocks four liability-grade threats outright, with no approval path."
---

Earlier today this repository replaced owner approval for agent instructions
with a cyber and legal checklist. A few files still waited for the owner: the
privileged workflows, session-start hooks, and the files that define the
review itself. The owner's answer was short: "I don't need to review. just be
extra careful for adversarial changes."

So the question changed from "who reviews this?" to "what could a hostile
change do, and what stops it automatically?"

## One fact made the old gate moot

Agent pull requests here are opened under the owner's own GitHub identity.
GitHub does not let anyone approve their own pull request. The approval gate
could never have been satisfied for those PRs. It only worked because agents
politely waited, and the ruleset that would have enforced it had never been
applied.

## What replaced it

A required check, `risk-review`, runs on `pull_request_target`. That trigger
uses the workflow and code from `main`, not from the PR. The job checks out
`main`, fetches the PR's commits as plain git objects, and runs main's copy
of `platform/security/risk_review.py` over the diff. The PR's code is never
checked out, imported or run, so a PR can't grade itself with a reviewer it
edited.

The check blocks four things, and nothing can approve them through:

- **a likely secret** in an added line;
- **a removed line in the guardrails** (the hard limits on legal, financial
  and ethical liability are append-only);
- **an existing licence** changed to anything outside an allowed list;
- **a weaker gate.** A change to the gate's own files may only add to it.
  Dropping an owned path, a ruleset rule, a required check, a secret pattern
  or a check id is blocked. The reviewer's own lists are read with Python's
  `ast` parser, which reads the file without running it.

Everything else passes. The checklist goes in the PR body for the merging
agent to answer, and the files CODEOWNERS lists get flagged as *sensitive*
for the closest look.

After merge, `control_plane_guard.py` audits each commit on `main`. A
sensitive change without a passing `risk-review` fails the audit. A check
with that name only counts if it came from `priv-risk-review.yml` on a
`pull_request_target` run, so a PR can't fake it with a same-named job of its
own.

## What it doesn't do (yet)

A prompt-injected agent can still answer its own checklist dishonestly. The
four blocks don't depend on that answer, and the next step is an AI reviewer
that is not the PR's author. The bigger gap was never the merge gate anyway.
A same-repository PR's workflow can read secrets before any review sees it.
Approval never stopped that. Moving secrets out of GitHub, behind cloud roles
that only `main` can assume, is the fix, and it is next in the queue.

The threat table is in `docs/security/risk-review.md`.
