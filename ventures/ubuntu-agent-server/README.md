# ubuntu-agent-server

The Hetzner k3s + Argo path for the two Helsinki boxes was retired on
2026-10-01 and its trees (`infra/`, `bootstrap/`, `gitops/`) deleted on
2026-10-30. This Ansible playbook is the LAN / Tailscale single-box runner.

Ansible playbook to provision a fresh **Ubuntu Server** install into a 24/7
host that has coding agents — Claude Code, OpenAI Codex CLI, Antigravity CLI
(agy), opencode — working on your repos unattended: watching GitHub issues
(including ones they file themselves), running headless, and opening PRs for
review. (Grok Build is intentionally not automated — see below.)

This is the **agent box**. Public products do not go here — they go on
GitHub Pages or the separate Hetzner product box. See
[`portfolio/hosting/README.md`](../../portfolio/hosting/README.md).

**Read "How it runs" below before enabling this for real.** The playbook
installs everything disabled by default (a kill-switch var, and `dry_run:
true` on every repo) specifically so you have to make a deliberate choice
before an agent can push a branch or open a PR on your behalf.

## Before you run this

### 1. Install Ubuntu Server (not Desktop)

Desktop's default suspend-on-idle doesn't count SSH/network activity as
activity — that's what took the box offline for hours during initial setup.
Server doesn't have this problem by default, and doesn't run a GUI competing
with your agents for RAM/CPU.

During the Ubuntu Server installer:
- Tick **"Install OpenSSH server"** when offered.
- Import your SSH key (GitHub username, or paste the key directly) so you
  can get in immediately after install, over plain LAN — you need this
  because of the bootstrap problem below.
- Note the machine's **LAN IP** shown at the end of install.

### 2. The bootstrap order problem

This playbook installs Tailscale — which means on first run, the box isn't
on your tailnet yet. You can't reach it over Tailscale before this playbook
has run. So the **first** run has to target the box's LAN IP, not a
Tailscale address:

```ini
# inventory.ini
agent-server ansible_host=<LAN IP FROM INSTALLER> ansible_user=duncan
```

Once this first run completes (and Tailscale is authed — see next section),
you can switch `inventory.ini` to the box's Tailscale IP/MagicDNS name for
everything after.

### 3. Tailscale auth key (recommended) or manual auth

By default `tailscaled` gets installed and enabled but stays **unauthorized**
— `tailscale up` needs to run once per node, and normally that's an
interactive login. To make the very first `ansible-playbook` run fully
hands-off, generate a reusable pre-auth key at
https://login.tailscale.com/admin/settings/keys and pass it in — **never
commit it to `group_vars/all.yml`**:

```bash
ansible-playbook playbook.yml -e tailscale_authkey=tskey-auth-xxxxxxxx --ask-become-pass
```

If you'd rather not manage an authkey, leave it blank: the playbook installs
and enables `tailscaled` anyway, and you SSH in once (over LAN) afterward to
run `sudo tailscale up` yourself.

### 4. sudo password

I (Claude) cannot type your sudo password into anything, ever — that's a
hard rule, not a preference. Ansible needs privilege escalation for
basically everything this playbook does, so you run it yourself and type the
password when prompted:

```bash
ansible-playbook playbook.yml --ask-become-pass
```

If you'd rather not be prompted every run, set up passwordless sudo for
`duncan` yourself first (`echo 'duncan ALL=(ALL) NOPASSWD:ALL' | sudo tee
/etc/sudoers.d/duncan-nopasswd`) — worth doing anyway if this is going to run
unattended later.

## Running it

Review `group_vars/all.yml` first — hostname, timezone, which CLIs to
install, the unattended-upgrades reboot policy, and the agent-runner master
switches are all there. Review `config/repos.yml` too, obviously — that's
what actually gets worked on.

**First run** (box only reachable over LAN, Tailscale not up yet):

