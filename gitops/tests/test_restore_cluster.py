# Execute `bootstrap/restore-cluster.sh` against a stubbed pair of boxes.
#
# This script is the one piece of the recovery that nobody can rehearse: it
# only does anything on two machines that have been unreachable since the day
# they were created, and the first time it runs for real will be the day the
# owner rotates HETZNERSSHKEY during an outage. So the decisions it makes are
# tested here instead, where a wrong one is cheap.
#
# The decision that matters most is the addressing mode. Following the
# documented bootstrap order today fails on both boxes, because both scripts
# default to a private network `infra/inventory.tf` records was never applied.
# `test_public_mode_*` below pins the fallback that avoids that.
#
# Nothing here reaches the network. `ssh` and `scp` are stubs that record their
# arguments and answer the probes the script makes.
from __future__ import annotations

import os
import subprocess
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[2] / "bootstrap" / "restore-cluster.sh"

CP = "root@1.2.3.4"
AG = "root@5.6.7.8"


@pytest.fixture()
def box(tmp_path: Path):
    """A stubbed control-plane/agent pair.

    The stub answers the handful of probes the script makes and appends every
    invocation to a log the tests assert against. State is a directory of flag
    files so a test can say "this box already has k3s" or "the private NIC is
    up" without the stub growing a mode switch per test.
    """
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    calls = tmp_path / "calls.log"
    state = tmp_path / "state"
    state.mkdir()

    # The remote command is the last argument; earlier ones are ssh options and
    # the host. Recording the whole argv keeps the env-var prefixes visible,
    # since that is where ADVERTISE_IP and SERVER_URL ride.
    (bin_dir / "ssh").write_text(
        f"""#!/usr/bin/env bash
printf '%s\\n' "ssh $*" >> "{calls}"
# argv is: -o opt -o opt <host> <remote command>
cmd="${{!#}}"
host="${{@: -2:1}}"

# Anything but the two boxes this fixture knows about is unreachable, which is
# what ssh itself does (exit 255). Without this the script could never be
# tested against the failure it is most likely to hit for real.
case "$host" in
  "{CP}"|"{AG}") : ;;
  *) echo "ssh: connect to host $host: Connection refused" >&2; exit 255 ;;
esac

# stdin is the piped script for `bash -s` calls; drain it so the writer's pipe
# does not break, and record it so tests can assert on what was actually sent.
case "$cmd" in
  *"bash -s"*)
    body="$(cat)"
    printf 'STDIN %s bytes: %s\\n' "${{#body}}" "$(printf '%s' "$body" | head -c 60 | tr '\\n' ' ')" >> "{calls}"
    exit 0
    ;;
  # The Codex and GitHub-runner host-mode payloads arrive the same way -- a
  # local `tar -cz` piped into a remote `tar -xz`. Draining it matters for the
  # same reason: an undrained pipe SIGPIPEs the writer, and the script would
  # read that as the install having failed rather than as the stub not
  # listening. Both are gzip-compressed on the wire, so the body is opaque to
  # a shell `case` match -- tests distinguish which feature's payload this was
  # by which WITH_* flag they set, not by sniffing the compressed bytes.
  *"tar -xz"*)
    body="$(cat)"
    printf 'STDIN %s bytes: host-mode payload\\n' "${{#body}}" >> "{calls}"
    exit 0
    ;;
  # The site host's token arrives the same way and for the same reason it is
  # not an env-var prefix: a `GH_TOKEN=... ssh` would put the PAT in the remote
  # box's own `ps`. Draining it here also lets a test assert the token never
  # appears in the recorded argv, which is the property that matters.
  *"--credentials"*)
    body="$(cat)"
    printf 'STDIN %s bytes: credentials\\n' "${{#body}}" >> "{calls}"
    test ! -f "{state}/site_creds_fails"
    exit $?
    ;;
esac

# No trailing `exit 0`: several branches below are probes whose *exit status*
# is the answer the script reads, and an unconditional exit would silently
# report every box as fully provisioned.
case "$cmd" in
  "echo ok") echo ok ;;
  *"test -f /etc/rancher/k3s/k3s.yaml"*)
    test -f "{state}/k3s_installed" ;;
  *"ip -4 addr show"*)
    # The script greps for the private address; answer per-host.
    case "$host" in
      "{CP}") test -f "{state}/cp_priv" ;;
      *) test -f "{state}/ag_priv" ;;
    esac
    ;;
  *"node-token"*)
    # An empty file is a readable-but-empty token, which the script must
    # reject; `cat` succeeding on it is the realistic behaviour.
    cat "{state}/node_token" 2>/dev/null || exit 1 ;;
  *mktemp*) echo /tmp/restore-stub ;;
  *"install-codex-host.sh"*)
    test ! -f "{state}/codex_install_fails" ;;
  *"install-github-runner-host.sh"*)
    test ! -f "{state}/runner_install_fails" ;;
  *"install-portfolio-site-host.sh"*)
    test ! -f "{state}/site_install_fails" ;;
  *"kubectl wait"*) echo "node/cp condition met" ;;
  *"kubectl get nodes"*) echo "cp Ready; ag Ready" ;;
  *curl*) echo "200, 4096 bytes" ;;
  *) : ;;
esac
"""
    )
    (bin_dir / "ssh").chmod(0o755)

    (bin_dir / "scp").write_text(
        f'#!/usr/bin/env bash\nprintf \'%s\\n\' "scp $*" >> "{calls}"\nexit 0\n'
    )
    (bin_dir / "scp").chmod(0o755)

    # A well-formed k3s token by default; individual tests overwrite it.
    (state / "node_token").write_text("K10abc123::server:secretpassword\n")

    # `sleep` is stubbed to nothing so the 60s Argo settle does not make the
    # suite take a minute per test.
    (bin_dir / "sleep").write_text("#!/usr/bin/env bash\nexit 0\n")
    (bin_dir / "sleep").chmod(0o755)

    def run(**env_overrides):
        env = dict(os.environ)
        env["PATH"] = f"{bin_dir}:{env['PATH']}"
        # The public IPs have to be overridden alongside the hosts. They are
        # separate settings in the script (the SSH target and the address k3s
        # advertises are not the same thing), so leaving them at their real
        # defaults would have the stub talking to 1.2.3.4 while the assertions
        # looked for 89.167.29.39.
        env.update(
            {
                "CP": CP,
                "AG": AG,
                "CP_PUBLIC_IP": CP.split("@")[1],
                "AG_PUBLIC_IP": AG.split("@")[1],
                "CONFIRM": "restore-cluster",
            }
        )
        # Never let a real runner's masking command interleave with assertions.
        env.pop("GITHUB_ACTIONS", None)
        env.update({k: str(v) for k, v in env_overrides.items()})
        return subprocess.run(
            ["bash", str(SCRIPT)], env=env, capture_output=True, text=True, timeout=60
        )

    def log() -> str:
        return calls.read_text() if calls.exists() else ""

    ns = type("Box", (), {})()
    ns.run, ns.log, ns.state = run, log, state
    return ns


