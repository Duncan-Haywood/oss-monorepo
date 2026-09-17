# Codex governor, host mode

The Codex worker, scheduled by a **systemd timer on the Hetzner box** instead
of by a Kubernetes CronJob. Same scheduler, same worker, same queue, same
budget policy — different place to stand.

## Why this exists

On 2026-09-05 this repository had three ways to execute code and all three
were down, two of them for reasons that turned out to be the same reason:

| route | state | why |
|---|---|---|
| k3s CronJob (`agents/governor/cronjob.yaml`) | down | `:6443` refused on both boxes — [`Outage triage`](../../../.github/workflows/outage-triage.yml) run 33889983086 |
| GitHub Actions | down | metered minutes exhausted; every job returns `runner_id: 0` — `ci_starvation.py --run 33935905418` |
| self-hosted runners ([`gitops/ci/`](../../ci/README.md)) | down | they run **as pods in the cluster**, so they are downstream of the outage they insure against |

The third row is the lesson. The insurance against metered CI was built inside
the thing most likely to fail with it, so when the cluster went the fallback
went too — and the repository spent a week with no way to run anything.

The boxes themselves were up the whole time: `:22` answers on both, per the
same triage run. Host mode installs onto that. It needs no k3s, no Argo, no
runner and no GitHub Actions minutes, and the Codex worker spends the owner's
ChatGPT subscription quota rather than the Actions allowance that is
exhausted — so it is capacity that does not compete with the thing that broke.

It is deliberately *not* the primary scheduler. When the cluster is healthy the
CronJob is better: it has real isolation, resource limits enforced by the
kubelet, and a control plane that reaps wedged pods. Host mode is the route
that survives when that is unavailable.

## It is not a fork of the governor

Every scheduling decision comes from [`../governor/governor.py`](../governor/governor.py) —
`tick`, `decide`, `pick_item`, `rollover`, `absorb_finished_jobs`, the budget
arithmetic, and the limit/no-op/auth precedence in `classify_outcome`. All of
it is **imported**, none of it restated. `host_governor.py` is only the I/O
half the CronJob does through the kube-apiserver:

| | CronJob | host mode |
|---|---|---|
| schedule | `schedule: "*/5 * * * *"` | `codex-governor.timer`, `OnUnitActiveSec=5min` |
| concurrency | `maxConcurrent` via running Jobs | one synchronous run under an `flock`; systemd will not start a second oneshot |
| worker | a `batch/v1` Job | a `bash worker.sh` subprocess |
| outcome | pod `terminated.exitCode` + message | subprocess exit code + `CODEX_TERMINATION_LOG` |
| budget | ConfigMap `governor-state` | `/var/lib/codex-governor/state.json` |
| credentials | Secret `codex-secrets` | `EnvironmentFile=/etc/codex-agents/credentials.env`, mode 0600 |
| deadline | Kubernetes reaps the pod | `CODEX_HOST_JOB_TIMEOUT` (1h) + `TimeoutStartSec` |

`gitops/tests/test_host_governor.py` asserts the no-fork rule mechanically:
it fails if `host_governor.py` ever defines `pick_item`, `decide`, `rollover`,
`absorb_finished_jobs` or a budget constant of its own. This repository has
twice paid for a copied rule going stale rather than being imported — see
CLAUDE.md, "168 became 169" — and this is the cheap version of that guard.

## Prerequisites on the box

The worker needs `node`, `npm`, `git`, `curl` and `tar` **on the host**, and a
Hetzner `ubuntu-24.04` server (`infra/servers.tf`) ships no node and no npm.

This is the one thing host mode does not inherit from the cluster path. There,
`governor.py` schedules the worker as a Job on `node:22-bookworm`, so the image
supplies all five — which is why [`worker.sh`](../workers/worker.sh) *asserts*
they are present rather than installing them, and says so in its own comments.
Run the same script as a subprocess on a bare box and its first real step,
`npm install -g "@openai/codex@${CODEX_VERSION}"`, dies on `npm: command not
found`.

That failure used to be invisible until the worst possible moment. `policy.json`
ships `"enabled": false`, so nothing runs at install time and the install
reported clean; the breakage surfaced only after the owner flipped the switch
and walked away, and it surfaced as a *worker* failure, which `host_governor.py`
records against the queue item's damped score rather than against the box. The
visible symptom was "that item keeps failing", not "this host cannot run the
worker at all".

The installer asks up front instead, before it writes anything — and then
supplies what is missing, from the distribution's own archive:

```bash
apt-get update && apt-get install -y --no-install-recommends nodejs npm git curl tar
```

`@openai/codex` declares `engines.node >= 16`, so Ubuntu 24.04's own `nodejs`
package (18.x) clears it and no separately-built Node is needed. A `node` that
is present but older is refused the same way a missing one is — Ubuntu 22.04
shipped 12.22, and `command -v node` succeeds there.