```bash
make bootstrap IP=192.168.1.42                          # no authkey — you'll `tailscale up` manually
make bootstrap IP=192.168.1.42 AUTHKEY=tskey-auth-xxxx   # authkey — fully hands-off
```

`bootstrap.sh` just points `inventory.ini` at the LAN IP and runs the
playbook; run it directly instead of via `make` if you want to see/tweak the
steps.

**Later runs**, once `inventory.ini`'s `ansible_host` has been switched to
the box's Tailscale IP/MagicDNS name:

```bash
make provision
```

Other targets: `make check` (syntax-check only), `make lint` (ansible-lint).

## Why systemd timers, not Kubernetes

Worth stating explicitly since it's a real fork in the road: this uses a
systemd timer polling every 10 minutes, not k8s CronJobs. At one box, a
cluster (etcd, RBAC, secrets management, persistent volumes) is pure
overhead with nothing to show for it. What k8s *would* buy you — per-run
container isolation instead of directory-level isolation — is available
more cheaply here: `use_docker_sandbox: true` runs each invocation in a
Docker container on the same single box (see below). If this ever grows
into a fleet of agent boxes, that's the same container image, pointed at a
different scheduler — this doesn't paint you into a corner, it's a
reasonable stepping stone.

## How it runs

Once provisioned, here's the actual system running on the box.

### The trigger: labeled GitHub issues — including ones agents file themselves

There's no dashboard or task queue to build — GitHub issues already are one.
For each repo you configure, a systemd timer (`agent-runner.timer`, every 10
minutes by default — `agent_runner_schedule` in `group_vars/all.yml`) runs
`/srv/agents/bin/agent_runner.py`, which:

1. Lists open issues in that repo labeled `agent` (configurable per repo).
2. Skips any issue already labeled `agent:in-progress`, `agent:pr-opened`,
   or `agent:failed` — so nothing gets worked twice, and a failed run
   doesn't get silently retried forever (you remove the `agent:failed`
   label yourself once you've looked at why it failed; the trigger label
   is never removed, so re-adding it does nothing).
3. **If a repo has `self_directed: true` and no labeled issues are
   waiting**, and enough time has passed since the last one
   (`self_directed_cooldown_hours`, default 24h), the runner files a new
   GitHub issue itself — visibly, with a broad "use your judgment, find
   something worth doing" prompt (full text in `agent_runner.py`'s
   `SELF_DIRECTED_PROMPT`) — then processes it exactly like a human-filed
   one. This is the "agents use their own judgment" behavior, implemented
   as: the agent proposes a task publicly on GitHub, then works it through
   the same reviewed pipeline as everything else. Not a hidden internal
   loop — you'll see the issue it filed and can close it if it picked
   something dumb.
4. Claims a new match by labeling it `agent:in-progress`.
5. Clones the repo fresh into `/srv/agents/workspaces/<repo>-<issue>-<ts>/`
   — every run gets an ephemeral, isolated checkout, never a shared
   persistent one — and checks out a new branch `agent/<tool>/issue-<n>`.
6. Sets the commit author to a per-tool identity (`Claude Code Agent
   <agent-claude@agents.local>`, etc. — see `GIT_IDENTITY` in
   `agent_runner.py`) so `git log --author` honestly shows what did the
   work, not whoever happened to run Ansible.
7. Picks a model tier — see "Model-tier routing" below — and runs the
   configured tool (`claude`, `codex`, `antigravity`, or `opencode`)
   **headless**, in that workspace, with a prompt built from the issue's
   title and body plus a fixed instruction that it's working unattended and
   should prefer leaving the repo alone over guessing.
8. If the tool made changes: scans the diff for secrets (see below), then
   commits, pushes the branch, opens a PR against the repo's base branch via
   `gh pr create`, comments the PR link on the issue, labels it
   `agent:pr-opened`.
9. If the tool made no changes, errored, or the secret scan flagged
   something: labels the issue `agent:failed` and comments why, so you find
   out from GitHub, not by SSHing in to read logs.