def test_refuses_without_confirm(box):
    """The only thing standing between a stray dispatch and a cluster install."""
    result = box.run(CONFIRM="")
    assert result.returncode != 0
    assert "CONFIRM=restore-cluster" in result.stderr


def test_dry_run_needs_no_confirm_and_installs_nothing(box):
    result = box.run(CONFIRM="", DRY_RUN=1)
    assert result.returncode == 0, result.stderr
    assert "would install" in result.stdout
    assert "install-k3s-server" not in box.log()


def test_public_mode_when_private_nic_is_absent(box):
    """The case that actually exists: no hcloud_network was ever applied.

    Without this fallback the server install waits 180s on an address that is
    on no interface and exits 1, and the agent retries a join forever.
    """
    result = box.run()
    assert result.returncode == 0, result.stderr
    assert "detected: public" in result.stdout
    log = box.log()
    assert "ADVERTISE_IP='1.2.3.4'" in log
    assert "SERVER_URL='https://1.2.3.4:6443'" in log
    assert "NODE_IP='5.6.7.8'" in log
    # The private addresses must not survive into anything that *configures*
    # the cluster. They legitimately appear in the detection probe itself
    # (`ip -4 addr show | grep -q 10.10.0.10`), which is how the mode was
    # chosen, so exclude that line rather than the address everywhere.
    configuring = [
        line
        for line in log.splitlines()
        if "ip -4 addr show" not in line and "10.10.0." in line
    ]
    assert not configuring, f"private addressing leaked into public mode: {configuring}"


