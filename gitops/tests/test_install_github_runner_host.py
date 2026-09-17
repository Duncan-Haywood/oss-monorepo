"""`bootstrap/scripts/install-github-runner-host.sh` — a GitHub Actions
runner on the Hetzner box's own systemd, independent of k3s.

`gitops/ci/` runs self-hosted runners as pods *inside* the k3s cluster, so the
insurance against metered GitHub-hosted minutes goes down with the cluster
that hosts it (see gitops/ci/README.md). This installer is the same fix
`gitops/agents/host/` already applied to the Codex worker, applied to the CI
runner: a systemd service on the box itself.

These tests run the real installer against a throwaway prefix and a stub
runner "release" (a fake tarball built in a fixture, never the real ~200MB
GitHub download) — no root paths, no systemd, no live GitHub registration,
and no real network. `os.geteuid() != 0` is skipped for the same reason
test_install_codex_host.py skips it: `useradd` and the ownership steps need
root even against a scratch prefix.
"""

from __future__ import annotations

import os
import shutil
import subprocess
import tarfile
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parent
SCRIPT = REPO / "bootstrap" / "scripts" / "install-github-runner-host.sh"

pytestmark = pytest.mark.skipif(
    os.geteuid() != 0, reason="the installer requires root even for a scratch prefix"
)


def _fake_runner_tarball(tmp_path: Path) -> Path:
    """A stand-in for the real actions/runner release tarball.

    Just enough for the installer to extract and for a test to see it landed:
    a `config.sh` and `run.sh` (the two the installed tree must have) and a
    `bin/installdependencies.sh` the installer calls if present.
    """
    src = tmp_path / "fake-runner-src"
    src.mkdir()
    (src / "config.sh").write_text("#!/bin/sh\necho fake config.sh \"$@\"\ntouch .runner\n")
    (src / "run.sh").write_text("#!/bin/sh\necho fake run.sh\n")
    bindir = src / "bin"
    bindir.mkdir()
    (bindir / "installdependencies.sh").write_text("#!/bin/sh\necho fake installdependencies.sh\n")
    for f in (src / "config.sh", src / "run.sh", bindir / "installdependencies.sh"):
        f.chmod(0o755)

    tarball = tmp_path / "fake-runner.tar.gz"
    with tarfile.open(tarball, "w:gz") as tf:
        for f in src.iterdir():
            tf.add(f, arcname=f.name)  # recurses into bin/ on its own
    return tarball


def _sha256(path: Path) -> str:
    import hashlib

    return hashlib.sha256(path.read_bytes()).hexdigest()


@pytest.fixture
def box(tmp_path):
    """A scratch filesystem standing in for the Hetzner box, plus a unique
    throwaway system user this fixture removes when the test finishes -- the
    installer creates a real system account even against a scratch prefix,
    and leaving it behind would accumulate one per test run.
    """
    user = f"gh-runner-test-{os.getpid()}-{tmp_path.name[-6:]}"
    tarball = _fake_runner_tarball(tmp_path)
    env = {
        "RUNNER_HOST_PREFIX": str(tmp_path / "opt"),
        "RUNNER_HOST_ETC": str(tmp_path / "etc"),
        "RUNNER_HOST_UNITDIR": str(tmp_path / "units"),
        "RUNNER_HOST_WORKDIR": str(tmp_path / "var"),
        "RUNNER_HOST_USER": user,
        "RUNNER_HOST_TARBALL_PATH": str(tarball),
        "RUNNER_HOST_TARBALL_SHA256": _sha256(tarball),
    }
    yield env
    subprocess.run(["userdel", "-f", user], capture_output=True)


def run(box, *args, confirm=True, stdin=None, expect=0):
    env = dict(os.environ, **box)
    if confirm:
        env["CONFIRM"] = "install-github-runner-host"
    else:
        env.pop("CONFIRM", None)
    result = subprocess.run(
        ["bash", str(SCRIPT), *args],
        env=env,
        input=stdin,
        capture_output=True,
        text=True,
        timeout=120,
    )
    if expect is not None:
        assert result.returncode == expect, (
            f"exit {result.returncode}\nstdout:\n{result.stdout}\nstderr:\n{result.stderr}"
        )
    return result


# ------------------------------------------------------------------- refusals


