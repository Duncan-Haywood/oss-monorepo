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
    # The stub kills its own `sleep` before exiting, and that matters to the
    # harness rather than to the entrypoint. `sleep` inherits this Popen's
    # stdout pipe, so an orphaned one holds the write end open after everything
    # else has exited -- and `communicate()` returns on EOF, not on the child
    # exiting. Leaving it unkilled made the wait below last the full remaining
    # 30s of the sleep against a 30s timeout, so the test passed on about half a
    # second of margin and failed on any loaded runner, reporting "the
    # entrypoint ignored SIGTERM" when the entrypoint had in fact exited
    # promptly.
    (runner["home"] / "run.sh").write_text(
        "#!/usr/bin/env bash\n"
        f"trap 'touch {stopped}; kill \"$SLEEP_PID\" 2>/dev/null; exit 0' TERM\n"
        "sleep 30 &\n"
        "SLEEP_PID=$!\n"
        "wait $SLEEP_PID\n"
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


def test_the_work_tree_is_emptied_before_the_runner_registers(runner) -> None:
    """The second job on a pod used to start on the first job's `_work`.

    `--ephemeral` gets the runner one job, after which this script exits. What
    follows is not a new pod: a Deployment's pods may only set
    `restartPolicy: Always`, so the kubelet restarts the container inside the
    *same* pod. That rebuilds the container filesystem from the image, but
    `/home/runner/_work` is an emptyDir, and surviving container restarts is
    exactly the guarantee emptyDir is documented to give. So job N+1 inherited
    job N's checkout, `_temp` and `_tool` cache -- the "carries the last job's
    leftovers into the next" that both this stack's README and the entrypoint's
    own header say `--ephemeral` prevents. Only the first job after a genuinely
    new pod ever saw a clean tree.

    Order matters as much as deletion, so the stub records what `config.sh`
    could still see when it was called.
    """
    work = runner["home"] / "_work"
    leftover = work / "monorepo-projects" / "node_modules"
    leftover.mkdir(parents=True)
    (work / "_temp").mkdir()
    (work / "_temp" / "job-n-leftovers.txt").write_text("previous job\n")

    (runner["home"] / "config.sh").write_text(
        "#!/usr/bin/env bash\n"
        f'echo "config.sh $*" >> "{runner["calls"]}"\n'
        f'if [ -e "{leftover}" ]; then\n'
        f'  echo "DIRTY: config.sh saw the old work tree" >> "{runner["calls"]}"\n'
        "fi\n"
        "exit 0\n"
    )
    (runner["home"] / "config.sh").chmod(0o755)
    (runner["home"] / "run.sh").write_text("#!/usr/bin/env bash\nexit 0\n")
    (runner["home"] / "run.sh").chmod(0o755)

    proc = subprocess.run(
        ["bash", str(ENTRYPOINT)], env=runner["env"](),
        capture_output=True, text=True, timeout=60,
    )

    assert proc.returncode == 0, proc.stdout + proc.stderr
    calls = _calls(runner["calls"])
    assert not any(c.startswith("DIRTY") for c in calls), (
        "the runner registered before its work tree was cleared:\n" + "\n".join(calls)
    )
    assert not leftover.exists(), "the previous job's checkout survived"
    assert not (work / "_temp").exists(), "the previous job's _temp survived"
    # The directory itself has to stay: in the pod it is a mount point, and
    # `config.sh --work` is pointed straight at it.
    assert work.is_dir()
    config = [c for c in calls if c.startswith("config.sh --url")][0]
    assert f"--work {work}" in config, config


def test_the_work_tree_is_created_when_the_volume_is_brand_new(runner) -> None:
    # A first-ever pod start mounts an empty volume; nothing to clear, and the
    # directory still has to exist before `config.sh --work` names it.
    (runner["home"] / "run.sh").write_text("#!/usr/bin/env bash\nexit 0\n")
    (runner["home"] / "run.sh").chmod(0o755)

    proc = subprocess.run(
        ["bash", str(ENTRYPOINT)], env=runner["env"](),
        capture_output=True, text=True, timeout=60,
    )

    assert proc.returncode == 0, proc.stdout + proc.stderr
    assert (runner["home"] / "_work").is_dir()


def test_an_unclearable_work_tree_refuses_to_register(runner) -> None:
    # Fail closed. A runner that cannot prove it is starting clean must not
    # take a job -- a silently dirty runner produces results that do not
    # reproduce, which is worse than a pod that will not start.
    # Stubbed rather than provoked with a read-only directory: the pod runs as
    # the image's `runner` user, but a test suite run as root would unlink
    # through the mode bits and the case would silently stop being covered.
    work = runner["home"] / "_work"
    (work / "stuck").mkdir(parents=True)
    (runner["bin"] / "find").write_text("#!/usr/bin/env bash\nexit 1\n")
    (runner["bin"] / "find").chmod(0o755)
    (runner["home"] / "run.sh").write_text("#!/usr/bin/env bash\nexit 0\n")
    (runner["home"] / "run.sh").chmod(0o755)

    proc = subprocess.run(
        ["bash", str(ENTRYPOINT)], env=runner["env"](),
        capture_output=True, text=True, timeout=60,
    )

    assert proc.returncode != 0, proc.stdout + proc.stderr
    assert not any(c.startswith("config.sh --url") for c in _calls(runner["calls"])), (
        "the runner registered despite a work tree it could not clear"
    )
    assert "Refusing to register" in proc.stdout + proc.stderr


def test_the_job_exit_status_is_preserved(runner) -> None:
    # The container is restarted either way, but a swallowed failure would
    # make a crash-looping runner look healthy.
    (runner["home"] / "run.sh").write_text("#!/usr/bin/env bash\nexit 7\n")
    (runner["home"] / "run.sh").chmod(0o755)

    proc = subprocess.run(
        ["bash", str(ENTRYPOINT)], env=runner["env"](),
        capture_output=True, text=True, timeout=60,
    )

    assert proc.returncode == 7, proc.stdout + proc.stderr