**It runs that line rather than only printing it** (changed 2026-09-06), and
the reason is the way this script is actually reached. `restore-cluster.sh`
invokes it over SSH, non-interactively, as step 9 of a recovery whose whole
premise is *take this while you are already holding the key* — so on the fresh
`ubuntu-24.04` that `infra/servers.tf:23` builds both boxes from, the owner's
one-command recovery reached that step, correctly refused, and handed them the
second trip they had just been told they would not need. Printing the command
was accurate advice and it still cost the thing it was protecting.

It stays a plain `apt-get` against Ubuntu's archive and must keep to that: no
third-party repository, no added key, nothing downloaded and piped into a
shell. That is what makes running it unattended reasonable. If a future
prerequisite is not in the archive, refuse and say so rather than reaching for
a NodeSource-style installer here.

Two things it deliberately does **not** trust. Apt's exit code is not the
answer — a package can install and still put nothing on `PATH` — so the
prerequisites are **re-checked** afterwards and a second failure refuses, with
the box untouched. And `--check` never installs anything; it is the read-only
mode and stays that way.

Three environment variables shape it:

| | effect |
|---|---|
| *(default)* | install what is missing, re-check, refuse if still missing |
| `SKIP_PREREQ_INSTALL=1` | report and refuse without touching the package manager — for a box under config management, where an `apt-get` would fight it |
| `ALLOW_MISSING_PREREQS=1` | proceed even though the box cannot run the worker yet — for preparing a box whose packages arrive by another route afterwards |

Neither override silences the report; the warnings still print.

## Install

From your laptop, in one run — discovers the key that opens the box, copies
the checkout, runs the installer, and hands over the credential, all in one
script:

```bash
./bootstrap/scripts/setup-codex-host-from-laptop.sh              # full run
./bootstrap/scripts/setup-codex-host-from-laptop.sh --check      # report only
```

Or by hand, on the box, as root, from a checkout of this repository:

```bash
# on your laptop
rsync -a --exclude .git ./ root@89.167.29.39:/root/monorepo-projects/

# on the box
cd /root/monorepo-projects
CONFIRM=install-codex-host ./bootstrap/scripts/install-codex-host.sh
```

It copies `governor.py`, `host_governor.py`, `worker.sh`, `mandate.md`,
`policy.json` and the queue to `/opt/codex-agents`, creates the three state
directories, installs both units, and enables the timer. It is idempotent —
re-run it to roll out a new queue or a new policy.

Then give it credentials. This reads **stdin, never argv**, so nothing lands
in your shell history or in `ps`:

```bash
./bootstrap/scripts/install-codex-host.sh --credentials <<'EOF'
CODEX_AUTH_JSON={"...":"..."}
GH_TOKEN=<your fine-grained PAT>
EOF
```

`CODEX_AUTH_JSON` is what `codex login` leaves in `~/.codex/auth.json`.
`GH_TOKEN` is a fine-grained PAT with **Contents: Read and write** and
**Pull requests: Read and write** on this repository — the worker opens PRs
and never merges. See [`../secrets/README.md`](../secrets/README.md), which
describes the same two values in their sealed form.

`CODEX_AUTH_JSON` is also the credential to *prefer*. It draws on a ChatGPT
plan's included usage, so a tick costs nothing extra, and `worker.sh` resolves
it before `OPENAI_API_KEY` and actively `unset`s the API key when both are
present so a tick cannot bill by accident. The metered key is a fallback for
having no plan to draw on, not an alternative spelling.

**If you are already running the recovery, you do not need this step
separately** (added 2026-09-10). `bootstrap/restore-cluster.sh` reads
`CODEX_AUTH_JSON`, `OPENAI_API_KEY` and `CODEX_GH_TOKEN` (falling back to
`GH_TOKEN` off a runner, which is what `load-secrets.sh --exec` exports) and
hands them to this installer over stdin in the same run that installs it —
the idiom step 11 has always used for the site's token. Until then this step
was a second trip with `HETZNERSSHKEY`, and that key is the one owner action
every route in this repository is blocked on, so a second trip is the
expensive kind. Store the value once with
`bootstrap/scripts/load-secrets.sh --put CODEX_AUTH_JSON < ~/.codex/auth.json`
and the recovery carries it.

Installing does **not** enable the governor. `policy.json` ships
`"enabled": false`, so the timer ticks and holds until you say otherwise. A box
can be fully prepared long before it is allowed to spend quota.

When you do want it spending, the flip is one command **on the box**, in
whatever session you are already in:

```bash
./bootstrap/scripts/install-codex-host.sh --enable    # start
./bootstrap/scripts/install-codex-host.sh --disable   # stop, keep it installed
```

