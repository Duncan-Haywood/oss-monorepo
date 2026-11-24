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
| Code owners for the control plane | `.github/CODEOWNERS` | A PR that edits agent instructions, hooks, MCP config, privileged CI, the reviewer config or the ruleset, merging without the owner |
| `ci-policy` check on every PR (since 2026-11-24) | `.github/workflows/priv-ci-policy.yml`, `platform/ci/ci_policy_check.py`, `.github/ci-policy.yaml` | An unowned workflow that reads a secret, holds a write token, runs on a self-hosted runner, uses an unpinned or unlisted action, or poses as a required check; privileged jobs running unowned code |
| Ruleset: Code Owner review, stale approvals dismissed, no bypass, `control-plane` required | `.github/rulesets/main.json` | An admin token (which agents pushing as the owner hold) skipping every rule |
| `control-plane` check on every PR | `.github/workflows/priv-control-plane-guard.yml`, `platform/ci/control_plane_guard.py` | A PR that quietly removes a line from CODEOWNERS; lists the owned files a PR touches |
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
- `.github/workflows/priv-*.yml`, `.github/rulesets/`, `.github/ci-policy.yaml`,
  `platform/ci/ci_policy_check.py`: the workflows that hold secrets, write
  tokens or a required check, and the rules that keep every other workflow
  from doing so. Other workflows are not owned (see "Two tiers of CI").
