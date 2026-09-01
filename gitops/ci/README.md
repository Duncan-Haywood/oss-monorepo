# Self-hosted Actions runners

## Why this exists

This repository is private and owned by a user account, so GitHub-hosted
Actions minutes are metered. From **2026-08-26 to 2026-09-01** every workflow
run came back red, including ones that touch nothing (`Conflict markers`,
`Branch cleanup`). They were not failing — they were never starting:

```
started_at  2026-08-29T21:20:55Z
completed_at 2026-08-29T21:20:58Z
runner_id   0
runner_name ""
steps       []
```

`runner_id: 0` with no steps means no runner was ever assigned. A real
`Portfolio validate` installs Python and Node and runs 36 steps; it cannot
finish in three seconds. The 3-6 second duration is a proxy for this and can
mislead — a real job *can* fail fast — but an unassigned runner cannot be
anything else. `CLAUDE.md` documents the same signature.

Self-hosted runners are not metered. They restore CI whether the ceiling that
was hit was the included-minutes allowance or a spending limit, and they run on
hardware the portfolio already pays for.

**That window closed on its own (2026-09-01).** Runner *assignment* resumed
from 2026-09-01T00:00:53Z, and the PRs that have run since went green on
merit (#2601, #2603, #2605 — real runner ids, real steps). That is what the
evidence establishes, and it is narrower than "all CI is green": runs still
fail here for their own reasons. `Claude routine trigger` is the standing
example — it gets a real runner, reaches the API, and comes back
`HTTP 401 … "OAuth access token has been revoked"` (run 33547527610). Its
`CLAUDETRIGGERAPIKEY` secret *is* set; the token behind it is revoked. That
is the `routine-trigger-cadence` decision, not a runner problem. Read a red
check on its merits; `ci_starvation.py` is what separates the two causes.

Nothing here is currently blocking, so this stack is insurance, not a
repair. It is
still worth deploying: the recovery arrived at midnight on the first of the
month, which is what a metered allowance resetting looks like, so the ceiling
appears to cycle rather than to be gone. Deploy it *after* the two seals that
do block (`portfolio-site-repo` and `codex-secrets`), per
`infra/OWNER_CHECKLIST.md`.

## The switch

All 246 `runs-on` lines across 220 workflows now read:

```yaml
runs-on: ${{ vars.CI_RUNNER || 'ubuntu-latest' }}
```

Unset, `vars.CI_RUNNER` is the empty string, which is falsy, so the expression
falls back to `ubuntu-latest`. **Merging this changes nothing** until the repo
variable is set. Setting it to `self-hosted` moves every workflow onto this
stack at once; clearing it moves them all back when metered minutes reset. That
is the point of routing through one variable rather than editing 217 files
twice.

`gitops/tests/test_ci_runner.py` fails if a workflow hard-codes a runner again.

## Turning it on

Two steps, both yours — an agent can build this stack but cannot hold a token
or change repository settings.

1. **Seal the PAT.** Copy
   `secrets/actions-runner-token.template.yaml`, replace `CHANGE_ME`, seal it
   with `kubeseal --controller-namespace sealed-secrets --controller-name
   sealed-secrets` (the `--controller-name` flag is required — kubeseal's
   default `sealed-secrets-controller` does not match this cluster's actual
   controller Service name; see the comment in
   `gitops/prod/secrets/portfolio-repo-token.template.yaml` for why), and
   commit the sealed output. Prefer a fine-grained PAT scoped to this
   repository alone with **Administration: Read and write** — that is the
   narrowest permission that can mint a runner registration token. A classic
   PAT needs full `repo` scope, which is broader than necessary.

2. **Set the repo variable.** Settings → Secrets and variables → Actions →
   Variables → New repository variable, `CI_RUNNER` = `self-hosted`.

Argo syncs `gitops/ci` automatically. Until the sealed Secret exists the runner
pods stay in `CreateContainerConfigError` — expected, and the reason the
Application shows Degraded before step 1.

## How a job runs

Each pod registers one **ephemeral** runner, takes exactly one job, and exits;
the Deployment starts a replacement. Nothing persists between jobs — no
checkout, no `node_modules`, no environment. A long-lived runner would carry
one job's leftovers into the next, which is the usual way self-hosted CI starts
producing results that do not reproduce.

Two replicas: a PR here typically triggers `Portfolio validate`, `Page
integrity`, `Conflict markers` and the touched venture's own CI. One runner
would serialise them.

An ephemeral runner deregisters itself after its one job. The entrypoint's
`cleanup` trap covers the other exit — the pod evicted, drained or rolled
before a job ever arrives — because a runner left registered stays listed
(offline) on the repository and GitHub keeps dispatching jobs to it, which then
hang until someone prunes it by hand.

**That trap did not work until 2026-08-30.** The entrypoint ended in
`exec ./run.sh`, and `exec` replaces the shell, traps included — so the cleanup
never ran on any exit path. `run.sh` is now a child process with SIGTERM
forwarded to it, and `gitops/tests/test_runner_entrypoint.py` runs the
entrypoint for real against a stubbed API to prove the deregistration happens,
including in the eviction case. Those tests fail against the `exec` version.

## What it can and cannot reach

CI runs whatever a workflow file says to run, on the same node as
`marisstella.dev`. On a private repo that is only ever a collaborator's code,
but the blast radius is bounded anyway:

- `priorityClassName: ci-low`, below `agents-low` and `prod-high`. A CI burst
  is never why the public site loses a pod.
- `automountServiceAccountToken: false` — no Kubernetes API credentials.
- A NetworkPolicy allowing egress to the internet (needed: `api.github.com` to
  register, and every workflow runs `actions/setup-node` or `setup-python`)
  with the pod CIDR, service CIDR, RFC1918 ranges and link-local
  `169.254.0.0/16` cloud metadata excluded. DNS to CoreDNS is allowed back
  explicitly on port 53.
- No ingress at all.
- A namespace `ResourceQuota` two runners at full limits cannot exceed.

## No workflow needs anything from the base image

Nearly all 220 are `actions/checkout` plus `actions/setup-node`/`setup-python`,
which download their own toolchains, so nothing here depends on what the base
image ships beyond `curl`, `jq`, `unzip` and `git` — confirmed against
`actions/runner`'s own `images/Dockerfile`, which installs exactly that list
and no interpreter.

`hetzner-gitops-ci.yml` used to be an exception — it installed `kustomize` and
`kubeconform` with `sudo mv ... /usr/local/bin/` and `shellcheck` with `sudo
apt-get`, and the official runner image ships neither `sudo` nor a package
index. It now unpacks the two binaries into `$RUNNER_TEMP/bin` and takes
`shellcheck` from the `shellcheck-py` wheel, which bundles the real binary.
Both work unchanged on GitHub-hosted runners, so this is not a
self-hosted-only code path that only gets exercised after the switch is
flipped.

`garmin-world-traveler-watchface-ci.yml` was a second, undetected one: it ran
bare `python3` with no `setup-python` step. GitHub-hosted `ubuntu-latest`
ships Python by default, which is exactly why this went unnoticed — the job
had never once run anywhere that lacked it. Fixed the same way as every other
Python-only job here (`actions/setup-python@v5`) rather than assuming the base
image any further.

Three named workflows are not covered by the claim above, deliberately:
`world-clock-widget-ci.yml` and `quick-pick-survey-ci.yml` are the
`DOCKER_DEPENDENT_JOBS` exceptions pinned to `ubuntu-latest` in
`gitops/tests/test_ci_runner.py`, so they never reach this runner regardless
of what it ships; `claude-routine-trigger.yml` checks out nothing at all — it
only calls `curl` against `api.anthropic.com` — so it needs no toolchain to
begin with.

## Known limitations

- `pull_request_target` workflows run with repository write access. On a
  private repo the risk is bounded because only collaborators can open PRs, but
  if this repository is ever made public, move those workflows back to
  GitHub-hosted runners before flipping `CI_RUNNER`.
- The PAT expires. When it does, runner pods `CrashLoopBackOff` with
  `Could not read a registration token` and CI goes quiet — the same symptom as
  the outage this stack exists to end. Worth a calendar reminder.
- The runner image pins `2.328.0`. GitHub deprecates old runner versions; bump
  the tag in `runner.yaml` when registration starts warning.