or `CODEX_ENABLED=1` on the install (and on `restore-cluster.sh`, which passes
it straight through) to do it in the same run as everything else.

**Both edit the policy copy on the box, never the one in git** — that is the
whole point of them (changed 2026-09-10). The only previous route to this flip
was: run `enable-codex-governor.sh` in a checkout, commit, and *re-run the
installer on the box* to copy the new policy over. That last clause is a second
SSH session, and SSH here needs `HETZNERSSHKEY` — the one owner action every
route in this repository is blocked on. So the recovery would install the
worker, credential it in the same run (fixed 2026-09-10, one step earlier in
this same sequence), and then leave the thing switched **off** behind the very
key the owner had just spent their one session on. `enable-codex-governor.sh`
is still the right tool for the *cluster* path, where a commit is the delivery
mechanism and Argo does the rest; it was never the right shape for a box whose
policy arrives by `install -m 0644`.

Three properties make this safe, and each has a test:

- **The committed default stays `false`.** Neither route edits the repository,
  so no merge switches anyone on. `CODEX_ENABLED` unset is still "install and
  hold".
- **It refuses without a credential.** An enabled governor with nothing to
  authenticate with wakes every five minutes, fails, and sits on a six-hour
  auth cooldown — recorded against the *queue item's* damped score, so the
  visible symptom is "that item keeps failing" rather than "this box was never
  credentialed".
- **The switch belongs to the box, not to the checkout.** Re-running the
  installer to roll out a new queue carries the current setting over instead of
  resetting it to the repository's `false`, which would have turned off a
  running governor as a side effect of shipping a queue item. `CODEX_ENABLED=0`
  is how you turn it off deliberately.

## Operate

```bash
./bootstrap/scripts/install-codex-host.sh --check   # what is installed, what is missing
/opt/codex-agents/host/host_governor.py --check     # what it would do right now, and the budget
systemctl list-timers codex-governor.timer          # when it next fires
journalctl -u codex-governor.service -f             # what it did
```

`--check` on either script starts nothing and writes nothing. Its "governor
policy" line reports the policy **this box** holds, not the one in your
checkout — the two are allowed to differ, and before 2026-09-10 it read the
checkout, so an operator who had enabled it in git and committed but never
re-run the installer was told "policy enabled, the timer will start workers" by
a box that was still switched off.

To stop it, `systemctl disable --now codex-governor.timer`. To remove it,
`CONFIRM=install-codex-host ./bootstrap/scripts/install-codex-host.sh --uninstall`
— which deliberately keeps `/etc/codex-agents/credentials.env` (re-obtaining it
costs a `codex login`) and `/var/lib/codex-governor/state.json` (losing the
budget ledger would let a reinstall spend a fresh window immediately).

## What it is allowed to do

The worker's own limits are unchanged and are documented in
[`../workers/mandate.md`](../workers/mandate.md): it opens pull requests and
**never pushes to the base branch and never merges**. Host mode does not widen
that — it hands `worker.sh` the same environment the Job does, which
`test_host_governor.py::test_env_matches_the_cluster_job` checks by building
the real Job manifest and diffing the variable names.

The unit narrows what the process can reach, as the Job's `securityContext`
does: `NoNewPrivileges`, `ProtectSystem=strict`, `ProtectHome`, `PrivateTmp`,
`RestrictSUIDSGID`, and `ReadWritePaths` limited to the three state
directories. It is not `runAsNonRoot`/read-only-root for the same reason the
Job is not: `npm install -g` and the clone need a writable `$HOME`.

It is also the low-priority tenant on the box — `Nice=10`,
`IOSchedulingClass=idle`, `CPUWeight=20`, `MemoryMax=4G` — matching the Job's
`priorityClassName: agents-low`. If the box is also serving the portfolio, the
site wins.

## Known limits

- **`maxConcurrent > 1` has no effect here.** Host mode runs one worker per
  tick, synchronously, under a lock. Raising the policy value prints a note to
  stderr rather than silently serialising; shorten the timer interval instead.
- **No per-run isolation.** The Job gets a fresh container; here the worker
  runs on the host as root with a persistent `$HOME`. Acceptable on a box
  dedicated to this, and the reason host mode is the fallback rather than the
  default.
- **The budget ledger is per-box.** Two boxes running host mode against one
  ChatGPT seat would each think they had the whole window. Run it on one, or
  give them separate credentials.
- **Nothing reaps a wedged run except the deadline.** `CODEX_HOST_JOB_TIMEOUT`
  defaults to one hour; a run killed on it is recorded as a failure and
  explicitly *not* as a no-op, so a wedged item surfaces instead of sinking
  behind a damped score.