def test_refuses_to_install_without_confirm(box):
    result = run(box, confirm=False, expect=1)
    assert "CONFIRM=install-github-runner-host" in result.stderr
    assert not Path(box["RUNNER_HOST_PREFIX"]).exists()


def test_check_needs_no_confirm_and_changes_nothing(box):
    run(box, "--check", confirm=False)
    assert not Path(box["RUNNER_HOST_PREFIX"]).exists()
    assert not Path(box["RUNNER_HOST_UNITDIR"]).exists()


def test_unknown_argument_is_rejected(box):
    result = run(box, "--wat", expect=2)
    assert "unknown argument" in result.stderr


# -------------------------------------------------------------------- payload


def test_install_places_everything_and_creates_the_service_user(box):
    run(box)
    prefix = Path(box["RUNNER_HOST_PREFIX"])

    assert (prefix / "config.sh").is_file()
    assert (prefix / "run.sh").is_file()
    assert (prefix / "register-and-run.sh").is_file()
    assert os.access(prefix / "register-and-run.sh", os.X_OK)

    units = Path(box["RUNNER_HOST_UNITDIR"])
    assert (units / "github-runner.service").is_file()

    assert Path(box["RUNNER_HOST_WORKDIR"]).is_dir()
    assert (Path(box["RUNNER_HOST_WORKDIR"]) / "_work").is_dir()

    result = subprocess.run(["id", box["RUNNER_HOST_USER"]], capture_output=True, text=True)
    assert result.returncode == 0, "the installer must create its service user"


def test_installed_tree_is_owned_by_the_service_user_not_root(box):
    run(box)
    prefix = Path(box["RUNNER_HOST_PREFIX"])
    st = (prefix / "config.sh").stat()
    import pwd

    assert pwd.getpwuid(st.st_uid).pw_name == box["RUNNER_HOST_USER"], (
        "the runner tree must be owned by the unprivileged service user, "
        "not root -- the systemd unit runs it as that user"
    )


def test_reinstall_does_not_redownload_an_already_extracted_runner(box):
    run(box)
    prefix = Path(box["RUNNER_HOST_PREFIX"])
    marker = prefix / "config.sh"
    original = marker.read_text()
    # Poison the local "release" so a second extraction would be detectable.
    os.utime(box["RUNNER_HOST_TARBALL_PATH"], None)
    result = run(box)
    assert marker.read_text() == original
    assert "already extracted" in result.stdout


def test_unit_file_paths_match_the_installed_prefix_defaults(box):
    """The shipped unit hardcodes /opt/actions-runner-host; this is the one
    coupling between the unit file and the installer's own default PREFIX, and
    a rename on one side and not the other is a service that starts and
    immediately fails to find its own working directory.
    """
    unit_src = REPO / "gitops" / "ci" / "host" / "github-runner.service"
    text = unit_src.read_text()
    assert "WorkingDirectory=/opt/actions-runner-host" in text
    assert "ExecStart=/bin/bash /opt/actions-runner-host/register-and-run.sh" in text
    assert "User=actions-runner" in text
    assert "Restart=always" in text
    # Type=simple + Restart=always is deliberate: run.sh is long-lived, unlike
    # codex-governor.service's Type=oneshot tick.
    assert "Type=simple" in text


# ---------------------------------------------------------------- credentials


def test_credentials_are_written_private_and_never_echoed(box):
    run(box)
    secret = "RUNNER_TOKEN=super-secret-value\n"
    result = run(box, "--credentials", stdin=secret)
    creds = Path(box["RUNNER_HOST_ETC"]) / "credentials.env"
    assert creds.is_file()
    assert oct(creds.stat().st_mode)[-3:] == "600"
    assert creds.read_text() == secret
    assert "super-secret-value" not in result.stdout
    assert "super-secret-value" not in result.stderr


def test_check_reports_credentials_without_revealing_them(box):
    run(box)
    run(box, "--credentials", stdin="RUNNER_TOKEN=another-secret\n")
    result = run(box, "--check", confirm=False)
    assert "credentials present" in result.stdout
    assert "another-secret" not in result.stdout
    assert "another-secret" not in result.stderr