def test_public_mode_encrypts_node_to_node_traffic(box):
    """Public addressing puts the pod network on the open internet.

    flannel's default vxlan backend is unauthenticated and unencrypted, so a
    two-node cluster joined over public IPs would carry pod-to-pod traffic in
    the clear between Helsinki and Falkenstein. This is the one thing in public
    mode that cannot be fixed later without rebuilding the cluster.
    """
    box.run()
    assert "FLANNEL_BACKEND='wireguard-native'" in box.log()


def test_private_mode_when_both_nics_are_up(box):
    """If the network is ever applied, take it without needing an edit."""
    (box.state / "cp_priv").touch()
    (box.state / "ag_priv").touch()
    result = box.run()
    assert result.returncode == 0, result.stderr
    assert "detected: private" in result.stdout
    log = box.log()
    assert "ADVERTISE_IP='10.10.0.10'" in log
    assert "SERVER_URL='https://10.10.0.10:6443'" in log
    # No public exposure and so nothing to encrypt: keep k3s's cheaper default.
    assert "FLANNEL_BACKEND=''" in log


def test_half_a_private_network_is_not_private_mode(box):
    """One NIC up is a partial tofu apply, not a usable fabric.

    Treating it as private would point the agent at a server address that
    exists while giving the agent a node IP that does not.
    """
    (box.state / "cp_priv").touch()
    result = box.run()
    assert "detected: public" in result.stdout


def test_existing_cluster_is_labelled_not_reinstalled(box):
    """Never clobber a running cluster — the thing an outage tool must not do."""
    (box.state / "k3s_installed").touch()
    result = box.run()
    assert result.returncode == 0, result.stderr
    assert "will not reinstall" in result.stdout
    log = box.log()
    assert "label-existing" in log or "STDIN" in log
    assert "ADVERTISE_IP" not in log


def test_token_is_never_echoed(box):
    """It is a cluster-join credential; anyone holding it can add a node."""
    secret = "K10deadbeef::server:donotprint"
    (box.state / "node_token").write_text(secret + "\n")
    result = box.run()
    assert result.returncode == 0, result.stderr
    assert "donotprint" not in result.stdout
    assert "donotprint" not in result.stderr


def test_token_never_reaches_the_agent_command_line(box):
    """argv is world-readable via `ps` on the agent; the pipe body is not."""
    secret = "K10deadbeef::server:donotprint"
    (box.state / "node_token").write_text(secret + "\n")
    box.run()
    for line in box.log().splitlines():
        if line.startswith("ssh ") and "donotprint" in line:
            pytest.fail(f"token appeared in an ssh argv: {line}")


@pytest.mark.parametrize(
    "bad",
    [
        "not-a-k3s-token",  # e.g. an error page or a truncated read
        "",  # unreadable file
        "K10abc::server:pass'word",  # would break out of the single quotes
    ],
)
def test_malformed_tokens_are_refused(box, bad):
    (box.state / "node_token").write_text(bad)
    result = box.run()
    assert result.returncode != 0
    assert "token" in result.stderr.lower()


def test_unreachable_control_plane_names_the_likely_cause(box):
    """The failure this script is most likely to hit on its first real run."""
    result = box.run(CP="root@0.0.0.0")
    assert result.returncode != 0
    assert "private" in result.stderr  # "... the *private* key?"


def test_ssh_hint_names_the_agent_when_run_outside_actions(box):
    """As of 2026-09-05 the owner's primary route is a laptop run, because
    Actions runners are starved and the workflow route cannot fire at all.
    On a laptop there is no HETZNERSSHKEY to suspect, so naming only the
    secret would send them to fix a variable that does not exist in the
    shell they are standing in. The fixture pops GITHUB_ACTIONS, so this is
    the laptop context."""
    result = box.run(CP="root@0.0.0.0")
    assert "SSH agent" in result.stderr
    assert "HETZNERSSHKEY" not in result.stderr


def test_ssh_hint_names_the_secret_when_run_inside_actions(box):
    result = box.run(CP="root@0.0.0.0", GITHUB_ACTIONS="true")
    assert "HETZNERSSHKEY" in result.stderr