- The scripts a privileged job runs (listed in CODEOWNERS under "Code that
  priv- workflows run"): editing one is as good as editing the workflow.
- `platform/ci/agent_review/`: `config.yaml` decides whose approval counts and
  how many auto-merge needs.
- `portfolio/router/requirements.txt`: `priv-agent-pr-auto-merge.yml` pip-installs
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
   for a Code Owner review and won't merge without it. Since 2026-11-24 the
   ruleset also requires `ci-policy`; a PR that only adds a read-only
   workflow should merge without you.
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
     `ANTHROPIC_API_KEY`. `priv-uitest-ci.yml`'s manual job then runs from `main`
     only.
   - `usage`: `TRAFFIC_TOKEN`.

   This matters more than it looks. A repository secret can be read by *any*
   workflow on *any* branch an agent pushes, merged or not: a new workflow
   file with `on: push` that echoes the secret somewhere is enough. Only an
   environment secret limited to `main` is out of reach.
5. **Secrets this PR does not move.**
   - The Cloudflare token: `priv-portfolio-pages.yml`'s `gate` job checks for it on
     pull requests too, so moving it would quietly turn off the Cloudflare
     deploy. Keep it scoped to Workers and Pages on this one account, and
     rotate it if an agent has misbehaved.
   - The four `AGENT_REVIEWER_*` keys: cross-review runs on PR branches by
     design.
   - `DOCS_PASSCODE`, `VERCEL_*`: `priv-retail-pilot-intel-deploy-docs.yml` needs a
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

## Two tiers of CI

Added 2026-11-24. Before, CODEOWNERS owned all of `/.github/`, so every CI
edit, even a new read-only test workflow, waited for the owner. The owner
called that policy "pretty dumb" and asked for one that keeps the guarantee
without the blanket approval. The guarantee: **no agent can give itself a
secret, a write token or a weaker merge gate without the owner's approval.**
A read-only, secret-free workflow can do none of those, so it no longer needs
review.

| | Before (2026-10-30) | After (2026-11-24) |
|---|---|---|
| Owned by the owner | All of `/.github/` (129 workflows, prompts, templates) | `priv-*.yml` workflows (33), `.github/CODEOWNERS`, `rulesets/`, `ci-policy.yaml`, `prompts/`, `FUNDING.yml`; the checker, the guard, `agent_review/`; the scripts privileged jobs run |
| Merges without review | Nothing under `.github/` | Every other workflow (97), `ISSUE_TEMPLATE/` |
| What stops an unowned workflow taking a secret or write token | Nothing but review | `ci-policy`, a required check |
| Required checks | `conflict-markers`, `control-plane` | `conflict-markers`, `control-plane`, `ci-policy` (all three in `priv-` workflows) |
| Code a secret-holding job runs | Not owned (a gap: `branch_cleanup.py`, the npm/PyPI publishers, ...) | Owned, or listed with a reason under `privileged_code_accepted` in `ci-policy.yaml`; the check fails on anything else |
| Guard and checker invoked | `python3 script.py` (a module added next to it could shadow `json`) | `python3 -I script.py` |

**Which tier.** A workflow is `priv-` if any job holds a secret other than
`GITHUB_TOKEN`, any write permission, `id-token`, an `environment:`, runs on
`pull_request_target`/`workflow_run`, or is a required status check. Renamed
to `priv-` in this change: the 30 workflows that needed secrets or write
access, plus `control-plane-guard.yml` and `conflict-markers-ci.yml` (required
checks; an agent able to edit one could make it always pass), plus the new
`priv-ci-policy.yml`. Workflow `name:`s and job ids did not change, so check
names, `workflow_run` triggers and the ruleset's required checks still match.

**What `ci-policy` refuses in an unowned workflow** (each has a test in
`platform/ci/test_ci_policy_check.py`, most written as bypass attempts):

- a missing `permissions` block (the job would get the repository default),
  `write-all`, any `write`, any `id-token`, permissions from an expression;
- any expression naming `secrets` except `secrets.GITHUB_TOKEN` (harmless at
  read-only), including `toJSON(secrets)`, `secrets['X']`, `if:` conditions
  without braces, keys, case and whitespace tricks; `secrets: inherit` or a
  `secrets:` map to a reusable workflow; `environment:`;
- `pull_request_target`, `workflow_run`;
- calling a `priv-` reusable workflow, or a remote one not pinned and listed;
- any action not pinned to a full commit SHA that is on the allowlist in
  `.github/ci-policy.yaml` (a key is `owner/repo` or `owner/repo/path`),
  `docker://` images, `uses:` from an expression;
- runners other than GitHub-hosted labels on the allowlist or the exact
  `vars.CI_RUNNER` switch expressions (the variable is owner-set); runner
  groups; matrix runners that could resolve to `self-hosted`;
- `actions/checkout` without `persist-credentials: false` (stricter than
  "persisted credentials plus `git push`": the token in `.git/config` is
  readable by every later step and package script);
- a workflow `name:` copied from a `priv-` workflow (`workflow_run` matches
  names), or a job whose check-run name could equal a required check (a
  passing copy could satisfy the requirement; expressions in names count as
  "could be anything");
- YAML anchors, aliases, merge keys, explicit tags, duplicate keys: anywhere
  PyYAML and GitHub's parser could disagree about what a file says.

**What it checks in `priv-` workflows**, which the owner reviews anyway but
could miss: privileged jobs (and required-check jobs) restore no Actions
cache or pip cache (unprivileged workflows on `main` can write those; npm and
pnpm caches are allowed because the lockfile's integrity hashes are checked),
download no other run's artifacts, call no unowned reusable workflow;
`workflow_run` follows only `priv-` workflows; and every repo file such a job
runs (scripts named in `run:`, local actions, build directories, and their
relative imports, followed to a fixed point) is owned or explicitly accepted.
`python3 -I platform/ci/ci_policy_check.py --entrypoints` prints that list.

### Residual risks

Listed in `.github/ci-policy.yaml` under `privileged_code_accepted`, each with
its reason. These existed before this change (nothing in them was owned
then); the change makes them visible and stops new ones appearing silently.

1. **The catalogue site builder runs inside the Cloudflare and GitHub Pages
   deploy jobs**, because `platform/marketing/indexnow.mjs` imports
   `platform/pages/build.mjs` (and `distribute-desktop`/`-hub` import it
   too). A merged agent change there runs at module load with
   `CLOUDFLARE_API_TOKEN` (or the Pages write token) in reach on the next
   `main` run. Fix: move the handful of constants those scripts need into a
   small owned module, then drop these entries.
2. **Deploy jobs build product trees with the token in the job**:
   `ai-first-markets`, the real-estate and retail-pilot docs sites,
   `platform/edge`. `npm ci`/`pnpm install` lifecycle scripts and the build
   run agent-editable code. Fix: build in an unprivileged job, upload the
   artifact, deploy it from a privileged job that runs only owned code.
3. **Publishers run package builds**: `priv-distribute-npm.yml` calls
   `npm publish` without `--ignore-scripts`, and the PyPI publishers run
   `python3 -m build`, both on agent-editable package directories with the
   publish token in the environment. The publishers themselves are now owned.
4. **`priv-site-usage-pull.yml` and `priv-uitest-ci.yml`** run shared code
   (usage readers, the uitest tool) that is edited as product work. Both use
   environments limited to `main`; uitest's paid job is manual-dispatch only.
5. **Secrets still stored as repository secrets** (owner checklist, step 4)
   are readable by any workflow on any branch that names them, which
   `ci-policy` now refuses for unowned workflows but cannot stop on a branch
   that is never opened as a PR (`on: push` runs on the pushed branch's own
   workflow files). Moving every secret into a `main`-only environment is
   still what closes that.
6. **`GITHUB_TOKEN` at read-only** is still available to unowned workflows.
   On a public repo it reads nothing private, but it can write Actions cache
   entries; that is why privileged jobs may not restore them.
7. **`vars.CI_RUNNER`**: if the owner points it at a self-hosted runner,
   unprivileged and privileged jobs share that machine. Keep it unset or
   GitHub-hosted.
8. **The heuristics are heuristics.** The entrypoint scan finds file paths in
   `run:` text, local actions, working directories and relative imports. Code
   a script reaches another way (a spawned process, a path built at runtime,
   a data file that decides where a token is sent) is not found. Review of
   `priv-` changes still matters.
9. **Applying the ruleset is an owner step.** Until
   `.github/rulesets/main.json` is applied (checklist, step 2, now with
   `ci-policy` required), neither Code Owner review nor the new check blocks
   a merge; the post-merge audit only reports.

## What is still open

- Two cross-review bots approving each other's PRs still auto-merges anything
  outside the control plane. That is the intended model. Inside it, Code
  Owner review is what stops collusion.
- Agents still run repository code (tests, build scripts) as part of their
  work. Owning every file would end self-merging, so the line is drawn at code
  that runs *without* an agent choosing to run it.
