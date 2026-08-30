# Execute `gitops/ci/runner-entrypoint.sh` against stubbed GitHub APIs.
#
# This entrypoint is what ends the Actions outage: it registers the ephemeral
# self-hosted runner every workflow in this repository will land on once
# `CI_RUNNER` is set. Like the Codex worker, it had only ever been grepped.
#
# Nothing here reaches the network. `curl`, `config.sh` and `run.sh` are stubs
# that record what they were called with.
from __future__ import annotations

import os
import signal
import subprocess
import time
from pathlib import Path

import pytest

ENTRYPOINT = Path(__file__).resolve().parents[1] / "ci" / "runner-entrypoint.sh"


@pytest.fixture()
def runner(tmp_path: Path):
    home = tmp_path / "runner"
    home.mkdir()
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    calls = tmp_path / "calls.log"

    # The real endpoints return {"token": "...", "expires_at": "..."}. The
    # entrypoint reads it with grep/sed because the runner image has no jq, so
    # the stub has to answer in that exact shape for the parse to be exercised.
    (bin_dir / "curl").write_text(
        "#!/usr/bin/env bash\n"
        "url=\"${!#}\"\n"
        f'echo "curl $url" >> "{calls}"\n'
        'case "$url" in\n'
        '  *registration-token) printf \'{"token":"REG-TOKEN","expires_at":"2026-01-01T00:00:00Z"}\' ;;\n'
        '  *remove-token) printf \'{"token":"RM-TOKEN","expires_at":"2026-01-01T00:00:00Z"}\' ;;\n'
        '  *) exit 22 ;;\n'
        "esac\n"
    )
    (bin_dir / "curl").chmod(0o755)

    (home / "config.sh").write_text(
        "#!/usr/bin/env bash\n" f'echo "config.sh $*" >> "{calls}"\n' "exit 0\n"
    )
    (home / "config.sh").chmod(0o755)

    def env() -> dict[str, str]:
        e = dict(os.environ)
        e["PATH"] = f"{bin_dir}:{e['PATH']}"
        e["RUNNER_DIR"] = str(home)
        e["GITHUB_REPOSITORY"] = "o/r"
        e["RUNNER_TOKEN"] = "pat-stub"
        return e

    yield {"home": home, "bin": bin_dir, "calls": calls, "env": env}


def _calls(path: Path) -> list[str]:
    return path.read_text().splitlines() if path.exists() else []


def test_it_registers_with_a_registration_token_and_ephemeral(runner) -> None:
    (runner["home"] / "run.sh").write_text("#!/usr/bin/env bash\nexit 0\n")
    (runner["home"] / "run.sh").chmod(0o755)

    proc = subprocess.run(
        ["bash", str(ENTRYPOINT)], env=runner["env"](),
        capture_output=True, text=True, timeout=60,
    )

    assert proc.returncode == 0, proc.stdout + proc.stderr
    config = [c for c in _calls(runner["calls"]) if c.startswith("config.sh")][0]
    assert "--token REG-TOKEN" in config
    assert "--ephemeral" in config
    assert "--unattended" in config


def test_the_runner_is_deregistered_when_the_job_finishes(runner) -> None:
    """The EXIT trap has to actually run.

    It never did: the entrypoint set `trap cleanup EXIT` and then called
    `exec ./run.sh`, which replaces the shell -- traps and all. Every pod that
    exited without its ephemeral runner having self-deregistered left an
    offline runner listed on the repository, and GitHub keeps dispatching jobs
    to those until somebody prunes them by hand.
    """
    (runner["home"] / "run.sh").write_text("#!/usr/bin/env bash\nexit 0\n")
    (runner["home"] / "run.sh").chmod(0o755)

    subprocess.run(
        ["bash", str(ENTRYPOINT)], env=runner["env"](),
        capture_output=True, text=True, timeout=60,
    )

    calls = _calls(runner["calls"])
    assert any("remove-token" in c for c in calls), (
        "no remove-token was ever requested -- the cleanup trap did not run:\n"
        + "\n".join(calls)
    )
    assert any(c.startswith("config.sh remove --token RM-TOKEN") for c in calls), (
        "the runner was never deregistered:\n" + "\n".join(calls)
    )


def test_sigterm_reaches_the_runner_and_still_deregisters(runner) -> None:
    """Eviction is the case the cleanup was written for, so test that case.

    Kubernetes SIGTERMs the pod on eviction, rollout or drain. The signal must
    reach `run.sh` (so it stops between jobs rather than being killed mid-job)
    and the runner must still be removed from the repository afterwards.
    """
    stopped = runner["home"] / "stopped"
    (runner["home"] / "run.sh").write_text(
        "#!/usr/bin/env bash\n"
        f"trap 'touch {stopped}; exit 0' TERM\n"
        "sleep 30 &\n"
        "wait $!\n"
    )
    (runner["home"] / "run.sh").chmod(0o755)

    proc = subprocess.Popen(
        ["bash", str(ENTRYPOINT)], env=runner["env"](),
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
    )
    # Wait for registration, so the SIGTERM lands while run.sh is up.
    deadline = time.time() + 30
    while time.time() < deadline:
        if any(c.startswith("config.sh --url") for c in _calls(runner["calls"])):
            break
        time.sleep(0.1)
    time.sleep(0.5)

    proc.send_signal(signal.SIGTERM)
    try:
        out = proc.communicate(timeout=30)[0]
    except subprocess.TimeoutExpired:
        proc.kill()
        pytest.fail("the entrypoint ignored SIGTERM and had to be killed")

    assert stopped.exists(), "SIGTERM never reached run.sh:\n" + out
    calls = _calls(runner["calls"])
    assert any(c.startswith("config.sh remove") for c in calls), (
        "an evicted pod left its runner registered:\n" + "\n".join(calls) + "\n" + out
    )


def test_a_missing_registration_token_fails_without_echoing_the_response(runner) -> None:
    # This log is the one place a token could leak, so a failure must not print
    # the API response back.
    (runner["bin"] / "curl").write_text(
        "#!/usr/bin/env bash\nprintf '{\"message\":\"Bad credentials\"}'\n"
    )
    (runner["bin"] / "curl").chmod(0o755)
    (runner["home"] / "run.sh").write_text("#!/usr/bin/env bash\nexit 0\n")
    (runner["home"] / "run.sh").chmod(0o755)

    proc = subprocess.run(
        ["bash", str(ENTRYPOINT)], env=runner["env"](),
        capture_output=True, text=True, timeout=60,
    )

    assert proc.returncode != 0
    assert "Bad credentials" not in proc.stdout + proc.stderr
    assert not any(c.startswith("config.sh --url") for c in _calls(runner["calls"]))


def test_the_job_exit_status_is_preserved(runner) -> None:
    # The Deployment restarts the pod either way, but a swallowed failure would
    # make a crash-looping runner look healthy.
    (runner["home"] / "run.sh").write_text("#!/usr/bin/env bash\nexit 7\n")
    (runner["home"] / "run.sh").chmod(0o755)

    proc = subprocess.run(
        ["bash", str(ENTRYPOINT)], env=runner["env"](),
        capture_output=True, text=True, timeout=60,
    )

    assert proc.returncode == 7, proc.stdout + proc.stderr