def test_skip_argocd_leaves_the_cluster_empty(box):
    result = box.run(SKIP_ARGOCD=1)
    assert result.returncode == 0, result.stderr
    assert "nothing deployed into it" in result.stdout
    assert "install-argocd.sh" not in box.log()


def test_argocd_is_invoked_without_opting_into_the_password_print(box):
    """The restore path must never set PRINT_ADMIN_PASSWORD.

    On a laptop, install-argocd.sh's unconditional echo of the initial admin
    password was harmless — it went to the operator's own terminal. Run from
    the restore workflow, that same echo writes a live cluster-admin credential
    into an Actions log every repository collaborator can read and that
    outlives the session. The opt-in default is asserted separately, against
    the real script, in test_install_argocd_default_does_not_print_the_password.
    """
    result = box.run()
    assert result.returncode == 0, result.stderr
    log = box.log()
    assert "install-argocd.sh" in log
    assert "PRINT_ADMIN_PASSWORD" not in log


@pytest.fixture()
def argocd_env(tmp_path: Path):
    """Run the real install-argocd.sh against a stubbed kubectl.

    Separate from the `box` fixture above, which stubs `ssh` and so only ever
    sees this script as bytes going over a pipe. These exercise it directly.
    """
    script = SCRIPT.parent / "install-argocd.sh"
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    # Enough kubectl for the script to reach its final block. The password comes
    # back base64 so the `base64 -d` on the print path is real, and the
    # repository-secret lookup answers per STUB_HAS_REPO_SECRET so the
    # already-configured branch can be reached.
    (bin_dir / "kubectl").write_text(
        "#!/usr/bin/env bash\n"
        'case "$*" in\n'
        "  *argocd-initial-admin-secret*) printf 'c3VwZXJzZWNyZXQ=' ;;\n"  # "supersecret"
        "  *secret-type=repository*)\n"
        '    [[ "${STUB_HAS_REPO_SECRET:-}" == "1" ]] && echo secret/repo-gitops\n'
        "    exit 0 ;;\n"
        "  *) exit 0 ;;\n"
        "esac\n"
    )
    (bin_dir / "kubectl").chmod(0o755)
    kubeconfig = tmp_path / "k3s.yaml"
    kubeconfig.write_text("apiVersion: v1\n")

    def run(**extra):
        env = dict(os.environ)
        env["PATH"] = f"{bin_dir}:{env['PATH']}"
        env["KUBECONFIG"] = str(kubeconfig)
        env.pop("ARGOCD_REPO_TOKEN", None)
        env.pop("ARGOCD_REPO_TOKEN_FILE", None)
        env.update({k: str(v) for k, v in extra.items()})
        return subprocess.run(
            ["bash", str(script)], env=env, capture_output=True, text=True, timeout=60
        )

    return run


def test_install_argocd_default_does_not_print_the_password(argocd_env):
    """Exercise the real install-argocd.sh, not the pipeline that calls it."""
    run = argocd_env
    default = run()
    assert default.returncode == 0, default.stderr
    assert "supersecret" not in default.stdout
    assert "not printed" in default.stdout
    opted_in = run(PRINT_ADMIN_PASSWORD=1)
    assert "supersecret" in opted_in.stdout


def test_install_argocd_warns_loudly_with_no_repository_credential(argocd_env):
    """A private repo with no credential is the silent-dark-site failure.

    Argo installs, applies the root Application, and then fails every sync on
    repository authentication. The operator sees a clean bootstrap. This has to
    be loud, because nothing downstream will say why the site is empty.
    """
    result = argocd_env()
    assert result.returncode == 0, result.stderr
    assert "no Argo CD repository credential" in result.stderr
    assert "stay dark" in result.stderr


def test_install_argocd_creates_the_credential_from_a_token_file(argocd_env, tmp_path):
    """restore-cluster.sh hands the token over as a mode-600 file."""
    token_file = tmp_path / "repo-token"
    token_file.write_text("ghp_secrettoken")
    result = argocd_env(ARGOCD_REPO_TOKEN_FILE=str(token_file))
    assert result.returncode == 0, result.stderr
    assert "configuring the Argo CD repository credential" in result.stdout
    # The URL is read out of root-application.yaml rather than restated.
    assert "github.com/Duncan-Haywood/monorepo-projects" in result.stdout
    assert "no Argo CD repository credential" not in result.stderr
    # kubectl receives the Secret on stdin, so the value is never in an argv.
    assert "ghp_secrettoken" not in result.stdout


