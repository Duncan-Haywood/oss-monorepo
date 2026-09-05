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
    assert "private" in result.stderr  # "Is HETZNERSSHKEY the *private* key?"


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
