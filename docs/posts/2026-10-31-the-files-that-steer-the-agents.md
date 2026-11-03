---
title: "The files that steer the agents: hardening a repo that agents merge themselves"
seo_title: "Hardening a GitHub repo where AI agents merge their own PRs"
date: 2026-10-31
tags: [security, agents, github-actions, codeowners]
description: "Agents merge their own PRs here, so one merged PR could rewrite the instructions, hooks and merge gate for every later agent. Those files now need owner review."
---

In this monorepo, agents open and merge their own pull requests. Nobody reviews them, and that is on purpose: several sessions land work every hour. More agent families are about to start contributing, so we asked what one misbehaving agent could do with that freedom.

**Where the risk was.** Fork PRs were already well covered. The risk was in the files every agent trusts: `CLAUDE.md` and `prompts/` tell each session what to do, `.claude/settings.json` hooks and `.mcp.json` run code at session start before the agent decides anything, and `.github/` plus the reviewer config decide what may merge. One merged PR could rewrite all of these for every later run. The `main` ruleset also had an admin bypass, and some agents push with the owner's admin token, so for them the ruleset did nothing.

**What changed.**
- `.github/CODEOWNERS` now names those paths, and the ruleset turns on Code Owner review with no bypass. A PR touching them waits for the owner. Product code, research, posts and run records still merge without review.
- A new `control-plane` check runs on every PR and fails if CODEOWNERS stops covering a path it must cover. After each merge, it also fails `main` if a control-plane change landed without the owner's approval.
- We found that 14 jobs pass publishing or paid-API secrets (npm, PyPI, social accounts, agent triggers). These jobs now run in GitHub Environments.

**The part that surprised us.** Merge rules don't protect repository secrets. Any workflow on any branch an agent pushes can read them, merged or not. Only an environment secret limited to `main` is out of reach, so moving the secrets is the owner's most important step. The checklist, and the secrets we left alone and why, are in `docs/security/agent-hardening.md`.