def test_install_argocd_leaves_an_existing_credential_alone(argocd_env):
    result = argocd_env(STUB_HAS_REPO_SECRET="1")
    assert result.returncode == 0, result.stderr
    assert "already exists; leaving it alone" in result.stdout
    assert "no Argo CD repository credential" not in result.stderr


def test_missing_repo_token_is_called_out_not_silently_skipped(box):
    """The failure that would waste the owner's one restore attempt.

    The GitOps repository is private. With no credential Argo installs, applies
    the root Application, and then fails every sync on repository
    authentication — a cluster that is up, a site that serves nothing, and no
    error anywhere except Argo's own Application status. A restore that reports
    success in that state is worse than one that fails.
    """
    result = box.run()
    assert result.returncode == 0, result.stderr
    assert "ARGOCD_REPO_TOKEN is not set" in result.stdout
    assert "serve nothing" in result.stdout
    assert "repo-token" not in box.log()


def test_repo_token_is_written_over_stdin_never_into_an_argv(box):
    """`ARGOCD_REPO_TOKEN=… ssh …` would be readable via ps on the box."""
    secret = "ghp_donotprint0000"
    result = box.run(ARGOCD_REPO_TOKEN=secret)
    assert result.returncode == 0, result.stderr
    log = box.log()
    assert "umask 077" in log
    assert "ARGOCD_REPO_TOKEN_FILE=" in log
    assert secret not in log
    assert secret not in result.stdout
    assert secret not in result.stderr


def test_serving_check_runs_all_three_hostnames(box):
    result = box.run()
    for host in ("marisstella.dev", "www.marisstella.dev", "tools.marisstella.dev"):
        assert host in result.stdout


def test_invalid_mode_is_rejected(box):
    result = box.run(MODE="sideways")
    assert result.returncode != 0
    assert "MODE must be" in result.stderr


# ------------------------------------- step 9: dev capacity that outlives this
# cluster
#
# When this cluster died it took the Codex worker's only scheduler with it, and
# the fallback (self-hosted runners in `gitops/ci/`) died too, because those run
# as pods in this same cluster. `gitops/agents/host/` is a systemd timer that
# runs the identical governor with no k3s underneath it, so installing it during
# the restore is what makes the *next* cluster loss survivable. These tests pin
# the three properties that make it safe to bolt onto the recovery path.


def test_codex_host_is_not_installed_by_default(box):
    """The recovery path is unchanged unless you ask for the extra step."""
    result = box.run()
    assert result.returncode == 0, result.stderr
    assert "install-codex-host.sh" not in box.log()
    # ...but it says the option exists, or nobody holding the key would know.
    assert "WITH_CODEX_HOST=1" in result.stdout


def test_codex_host_installs_on_the_agent_box_when_opted_in(box):
    result = box.run(WITH_CODEX_HOST=1)
    assert result.returncode == 0, result.stderr
    log = box.log()

    install = [line for line in log.splitlines() if "install-codex-host.sh" in line]
    assert install, "the installer was never invoked"
    # The Job it stands in for carries `nodeSelector: hcloud/node-role: agents`,
    # so the worker belongs on the agent box, not the control plane.
    assert any(AG in line for line in install), f"not sent to the agent box: {install}"
    assert not any(CP in line for line in install), "installed on the control plane"
    # The installer refuses without this, so a missing CONFIRM is a silent no-op.
    assert any("CONFIRM=install-codex-host" in line for line in install)
    assert "host-mode payload" in log, "the agents tree never reached the box"


def test_codex_host_failure_does_not_fail_the_restore(box):
    """A broken extra must not make a successful recovery look failed."""
    (box.state / "codex_install_fails").write_text("")
    result = box.run(WITH_CODEX_HOST=1)
    assert result.returncode == 0, result.stderr
    assert "did not complete" in result.stderr
    assert "cluster restore above is unaffected" in result.stderr