10. Always deletes the ephemeral workspace afterward and writes a full
    transcript to `/srv/agents/logs/`.

**It never pushes to the base branch and never merges anything.** The only
GitHub write actions it takes are: labeling/commenting on the triggering
issue, filing a self-directed issue, pushing a new branch, and opening a PR.
Merging is on you — including for self-directed work. "Using its judgment
toward growth" in this system means *proposing* PRs a human evaluates, not
autonomously merging or deploying anything; I did not build (and would want
a very explicit separate conversation before building) unattended merge
authority.

**Multiple tools "collaborating" on one repo**: list the same `repo` twice
in `config/repos.yml` with different `tool` values. Both poll the same
labeled issues; whichever claims an issue first (the `agent:in-progress`
label) does the work, so they naturally divide labor without colliding —
no extra coordination logic needed.

### Guardrails, in order of how hard they are to bypass by accident

1. **The kill switch**: `/srv/agents/DISABLED` on the box, but the actual
   source of truth is `agent_runner_start_disabled` in `group_vars/all.yml`
   — enforced idempotently on every `ansible-playbook` run, not just first
   install. If this file exists, the runner exits immediately and touches
   nothing — not even a `gh` API call.
   ```bash
   # durable (survives the next playbook run) — edit group_vars/all.yml:
   agent_runner_start_disabled: false   # then `make provision`
   # quick manual override for right now (gets reset to whatever the var
   # says next time the playbook runs):
   ssh duncan@<host> 'rm /srv/agents/DISABLED'     # resume
   ssh duncan@<host> 'touch /srv/agents/DISABLED'  # pause
   ```
2. **`dry_run: true`** (per repo, in `config/repos.yml`): the runner does
   everything up through running the tool, computing the diff, and
   scanning it for secrets, then logs what it *would* commit/push/PR and
   comments that on the issue — without touching git or GitHub beyond that
   comment. Flip to `false` per repo once you've watched it behave
   correctly a few times.

   **One thing `dry_run` does not gate: filing the self-directed issue.**
   On a repo with `self_directed: true`, step 3 above runs *before* any of
   this — `maybe_self_direct()` is called from the poll loop and
   `create_self_directed_issue()` shells out to `gh issue create`, neither
   of which reads `dry_run`. So a dry-run self-directed repo will still
   open one real GitHub issue per cooldown window (24h by default). That
   is deliberate rather than an oversight: gating it too would leave a
   dry-run self-directed repo doing nothing observable at all, and the
   point of `dry_run` is to give you runs to watch. But it means "touches
   nothing on GitHub beyond a comment" is true of the *work*, not of the
   whole loop — worth knowing before you flip the kill switch, because
   `Duncan-Haywood/monorepo-projects` is configured this way today.
3. **Repo allowlist**: the runner only ever looks at repos explicitly listed
   in `config/repos.yml` — never "every repo this token can see." This file
   is real, version-controlled config now (see "Everything as code" below)
   — not something you SSH in and hand-edit.
4. **Secret scanning**: if `gitleaks` is installed (it is, by default — see
   below), every diff gets scanned before push. A match blocks the push
   entirely and fails the run rather than trusting the model not to have
   leaked something into a commit.
5. **Per-tool sandboxing**, not just permission flags — see the table below.
   This is the layer that matters if the model itself does something you
   didn't want, as opposed to the layers above which are about you
   controlling the blast radius of the system as a whole.