def test_empty_stdin_leaves_existing_credentials_alone(box):
    run(box)
    run(box, "--credentials", stdin="RUNNER_TOKEN=keep-me\n")
    creds = Path(box["RUNNER_HOST_ETC"]) / "credentials.env"
    run(box, "--credentials", stdin="", expect=1)
    assert creds.read_text() == "RUNNER_TOKEN=keep-me\n"


# ------------------------------------------------------------------ uninstall


def test_uninstall_removes_the_payload_but_keeps_credential_and_user(box):
    run(box)
    run(box, "--credentials", stdin="RUNNER_TOKEN=keep-me\n")
    run(box, "--uninstall")

    assert not Path(box["RUNNER_HOST_PREFIX"]).exists()
    assert not (Path(box["RUNNER_HOST_UNITDIR"]) / "github-runner.service").exists()
    assert (Path(box["RUNNER_HOST_ETC"]) / "credentials.env").is_file()
    result = subprocess.run(["id", box["RUNNER_HOST_USER"]], capture_output=True, text=True)
    assert result.returncode == 0, "uninstall must not delete the service account"


def test_uninstall_refuses_without_confirm(box):
    run(box)
    run(box, "--uninstall", confirm=False, expect=1)
    assert Path(box["RUNNER_HOST_PREFIX"]).exists()


# ------------------------------------------------------------------ checksum


def test_checksum_mismatch_refuses_to_extract(box):
    box = dict(box, RUNNER_HOST_TARBALL_SHA256="0" * 64)
    result = run(box, expect=1)
    assert "checksum mismatch" in result.stdout + result.stderr
    assert not (Path(box["RUNNER_HOST_PREFIX"]) / "config.sh").exists()


# ----------------------------------------------------------------- the wrapper


def test_wrapper_holds_cleanly_with_no_token(box, tmp_path):
    """register-and-run.sh must exit 0 (not crash-loop) when no RUNNER_TOKEN
    has been provisioned yet -- the same "hold" state
    gitops/agents/host/host_governor.py sits in on its own auth cooldown.
    """
    run(box)
    prefix = Path(box["RUNNER_HOST_PREFIX"])
    env = {
        "PATH": os.environ["PATH"],
        "GITHUB_REPOSITORY": "Duncan-Haywood/monorepo-projects",
        "RUNNER_HOST_HOME": str(prefix),
        "RUNNER_HOST_WORK": str(prefix / "_work"),
    }
    result = subprocess.run(
        ["bash", str(prefix / "register-and-run.sh")],
        env=env,
        capture_output=True,
        text=True,
        timeout=30,
    )
    assert result.returncode == 0, result.stderr
    assert "no RUNNER_TOKEN" in result.stdout
    assert not (prefix / ".runner").exists()


def test_wrapper_refuses_if_binaries_are_missing(tmp_path):
    """A box whose install never ran (or was interrupted) must fail loudly,
    not fall through to `run.sh` on a directory that has none.
    """
    home = tmp_path / "empty"
    home.mkdir()
    script = REPO / "gitops" / "ci" / "host" / "register-and-run.sh"
    result = subprocess.run(
        ["bash", str(script)],
        env={
            "PATH": os.environ["PATH"],
            "GITHUB_REPOSITORY": "Duncan-Haywood/monorepo-projects",
            "RUNNER_HOST_HOME": str(home),
        },
        capture_output=True,
        text=True,
        timeout=30,
    )
    assert result.returncode == 1
    assert "run install-github-runner-host.sh first" in result.stdout


def test_wrapper_execs_run_sh_once_already_registered(box):
    """Once `.runner` exists, the wrapper must skip straight to `run.sh`
    without touching the network or re-running config.sh.
    """
    run(box)
    prefix = Path(box["RUNNER_HOST_PREFIX"])
    (prefix / ".runner").write_text('{"agentName": "hetzner-host"}\n')
    env = {
        "PATH": os.environ["PATH"],
        "GITHUB_REPOSITORY": "Duncan-Haywood/monorepo-projects",
        "RUNNER_HOST_HOME": str(prefix),
        "RUNNER_HOST_WORK": str(prefix / "_work"),
    }
    result = subprocess.run(
        ["bash", str(prefix / "register-and-run.sh")],
        env=env,
        capture_output=True,
        text=True,
        timeout=30,
    )
    assert result.returncode == 0, result.stderr
    assert "fake run.sh" in result.stdout