def test_codex_host_respects_dry_run(box):
    result = box.run(CONFIRM="", DRY_RUN=1, WITH_CODEX_HOST=1)
    assert result.returncode == 0, result.stderr
    assert "install-codex-host.sh" not in box.log()
    assert "would install the Codex host governor" in result.stdout
    assert "holds until enabled" in result.stdout


def test_codex_host_enables_nothing(box):
    """Installing is separated from authorising spend, and says so."""
    result = box.run(WITH_CODEX_HOST=1)
    assert "spends no quota" in result.stdout
    assert "--credentials" in result.stdout


# --------------------------------------------------- GitHub runner, host mode
#
# gitops/ci/ runs self-hosted Actions runners as pods in the same cluster this
# script restores, so that insurance against metered GitHub-hosted minutes was
# downstream of the very outage it exists to survive -- the identical failure
# WITH_CODEX_HOST above already fixes for the Codex worker. These tests pin
# the same properties for the runner: off by default, sent to the agent box,
# a broken install does not fail the restore, and it respects DRY_RUN.


def test_github_runner_host_is_not_installed_by_default(box):
    result = box.run()
    assert result.returncode == 0, result.stderr
    assert "install-github-runner-host.sh" not in box.log()
    assert "WITH_GITHUB_RUNNER_HOST=1" in result.stdout


def test_github_runner_host_installs_on_the_agent_box_when_opted_in(box):
    result = box.run(WITH_GITHUB_RUNNER_HOST=1)
    assert result.returncode == 0, result.stderr
    log = box.log()

    install = [line for line in log.splitlines() if "install-github-runner-host.sh" in line]
    assert install, "the installer was never invoked"
    assert any(AG in line for line in install), f"not sent to the agent box: {install}"
    assert not any(CP in line for line in install), "installed on the control plane"
    assert any("CONFIRM=install-github-runner-host" in line for line in install)
    assert "host-mode payload" in log, "the runner tree never reached the box"


def test_github_runner_host_failure_does_not_fail_the_restore(box):
    (box.state / "runner_install_fails").write_text("")
    result = box.run(WITH_GITHUB_RUNNER_HOST=1)
    assert result.returncode == 0, result.stderr
    assert "did not complete" in result.stderr
    assert "cluster restore above is unaffected" in result.stderr


def test_github_runner_host_respects_dry_run(box):
    result = box.run(CONFIRM="", DRY_RUN=1, WITH_GITHUB_RUNNER_HOST=1)
    assert result.returncode == 0, result.stderr
    assert "install-github-runner-host.sh" not in box.log()
    assert "would install the GitHub Actions runner" in result.stdout
    assert "holds until credentialed" in result.stdout


def test_github_runner_host_registers_nothing_without_credentials(box):
    """Installing is separated from registering with GitHub, and says so."""
    result = box.run(WITH_GITHUB_RUNNER_HOST=1)
    assert "registers with GitHub only once" in result.stdout
    assert "--credentials" in result.stdout


def test_both_host_mode_extras_can_be_installed_in_one_restore(box):
    """The two flags are independent; taking one must not skip the other."""
    result = box.run(WITH_CODEX_HOST=1, WITH_GITHUB_RUNNER_HOST=1)
    assert result.returncode == 0, result.stderr
    log = box.log()
    assert any("install-codex-host.sh" in line for line in log.splitlines())
    assert any("install-github-runner-host.sh" in line for line in log.splitlines())


# --------------------------------------------- step 11: the one that *serves*
#
# Steps 9 and 10 restore what builds -- dev capacity and CI -- onto the box's
# own systemd. Nothing did the same for what serves, so the restore could
# finish every earlier step and leave a visitor to marisstella.dev looking at
# the same refused connection the whole exercise exists to end.
#
# Two properties here are not shared with 9 and 10 and are the ones worth
# pinning. It goes on the CONTROL PLANE, because that is where the apex, www
# and tools all resolve (`Outage triage`, run 33889983086) -- sending it to the
# agent box would install a perfectly working server on an address no DNS
# record points at, and nothing downstream would notice. And its credential is
# needed UP FRONT rather than after, because the origin is private and the
# deploy checkout cannot be cloned without it.