6. **Content boundaries in every prompt**: the self-directed prompt tells the
   agent not to take or move money, make legal/compliance claims, publish
   under the owner's public name, touch secrets, collect personal data, or
   fabricate marketing claims — the boundaries that protect *someone other
   than us*, which is why they don't relax.

   Two carve-outs that used to be on that list are deliberately gone:
   **deployment/infra configuration and marketing material are now in
   scope**, because the owner directed that deployment, CI/CD, and
   marketing are priority work rather than off-limits. If you are running
   this host for a different owner who has not said that, put those two
   back in `SELF_DIRECTED_PROMPT`.

   This is a prompt-level instruction, not an enforced technical boundary —
   the sandboxing above is what's actually enforceable; treat this as
   defense in depth, not the real guardrail.

   The self-directed prompt also tells the agent to read the target repo's
   own `CLAUDE.md`/`AGENTS.md`/`DIRECTION.md` first and let those win where
   they're more specific. It is the fallback brief for repos that don't
   carry one, not a competing policy.

### Everything as code

`config/repos.yml` lives in this repo and is deployed by Ansible on every
run (overwriting `/srv/agents/config/repos.yml` — that's the point: the
box's config always matches git). Adding a repo means editing this file,
committing, and re-running the playbook — not SSHing in. That friction is
deliberate for a system with real write access to your code.

This also means **this repo can watch itself**: add
`your-username/ubuntu-agent-server` as an entry with `self_directed: true`
and agents can propose improvements to their own orchestration system —
through the exact same PR-reviewed pipeline as any other repo, no special
unreviewed self-modification path. That's the whole "self-improvement"
story here: not an autonomous agent rewriting its own guardrails
unsupervised (that would be the actually dangerous version of this idea),
but the orchestration system being just another repo it's allowed to
suggest changes to, reviewed like anything else. Turn this on only after
you trust the system on other repos first.

### Model-tier routing

The idea: don't spend your subscription's expensive-model budget on a typo
fix. `agent_runner.py` picks a "low" or "high" tier per issue —
`model_tier` in `config/repos.yml` forces it; otherwise a simple heuristic
decides (self-directed and `agent:deep`-labeled issues get "high," long
issue bodies get "high," everything else gets "low" — see
`choose_model_tier()`). The chosen tier gets logged on every run, so if you
want to refine the heuristic later, the data to justify a change is already
sitting in `/srv/agents/logs/`.

**Claude Code routes by default; Codex is opt-in.** `claude` uses the stable
tier *aliases* `haiku` (low) / `sonnet` (high), which resolve to whatever
those tiers currently are and so don't go stale.

Codex has no such aliases — `--model` wants a concrete ID. The IDs that used
to be hardcoded here (`gpt-5-mini`/`gpt-5`) were written down as an admitted
guess and never checked against a live account, and a wrong ID fails the run
outright on *every* poll cycle. So codex now sends no `--model` at all by
default, which means `codex exec` uses the model your signed-in ChatGPT plan
serves — correct by construction, and the path that spends the plan's
**included quota** rather than metered API credit.

To opt back in, confirm the IDs on the box first:

```bash
codex exec --model <id> "hi"     # must not error before you trust it
```

then set **both** in `group_vars/all.yml` (one alone would route a single
tier and silently leave the other unrouted, so half a pair is ignored):

```yaml
codex_model_low: "<verified-id>"
codex_model_high: "<verified-id>"
```

Antigravity and opencode don't get tier routing (their model-selection flags
aren't solidly documented enough to script against yet).

#### Included quota vs. metered API billing

Codex authenticates two ways, and they spend two different budgets:

| How | What it spends |
|---|---|
| `codex login` (ChatGPT plan sign-in) | That plan's **included quota** — what this host is set up for |
| `OPENAI_API_KEY` in the environment | The **metered API**, billed per token |

Nothing in a run's output tells you which one served it, so a stray key on
the box means the first sign is an invoice. `runners/codex.sh` therefore
`unset`s `OPENAI_API_KEY` from the child environment unless you deliberately
opt in with `codex_use_api_key: true`. It also preflights `codex login
status` and fails with a pointer to `codex login` rather than letting an
unauthenticated run fail once per poll cycle with an error that reads like a
model problem. `make provision` reports the login state too.

### Per-tool headless invocation and sandboxing

Each tool's non-interactive/permission model is genuinely different — this
isn't one flag reused four times. Scripts are in
`/srv/agents/bin/runners/`:

| Tool | Invocation | Autonomy mechanism |
|---|---|---|
| `claude` | `claude -p "<prompt>" --permission-mode auto` | Classifier-guarded `auto` mode: a separate model reviews each action, allows normal dev work (edits, tests, commits, pushing to any branch of *this* repo), blocks a documented list (force push, secret exfiltration, destructive deletes, deploys, merging its own PR, IAM/DNS changes, etc). Deliberately **not** `--dangerously-skip-permissions` — Anthropic's own docs say that mode is for "isolated environments like containers, VMs... where Claude Code cannot damage your host system." (With `use_docker_sandbox: true` this setup *does* become one of those isolated environments — worth reconsidering then.) |
| `codex` | `codex exec --sandbox workspace-write -c approval_policy="never" --json` | Real filesystem sandbox: writes are restricted to the working directory (the ephemeral clone) regardless of what the model tries. `codex exec` is non-interactive by construction — it never waits for a human, and a blocked operation fails and is reported back to the model. There is deliberately **no** `--ask-for-approval`: that flag was removed from `codex exec` upstream, and passing it makes the CLI exit 2 on argument parsing before generating a token (verified against codex-cli 0.151.0). `-c approval_policy="never"` is the supported spelling of the same intent, matching `gitops/agents/workers/worker.sh`. |
| `antigravity` (`agy`) | `agy -p "<prompt>" --sandbox` | `--sandbox` enables real OS-level isolation (nsjail on Linux). Deliberately **not** `--dangerously-skip-permissions` — there's a documented upstream issue where combining it with `--sandbox` silently defeats the sandbox entirely (the bypass flag also auto-approves the "allowed to escape sandbox?" prompt). Needs a one-time manual step: run `agy` interactively once and set the autonomy level to `always-proceed` via `/permissions`, or unattended runs will block waiting for approval. **Lower confidence than the other three** — see below. |
| `opencode` | `opencode run --auto "<prompt>"` | `--auto`: "Auto-approve permissions that are not explicitly denied," per opencode's own CLI docs. |

### Things to verify before trusting a tool, not assume

- **Antigravity CLI (agy) is the least-documented integration here.** It
  replaced Gemini CLI after Google sunset that for free-tier/Google One
  users. Its own docs site doesn't fully document headless-mode CLI flags
  at the time of writing (only interactive settings.json config for
  permissions/sandbox) — the invocation above is best-effort, cross-checked
  against what confirmed docs *do* say, not verified end-to-end. It also
  uses OS keyring (Secret Service/dbus) for credentials, which headless
  servers don't run by default — `gnome-keyring` + `dbus-user-session` are
  installed to mitigate this, but it's unverified whether that's
  sufficient. Run `agy --help` and a manual `agy "hello"` on the actual box
  before trusting this with `dry_run: false`.
- **opencode's headless mode has open reliability issues upstream** — as of
  writing there are unresolved GitHub issues about `opencode run` in
  non-interactive contexts (session-not-found errors, permission presets
  that aren't overridable in some versions). `--auto` is the documented
  correct flag, and the script uses it, but if runs fail consistently for
  this tool specifically, that's a known rough edge to check upstream
  before assuming the config here is wrong.

Claude Code and Codex CLI's headless modes are the two on solid, current,
primary-source footing.

### Optional: Docker sandboxing (`use_docker_sandbox: true`)

Runs every tool invocation inside a container (`docker/agent-runner/`)
instead of directly on the host — real isolation uniformly across all four
tools, including the two above whose own sandbox story is weaker. **This is
the least-tested part of the whole system** — the image has never actually
been built or run, only reviewed by hand. Off by default; the direct-exec
path is the one worth trusting first. Known rough edge if you turn it on:
Antigravity's keyring-based credential storage may not survive being
mounted into a container at all (a flat-file credential mount, which is
what's implemented, assumes the credentials aren't keyring-only) — if only
that tool fails in Docker mode, that's the first thing to suspect.

### One-time manual setup on the box (can't be automated — see rules below)

1. **Authenticate `gh`** (needed for the runner to read issues and open
   PRs): `gh auth login`, then `gh auth setup-git` so plain `git
   clone`/`push` also use it. A fine-grained PAT scoped to just the repos
   you're automating (Contents: write, Pull requests: write, Issues: write
   — nothing broader) is a better fit here than a full-access token, since
   whatever `gh` can do, an agent running unattended can eventually do.
2. **Authenticate each CLI you're using** — see the subscription-login note
   below; unrelated to `gh`. For Codex that is `codex login` (the ChatGPT
   plan sign-in, which is what draws on the included quota), confirmed with
   `codex login status`; do **not** leave an `OPENAI_API_KEY` set on the box
   unless you actually want metered API billing. For Antigravity
   specifically, also set permissions to `always-proceed` via `/permissions`
   inside an interactive `agy` session (see the table above).
3. **Configure real repos**: edit `config/repos.yml` in this repo, commit,
   `make provision`, then flip `agent_runner_start_disabled: false` in
   `group_vars/all.yml` and provision again when ready.
4. **Watch the logs on a real run** before trusting it: `journalctl -u
   agent-runner.service -f`, or read `/srv/agents/logs/` directly.

## What this does NOT do (by design)

- **Doesn't authenticate any of the CLIs.** Claude Code, Codex CLI, and
  Antigravity CLI all use subscription-based OAuth logins (Claude Pro/Max,
  ChatGPT Plus/Pro, Google account) — not API keys — and that login has to
  be done by you, once per tool, interactively (each CLI will prompt on
  first run; use the box's own desktop-less browser flow or a device-code
  flow over SSH). After that first login each tool caches a session and
  later unattended runs won't need to re-auth.
- **Doesn't install Grok Build.** xAI doesn't publish a public,
  unauthenticated install script — you have to sign in at
  https://grok.com/build with a SuperGrok/X Premium+ account to get the
  exact platform command, so there's nothing safe for this playbook to
  fetch on your behalf. Do that step by hand once the box is up, and there's
  no `agent_runner` support for it either until it has a headless mode to
  point a runner script at.
- **Doesn't give agents merge or deploy authority.** Self-directed and
  judgment-driven work still only ever produces a PR. If you want auto-merge
  for some repos eventually, that's a deliberate, separate, much bigger
  decision — not something to back into via this system's defaults.
- **Doesn't notify you anywhere but GitHub.** Results land as issue
  comments/labels and PRs — no Slack/email/webhook integration. Worth
  adding once you know you want it; not guessed at here.

## Files

```
playbook.yml                  entry point
group_vars/all.yml              all the settings you'd actually want to tweak
config/repos.yml                 the real, live agent-runner config — edit this, not a file on the box
inventory.ini                     target host (fill in ansible_host)
Makefile                          make bootstrap / make provision / make check / make lint
bootstrap.sh                       first-run helper (points inventory at LAN IP, runs playbook)
docker/agent-runner/Dockerfile      image for use_docker_sandbox: true — UNTESTED, see "Optional: Docker sandboxing"
roles/base/                       hostname, packages, sleep/suspend disabled, ufw, unattended-upgrades
roles/tailscale/                   installs + optionally auths tailscale
roles/nodejs/                      Node.js 22.x via NodeSource, user-writable npm prefix
roles/agent_clis/                  installs Claude Code / Codex CLI / Antigravity CLI / opencode (idempotent)
roles/docker/                      installs Docker Engine + builds the sandboxing image, only when use_docker_sandbox
roles/agent_runner/                 the actual "agents work unattended" system — gh CLI, gitleaks, /srv/agents/*, systemd timer
  files/agent_runner.py               orchestrator: polls issues, self-directs, clones, runs the tool, scans, opens PRs
  files/runners/*.sh                   per-tool headless invocation (one script per CLI)
  templates/agent-runner.{service,timer}.j2  systemd units
tests/                              unit tests for agent_runner.py's pure logic — `make test`
.github/workflows/ci.yml             runs syntax-check/lint/shellcheck/pyflakes/pytest on every push
```

## Development notes

- CI (`.github/workflows/ci.yml`) runs on every push/PR: ansible
  syntax-check + ansible-lint, shellcheck on the runner scripts, pyflakes +
  pytest on `agent_runner.py`, and a sanity check that `config/repos.yml`
  parses and every entry has a `repo`/valid `tool`. This also covers PRs
  the agent runner opens against its own repo, once self-directed mode is
  enabled for it — the same review gate applies to changes to its own
  orchestration code as to anything else.
- `tests/` has 28 unit tests for `agent_runner.py`'s pure logic
  (`make test`, or `pytest tests/`) — model-tier selection, self-directed
  cooldown tracking, docker command construction, prompt building, issue
  filtering. Two real bugs were caught this way, not by inspection alone:
  `create_self_directed_issue()` originally hardcoded `"labels": []` on the
  dict it returned, so a self-directed issue processed in the same poll
  cycle it was filed in never actually got the "high" model tier the
  design intended — the regression test for this
  (`test_self_directed_issue_flows_to_high_tier`) exercises both functions
  together specifically so this can't quietly come back. Separately, the
  secret scan originally ran `gitleaks detect` against the whole checked-
  out tree rather than just the diff, which would have false-positive-
  blocked on any pre-existing secret-shaped string anywhere in a repo's
  history — fixed to `gitleaks protect --staged`, scanning only what the
  agent actually changed.
- Syntax-checked with `ansible-playbook --syntax-check` and passed through
  `ansible-lint` (clean except idiom-profile style nits — var-naming
  prefixes, mostly — that weren't worth the churn). Not yet run against a
  real host, since the target box is still being reinstalled as Server.
- Repo config for Tailscale, NodeSource, GitHub CLI, and Docker all use
  `ansible.builtin.deb822_repository` (not the older `apt_repository`, which
  is deprecated as of ansible-core 2.21 and slated for removal in 2.25).
- `agent_runner.py` is stdlib + PyYAML only (no venv, no other deps) —
  compiles clean (`py_compile`) and passes `pyflakes` with zero findings.
  All `roles/agent_runner/files/runners/*.sh` scripts pass `shellcheck`
  clean.
- The exact headless/permission flags for Claude Code, Codex CLI, and
  opencode were checked against each vendor's own current docs, not just
  blog posts summarizing them. Antigravity CLI's were not fully
  confirmable that way — its docs site doesn't document headless flags in
  the sections available — so that integration is explicitly marked
  lower-confidence throughout rather than presented with false certainty.
- `gitleaks` is installed via GitHub's release API resolving "latest" at
  playbook-run time rather than a pinned version, because the project
  itself is winding down (maintainer departed, a spiritual successor
  called Betterleaks has emerged) and no specific version could be
  confidently verified as current. Worth revisiting which secret scanner
  this should be in a few months.
- The Docker sandboxing path (`use_docker_sandbox`) has a real fix baked in
  for a bug that would otherwise bite: containers run as root, so files
  written into the bind-mounted workspace would be root-owned on the host,
  breaking the git operations that run afterward as `agent_user` — a
  throwaway `docker run ... chown` fixes ownership back after each
  container run.
- **None of `agent_runner.py`, the runner scripts, or the Docker image have
  executed against a real repo yet** — no box to run them on. Logic has
  been traced by hand, not exercised. Treat `dry_run: true` as
  load-bearing, not a formality, until you've watched a handful of real
  runs.
