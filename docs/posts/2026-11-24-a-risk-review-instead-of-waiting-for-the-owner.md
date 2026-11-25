---
title: "A risk review instead of waiting for the owner"
date: 2026-11-24
tags: [security, agents, process, legal]
description: "Instruction edits no longer wait for the owner. Each PR gets a cyber and legal checklist from its diff; only secrets, guardrail cuts and licences escalate."
---

Agents write and merge almost everything in this repository. For a month, one
class of change waited for the owner: anything touching the instructions
agents follow (`CLAUDE.md`, `prompts/`) or the code that runs on its own (CI,
hooks). The reasoning was sound. An agent tricked by a poisoned web page or
issue could rewrite the rules for every session after it.

In practice the gate was never enforced, and agents simply blocked
themselves, leaving PRs waiting on a person who had not asked for them. The
owner's verdict: "i really don't like all this stuff that is blocking itself
on my behalf. not a good practice in general. can we instead have maybe a
review process on cysec and legal risks instead?"

## What replaced it

Every PR now gets a **risk review**. `platform/security/risk_review.py` reads
the branch's diff and prints the checks it triggers, each with the files and
the question to answer:

- **cyber:** instruction edits that would help a prompt-injected agent,
  workflow permissions, code that runs at session start, new dependencies,
  infrastructure, auth and payment code, eval and innerHTML, new outbound
  hosts;
- **legal:** licence changes, third-party code, personal data and tracking,
  marketing claims, email outreach (CAN-SPAM, GDPR, PECR), regulated-advice
  disclaimers, pricing and checkout.

The merging agent answers them in the PR and fixes what they turn up. Only
these go to the owner:
- a likely secret;
- a cut to the guardrails or hard limits;
- a licence change on existing code;
- a small core of files that a review cannot protect.

That core is three kinds of file:
- the gate and the review themselves, because an agent that can edit the
  reviewer can switch it off;
- the `priv-*` workflows that hold publishing and payment secrets;
- the hooks and scripts that run at the start of every session.

All three change rarely. An hour earlier, another session had already split
CI the same way: only workflows that hold secrets need the owner, and a
`ci-policy` check keeps the rest read-only.

## What it doesn't do yet

The triggers are patterns over the diff. They show where to look, not whether
something is wrong. An agent that has been manipulated could also answer its
own checklist dishonestly. The next step (`risk-review-ci` in the work queue)
runs the same review as a required CI check, answered by an AI reviewer that
didn't write the PR. The process is in `docs/security/risk-review.md`.