def test_portfolio_site_host_is_not_installed_by_default(box):
    result = box.run()
    assert result.returncode == 0, result.stderr
    assert "install-portfolio-site-host.sh" not in box.log()
    assert "WITH_PORTFOLIO_SITE_HOST=1" in result.stdout


def test_portfolio_site_host_installs_on_the_control_plane_when_opted_in(box):
    result = box.run(WITH_PORTFOLIO_SITE_HOST=1, SITE_GH_TOKEN="ghp_exampletoken")
    assert result.returncode == 0, result.stderr
    log = box.log()

    install = [
        line
        for line in log.splitlines()
        if "install-portfolio-site-host.sh" in line and "--credentials" not in line
    ]
    assert install, "the installer was never invoked"
    # The apex points at the control plane. On the agent box this would serve
    # correctly to nobody.
    assert any(CP in line for line in install), f"not sent to the control plane: {install}"
    assert not any(AG in line for line in install), "installed on the agent box"
    assert any("CONFIRM=install-portfolio-site-host" in line for line in install)
    assert "host-mode payload" in log, "the site tree never reached the box"


def test_portfolio_site_host_token_never_appears_in_argv(box):
    """The PAT rides stdin, so it must not be anywhere in a recorded command.

    An env-var prefix on the remote command string would put it in the box's
    own `ps` -- the rule `ARGOCD_REPO_TOKEN` already follows in step 8.
    """
    token = "ghp_averysecrettokenvalue"
    result = box.run(WITH_PORTFOLIO_SITE_HOST=1, SITE_GH_TOKEN=token)
    assert result.returncode == 0, result.stderr
    assert token not in box.log()
    assert token not in result.stdout
    assert token not in result.stderr
    # It did reach the box, over stdin.
    assert "credentials" in box.log()


def test_portfolio_site_host_skips_without_a_token_and_says_why(box):
    """No token is a skip, not a half-install: nothing would be serving."""
    result = box.run(WITH_PORTFOLIO_SITE_HOST=1)
    assert result.returncode == 0, result.stderr
    assert "install-portfolio-site-host.sh" not in box.log()
    assert "SITE_GH_TOKEN" in result.stderr
    assert "cluster restore above is" in result.stderr


def test_portfolio_site_host_failure_does_not_fail_the_restore(box):
    (box.state / "site_install_fails").write_text("")
    result = box.run(WITH_PORTFOLIO_SITE_HOST=1, SITE_GH_TOKEN="ghp_exampletoken")
    assert result.returncode == 0, result.stderr
    assert "did not complete" in result.stderr
    assert "cluster restore above is unaffected" in result.stderr
    assert "nothing was" in result.stderr and "published" in result.stderr


def test_portfolio_site_host_respects_dry_run(box):
    result = box.run(
        CONFIRM="", DRY_RUN=1, WITH_PORTFOLIO_SITE_HOST=1, SITE_GH_TOKEN="ghp_x"
    )
    assert result.returncode == 0, result.stderr
    assert "install-portfolio-site-host.sh" not in box.log()
    assert "would serve the portfolio site" in result.stdout


def test_dry_run_warns_when_the_token_is_missing(box):
    """The plan is where a missing token is cheap to notice."""
    result = box.run(CONFIRM="", DRY_RUN=1, WITH_PORTFOLIO_SITE_HOST=1)
    assert "NO SITE_GH_TOKEN" in result.stdout


def test_portfolio_site_host_serves_http_without_a_tls_email(box):
    result = box.run(WITH_PORTFOLIO_SITE_HOST=1, SITE_GH_TOKEN="ghp_x")
    assert "HTTP only" in result.stdout or "HTTP" in result.stdout
    assert "--tls" in result.stdout


def test_all_three_host_mode_extras_can_be_installed_in_one_restore(box):
    """The three flags are independent; taking one must not skip the others."""
    result = box.run(
        WITH_CODEX_HOST=1,
        WITH_GITHUB_RUNNER_HOST=1,
        WITH_PORTFOLIO_SITE_HOST=1,
        SITE_GH_TOKEN="ghp_x",
    )
    assert result.returncode == 0, result.stderr
    log = box.log()
    assert "install-codex-host.sh" in log
    assert "install-github-runner-host.sh" in log
    assert "install-portfolio-site-host.sh" in log
