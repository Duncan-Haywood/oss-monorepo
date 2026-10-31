# Hardening the repo against misbehaving agents

Written 2026-10-30, when more agent families were about to start contributing.
Agents already merge their own PRs here with no review gate (`CLAUDE.md`,
"Ship without review ceremony"). That stays. The aim is narrower: an agent
that goes wrong, through a bad prompt, a poisoned input or a leaked token,
should not be able to change the rules for every other agent, take the
publishing secrets, or merge past the checks.

The defenses against fork PRs were already good: `review.py` refuses fork
heads, auto-merge runs the default-branch copy of `review.py`, and about thirty
`actions-*` checks cover the usual workflow-injection mistakes. The gaps were
in how much the repo trusts its own writers.

## What the repo does now

| Piece | File | What it stops |
|---|---|---|
| Code owners for the control plane | `.github/CODEOWNERS` | A PR that edits agent instructions, hooks, MCP config, CI, the reviewer config or the ruleset, merging without the owner |
| Ruleset: Code Owner review, stale approvals dismissed, no bypass, `control-plane` required | `.github/rulesets/main.json` | An admin token (which agents pushing as the owner hold) skipping every rule |
| `control-plane` check on every PR | `.github/workflows/control-plane-guard.yml`, `platform/ci/control_plane_guard.py` | A PR that quietly removes a line from CODEOWNERS; lists the owned files a PR touches |
| Post-merge audit on `main` | same workflow, `--audit-commit` | A control-plane change that reached `main` without an owner approval (bypass, or before the ruleset is applied) goes red |
| Publishing and paid-API jobs run in Environments | `environment:` on 14 jobs in `.github/workflows/` | Once the secrets move (step 4), a workflow on any branch other than `main` can no longer read them |

Why each path is owned:

- `CLAUDE.md`, `AGENTS.md`, `prompt.md`, `prompts/`, `.github/prompts/`:
  every session reads these and follows them. Rewriting them steers every later
  run. `prompts/runs/`, `prompts/derived/` and `prompts/drift/` are run data,
  so they stay unowned.
- `.claude/`, `.cursor/`, `.mcp.json`, `platform/agents/`: agent tools run
  this code by themselves at session start (hooks, the MCP server), before any
  agent decides anything. That makes them the most direct way to get code into
  every later session.
- `.github/`: workflows hold the secrets and the merge gate.
- `platform/ci/agent_review/`: `config.yaml` decides whose approval counts and
  how many auto-merge needs.
- `portfolio/router/requirements.txt`: `agent-pr-auto-merge.yml` pip-installs
  it in a job that holds a write token.

The cost: an agent PR that touches these paths now waits for the owner. Product,
research, posts and run records do not.

## Owner checklist (GitHub settings no file can change)

Do them in this order. Step 1 has to come before step 2.

1. **Give agents their own non-admin identities.** Claude Code sessions often
   push as the owner (`platform/ci/agent_review/config.yaml`), and the owner is
   an admin. Use a GitHub App, or a machine user with the **Write** role, for
   each agent family. Never give an agent Admin or Maintain. Until this is
   done, the post-merge audit can only warn on control-plane changes made
   under the owner's account, because it cannot tell an agent from you. Also,
   GitHub won't let you approve a PR opened under your own account.
2. **Apply the ruleset:**
   `gh api -X PUT repos/Duncan-Haywood/oss-monorepo/rulesets/26239454 --input .github/rulesets/main.json`.
   Then open a throwaway PR that edits `CLAUDE.md` and check that GitHub asks
   for a Code Owner review and won't merge without it.
3. **Settings → Actions → General:**
   - Workflow permissions: **Read repository contents** (the default token).
     Workflows that need more already declare it.
   - Untick **Allow GitHub Actions to create and approve pull requests**.
   - Fork PR workflows: **Require approval for all external contributors**.
4. **Settings → Environments.** The workflows now name three environments.
   GitHub creates each one, unprotected, the first time a job that names it
   runs; creating them by hand first is quicker. For each one, set
   *Deployment branches* to `main` only. Then move the secrets from repository
   secrets into the environment and delete the repository copy:
   - `publish`: `NPM_TOKEN`, `PYPI_TOKEN`, `HOMEBREW_TAP_TOKEN`, `DEVTO_API_KEY`,
     `HASHNODE_TOKEN`, `MASTODON_TOKEN`, `BSKY_HANDLE`, `BSKY_APP_PASSWORD`,
     `BUTTONDOWN_API_KEY`, `FACEBOOK_PAGE_TOKEN`, `INSTAGRAM_TOKEN`,
     `THREADS_TOKEN`. Add yourself as a required reviewer only if you want to
     approve each release; the jobs run on a schedule, so a reviewer means a
     click per run.
   - `paid-agents`: `CLAUDETRIGGERAPIKEY`, `OPENCODE_API_KEY`,
     `ANTHROPIC_API_KEY`. `uitest-ci.yml`'s manual job then runs from `main`
     only.
   - `usage`: `TRAFFIC_TOKEN`.

   This matters more than it looks. A repository secret can be read by *any*
   workflow on *any* branch an agent pushes, merged or not: a new workflow
   file with `on: push` that echoes the secret somewhere is enough. Only an
   environment secret limited to `main` is out of reach.
5. **Secrets this PR does not move.**
   - The Cloudflare token: `portfolio-pages.yml`'s `gate` job checks for it on
     pull requests too, so moving it would quietly turn off the Cloudflare
     deploy. Keep it scoped to Workers and Pages on this one account, and
     rotate it if an agent has misbehaved.
   - The four `AGENT_REVIEWER_*` keys: cross-review runs on PR branches by
     design.
   - `DOCS_PASSCODE`, `VERCEL_*`: `retail-pilot-intel-deploy-docs.yml` needs a
     look at its build job first.
6. **Settings → Code security:** turn on secret scanning and **push
   protection**.
7. **Agent environments:**
   - Claude Code cloud environments: use the limited network policy, give each
     environment only the secrets it needs, and don't use bypass permission
     mode for unattended runs.
   - Kilo and Cursor: install their GitHub Apps on this repository only, with
     the narrowest permissions they offer.
   - Prefer short-lived App installation tokens to PATs. Where a PAT is
     unavoidable, make it fine-grained and limited to this repository.
8. **Watch:** a red `Control-plane guard` run on `main` means a control-plane
   change landed without your approval. The repo's audit log (Settings →
   Audit log on an org, or your security log) shows ruleset and secret edits.

## What is still open

- Two cross-review bots approving each other's PRs still auto-merges anything
  outside the control plane. That is the intended model. Inside it, Code
  Owner review is what stops collusion.
- Agents still run repository code (tests, build scripts) as part of their
  work. Owning every file would end self-merging, so the line is drawn at code
  that runs *without* an agent choosing to run it.
