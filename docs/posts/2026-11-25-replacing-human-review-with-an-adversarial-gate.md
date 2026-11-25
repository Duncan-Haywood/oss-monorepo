---
title: "We replaced the owner's code review with an adversarial gate"
seo_title: "No human in the loop: an adversarial CI gate for a repo agents write"
date: 2026-11-25
tags: [ci, security, agents, aws]
description: "Agents write nearly all of this repo. The owner's approval step was one nobody used, so we replaced it with checks that treat every PR as hostile."
---

Agents write nearly all the code in this repository. Until yesterday, one class of change still needed the owner's approval: edits to agent instructions, CI workflows, hooks and the merge rules themselves. The idea was sound. A prompt-injected agent that can rewrite the rules other agents follow, or the checks that judge its own pull request, can do a lot of damage.

The owner put the problem with that plainly: "we don't want to kill dev on a crazy level by requiring human in the loop when the human will never actually look at the code and is 1000x less time on the repo than the agents roughly." A review step that nobody actually does protects nothing. It just slows things down. What they asked for instead was "thorough cysec and reliability and liability checks", "adversarial analysis", and "really best effort".

So we built a gate that reads every pull request as if an attacker wrote it.

## The one rule that makes it work

**The code that judges a pull request always comes from `main`, never from the pull request.**

The gate workflow runs on `pull_request_target`, so GitHub takes the workflow file from the base branch. Every checkout in it is the base branch. The pull request's commits are fetched as data, into refs and detached worktrees with git hooks turned off, and nothing in them is installed, imported, built or run. A PR that edits the gate is therefore judged by the old gate. Weakening it takes two separate merges, each judged by the version before it, and each leaves a file in the history.

The same rule covers false positives. A PR can't clear its own finding with a label or a sentence in its description. The only escape hatch is an entry in an allowlist file, with a reason, merged in an earlier PR that the gate also judged.

## What it checks

Two new required checks sit beside the existing `risk-review`, `ci-policy`, `control-plane` and `conflict-markers` checks:

- **`security-scan`** runs gitleaks, Semgrep, OSV-Scanner, Checkov, Trivy and zizmor, plus the repository's own liability scanner. Every scanner is pinned by version and checksum. It scans the merge base and the head the same way and fails only on findings the PR adds, so old debt doesn't block unrelated work.
- **`adversarial-gate`** runs 33 deterministic rules, each written as "how would a rogue agent attack this repository?". Among them:
  - secrets, hidden Unicode, `curl | sh`, obfuscated payloads, new outbound hosts and TLS turned off;
  - prompt injection in agent instructions, and guardrail sentences that disappear;
  - workflows that gain secrets, write permissions or OIDC, or start running PR code;
  - deleted or skipped tests, lowered coverage and unbounded retries;
  - typosquatted dependencies;
  - public buckets and wildcard IAM; for our AWS code, removed policy denies, weakened protections and wildcard GitHub identities;
  - fabricated claims and pages without a disclaimer.

  For control-plane and AWS changes, an LLM red-team review runs on top. It treats the diff as untrusted data inside a random delimiter, and its "block" counts only if it quotes evidence that appears verbatim in the diff. An API error or a refusal never blocks. A high-risk diff too large to review does block, so nothing can hide in volume.

Every blocking finding says how to fix it. An agent can always get unblocked without a person.

## How it does on real history

Replayed over the 48 commits to `main` before it existed, the gate blocked 3 and passed 45. Two of the blocks were workflows that gained secrets or cloud credentials. The third was a large change to CI's trust tiers. A person should have looked hard at each of those three.

On the pull request that introduces it, the gate blocks 22 times: 20 for new privileged workflows (the AWS plan and apply jobs, the gate itself, CodeQL), one for the new AWS bootstrap stack, and one for an exception that lets the liability scanner run. That is the gate working. Each of those is exactly what it should stop on any later PR. It doesn't judge its own introduction, because its workflow doesn't exist on `main` yet. That first merge is the one step judged only by the checks that already existed.

Dogfooding found two bugs before merge. Fake AWS keys in the gate's tests tripped the existing secret scanner. A `@pytest.mark.skip` inside a test string tripped the gate's own "skipped test" rule. Both were fixed by assembling those strings at runtime, not by weakening a rule.

## What it doesn't do

- The LLM layer needs a credential. Until the AWS account exists, it skips and only the deterministic rules run.
- The ruleset that makes these checks required lives in the repository as a file. Applying it to GitHub takes an admin token, and nothing in the repository holds one.
- A determined attacker can still weaken the gate in two merges. The defence is that each step is visible and judged, not that it is impossible.

## Why this lands next to an AWS move

The same pull request carries the infrastructure-as-code for moving our LLM and email traffic onto AWS. OpenTofu sets up the organisation, the security baseline, Claude Platform on AWS, SES, and spend guards with a kill switch. On a merge to `main`, CI applies the AWS code with a near-admin role and no long-lived keys. That is precisely the kind of change an approval step used to guard, so the gate puts `platform/aws/` in its strictest tier from day one.
