# GitHub Actions runner, host mode

A self-hosted Actions runner on the Hetzner agent box's own **systemd**,
instead of the in-cluster pods `gitops/ci/` runs. Same runner, same repository,
different place to stand — mirroring what `gitops/agents/host/` already does
for the Codex worker.

## Why this exists

`gitops/ci/`'s own README documents the failure this fixes: self-hosted
runners there run as pods *in the k3s cluster*, so when the cluster is down
the fallback built to insure against metered GitHub-hosted minutes goes down
with it. On 2026-09-05, `:6443` was refused on both boxes
(`Outage triage` run 33889983086) while `:22` answered on both — the same
gap `gitops/agents/host/README.md` records for the Codex worker, and the same
fix: install onto the box directly. No k3s, no Argo, no image pull.

## It is not a fork of the in-cluster path

The runner binary, its labels, and its registration flow are the same GitHub
Actions runner release `gitops/ci/runner.yaml` runs in an image
(`ghcr.io/actions/actions-runner:2.328.0` — this installs the matching
`2.328.0` release tarball directly). Workflows dispatch to it exactly as they
would to the in-cluster pods, using the same `runs-on: ${{ vars.CI_RUNNER ||
'ubuntu-latest' }}` every workflow already carries.

| | in-cluster (`gitops/ci/`) | host mode |
|---|---|---|
| runs as | a `Deployment` pod | a systemd service |
| lifecycle | `--ephemeral`: one job, then re-registers | persistent: `run.sh`'s own loop takes job after job |
| work directory | an `emptyDir`, cleared before each registration (the pod-restart-inherits-the-old-tree bug `runner-entrypoint.sh` guards against) | `_work/<owner>/<repo>`, one per job — no shared-volume restart quirk to guard against |
| credentials | Sealed Secret `actions-runner-secrets` | `EnvironmentFile=/etc/actions-runner-host/credentials.env`, mode 0600 |
| identity | the pod's default service account, `automountServiceAccountToken: false` | dedicated unprivileged system user `actions-runner` |

## Install

Run it on the agent box, as root, from a checkout of this repository:

```bash
# on your laptop
rsync -a --exclude .git ./ root@<agent-box>:/root/monorepo-projects/

# on the box
cd /root/monorepo-projects
CONFIRM=install-github-runner-host ./bootstrap/scripts/install-github-runner-host.sh
```

It creates the `actions-runner` system user, downloads and verifies the
pinned runner release, runs the release's own `bin/installdependencies.sh`
(root, one-time — the officially supported way to resolve the bundled .NET
runtime's OS-level library needs, rather than this repository maintaining a
second, weaker copy of that list), installs `register-and-run.sh` and the
systemd unit, and enables the service. It is idempotent — re-run it after a
newer pinned version to upgrade.

`bootstrap/restore-cluster.sh` can do this step for you: pass
`WITH_GITHUB_RUNNER_HOST=1` and it runs last, after the cluster restore,
and cannot fail the restore itself.

Then give it a registration credential. This reads **stdin, never argv**:

```bash
./bootstrap/scripts/install-github-runner-host.sh --credentials <<'EOF'
RUNNER_TOKEN=<fine-grained PAT>
EOF
```

`RUNNER_TOKEN` is a PAT that can mint a runner registration token — the exact
scope `gitops/ci/README.md` already documents for the in-cluster Secret
(**Administration: Read and write**, scoped to this repository only). The
same PAT works for either path.

**If you are already running the recovery, this step comes with it** (added
2026-09-10). `RUNNER_TOKEN` has been in the local secret store's registry
(`infra/secrets/registry.tsv`) all along, so `load-secrets.sh --exec` already
exported it — but `bootstrap/restore-cluster.sh` ignored it and told you to
come back with the SSH key to register the runner by hand. It now pipes it to
this installer over stdin, after the install, in the same run. After the
install rather than before on purpose: `write_credentials` chowns the file to
the `actions-runner` account that the install is what creates, so writing
first leaves a root-owned file the service cannot read — a failure that looks
exactly like a rejected PAT.

Installing does **not** register the runner with GitHub. `register-and-run.sh`
(the systemd unit's `ExecStart`) only calls `config.sh` once a credential is
present; until then the service holds and retries every five minutes, the
same "hold" state `gitops/agents/host/host_governor.py` sits in on its own
auth cooldown.

## Operate

```bash
./bootstrap/scripts/install-github-runner-host.sh --check   # what is installed, what is missing
systemctl status github-runner.service
journalctl -u github-runner.service -f
```

`--check` starts nothing and writes nothing.

To stop it, `systemctl disable --now github-runner.service`. To remove it,
`CONFIRM=install-github-runner-host ./bootstrap/scripts/install-github-runner-host.sh --uninstall`
— which deliberately keeps `/etc/actions-runner-host/credentials.env`
(re-obtaining it costs minting a new PAT) and the `actions-runner` system
account (a reinstall should not need a fresh one).

## Known limits

- **One runner per box.** Unlike `gitops/ci/runner.yaml`'s two replicas, host
  mode installs a single persistent runner. That is enough to keep a normal
  PR moving; a burst of workflows queues rather than parallelises.
- **No per-job container isolation.** The in-cluster pod gets a fresh
  container per ephemeral registration; here `run.sh` runs jobs back to back
  as the same `actions-runner` user with a persistent `$HOME`. Acceptable on a
  box dedicated to this, and the reason host mode is the fallback rather than
  the default (the same trade-off `gitops/agents/host/README.md` makes for
  the Codex worker).
- **If GitHub removes the registration** (a stale runner pruned from the
  repository's settings), `run.sh` exits, the `.runner` file is stale, and
  `register-and-run.sh` will not know to re-register — delete
  `/opt/actions-runner-host/.runner` by hand and restart the service.
