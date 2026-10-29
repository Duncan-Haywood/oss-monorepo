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
fail here for their own reasons. `Claude routine trigger` was the standing
example — it got a real runner, reached the API, and came back
`HTTP 401 … "OAuth access token has been revoked"` (run 33547527610). Its
`CLAUDETRIGGERAPIKEY` secret *is* set; the token behind it is revoked. That
is the `routine-trigger-cadence` decision, not a runner problem. Read a red
check on its merits; `ci_starvation.py` is what separates the two causes.

That example stopped being live on 2026-09-02, and how it stopped is the part
worth carrying here: its `fire` job is now gated on the repository variable
`ROUTINE_TRIGGER_ENABLED`, so a scheduled run is **skipped before a runner is
assigned** instead of occupying one to fail. 403 of its 472 runs had failed by
then, ~72 billed minutes a day, against the same metered
allowance whose exhaustion caused the window above. A job skipped by a false
`if:` costs nothing, which makes an owner-set variable the cheap way to hold a
credential-blocked schedule — cheaper than the self-hosted runners below, and
available today. The decision itself is untouched and still the owner's.

**Starvation recurred on 2026-09-04, and the paragraph that stood here said
it was not currently blocking.** That sentence was written on 2026-09-02 and
was true then; it is what a session reads before deciding how urgent this
stack is, so the correction matters more than the history. The cliff is
pinned to a nine-minute window: run 33925827289 (`Portfolio validate`,
22:30:52Z) took real runner 1000054728 and passed in 196s, and by 22:39:33Z
runs 33926434774 and 33926436491 both came back `runner_id: 0` with no steps.
Re-dispatched once more to rule out a momentary queue; it starved a third
time. `portfolio/ledger/infra_state.yaml` carries this as a dated reading.

The prediction the old paragraph made was right, and worth keeping: the
ceiling **cycles**. The 2026-08-26 window lifted unattended at 00:00:53Z on
the first of the month, which is what a metered allowance resetting looks
like, so the reasonable expectation is that this one lifts on 2026-10-01
unless the owner raises the ceiling sooner.

**What is new, and is the reason this is not simply "insurance" any more:
this stack cannot be the answer to the outage it was built for.** The runner
pods run *in the k3s cluster*, Argo syncs them from `main`, and the cluster
is dead — `:6443` refused on both boxes (`Outage triage` run 33889983086).
So the fallback for metered CI is downstream of the very cluster whose
repair needs CI. Turning `CI_RUNNER` on today would schedule pods onto an
API server that is not listening.

That makes the ordering concrete rather than a preference: **the SSH key
rotation comes first**, because it is the only step in this chain that
depends on neither a runner nor the cluster (port 22 answers on both boxes).
Cluster back, then this stack, then the seals. `infra/OWNER_CHECKLIST.md`
still lists `portfolio-site-repo` and `codex-secrets` ahead of it; both are
sealed *into* the cluster and so are downstream of the same repair.

**Added 2026-09-05: [`host/`](host/README.md) is the same fix `gitops/agents/host/`
already applied to the Codex worker, applied here.** A systemd service on the
agent box's own OS, no k3s underneath it — restoring actual CI capacity
without waiting on the cluster (or Argo, or an image pull) at all. It is not
a replacement for the stack below; it is what the box can run the moment the
SSH key is rotated, before or independent of `restore-cluster.sh` bringing
k3s back up.

## The switch

174 of the 177 `runs-on` lines across 132 workflows now read this. The other
three are the Docker-dependent jobs `gitops/tests/test_ci_runner.py`'s
`DOCKER_DEPENDENT_JOBS` names and pins to `ubuntu-latest` instead (they need a
Docker daemon the self-hosted pod does not have), and the desktop build in
`distribute-desktop.yml` (`OS_MATRIX_JOBS`), which needs macOS and Windows
runners:

```yaml
runs-on: ${{ github.event.pull_request.head.repo.fork && 'ubuntu-latest' || vars.CI_RUNNER || 'ubuntu-latest' }}
```

Unset, `vars.CI_RUNNER` is the empty string, which is falsy, so the expression
falls back to `ubuntu-latest`. A pull request from a fork always gets
`ubuntu-latest`, whatever the variable says: the repository is public, and a
self-hosted runner must never execute a stranger's code. **Merging this changes nothing** until the repo
variable is set. Setting it to `self-hosted` moves every workflow onto this
stack at once; clearing it moves them all back when metered minutes reset. That
is the point of routing through one variable rather than editing every
workflow file twice.

`gitops/tests/test_ci_runner.py` fails if a workflow hard-codes a runner again.

**Adding a workflow job makes the sentence above stale, and that is a command,
not an edit:**

```
python3 gitops/ci/sync_readme_counts.py          # rewrite it to match the tree
python3 gitops/ci/sync_readme_counts.py --check  # or just report drift, exit 1
```

Commit the result alongside the workflow change.
`test_readme_runs_on_count_matches_reality` has fired four times now (#2713,
#2740, #3516, #3517) and every time a session hand-retyped three integers —
twice spending a whole PR on it, #3516 and #3517 hours apart on 2026-09-06,
because a workflow landed while the first was still open. The guard was right
each time; what was missing was that the number is derivable, so the fix should
not be arithmetic done by hand. The script counts the `runs-on` values that
literally are the switch expression, while the test subtracts
`DOCKER_DEPENDENT_JOBS`; the two derivations stay independent on purpose, and a
third test asserts they agree, so an allowlist that drifts from the workflows
fails instead of moving both numbers together.

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

Each pod registers one **ephemeral** runner, takes exactly one job, and exits.
Nothing persists between jobs — no checkout, no `node_modules`, no environment.
A long-lived runner would carry one job's leftovers into the next, which is the
usual way self-hosted CI starts producing results that do not reproduce.

This section used to say the Deployment starts a replacement pod, and that is
not what happens. A Deployment's pods may only set `restartPolicy: Always`, so
when the runner exits the kubelet restarts the container **inside the same
pod**; the Deployment sees nothing to replace, because the pod never left
`Running`. That restart rebuilds the container filesystem from the image but
does not clear an emptyDir — surviving container restarts is precisely the
guarantee emptyDir is documented to give — so `/home/runner/_work` came back
carrying the previous job's checkout, `_temp` and `_tool` cache. Only the first
job on a genuinely new pod ever saw a clean tree.

**Fixed 2026-09-01.** `runner-entrypoint.sh` empties the work volume before it
registers, and fails closed (no registration, no job) if it cannot. That is
where the ephemerality above is actually enforced;
`gitops/tests/test_runner_entrypoint.py` seeds a work tree and proves both that
it is gone and that it was already gone when `config.sh` ran.

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

Nearly all workflows are `actions/checkout` plus `actions/setup-node`/`setup-python`,
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
