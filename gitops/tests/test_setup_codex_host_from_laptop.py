"""Execute `bootstrap/scripts/setup-codex-host-from-laptop.sh` against a stubbed box.

This driver exists for the `--enable` path added 2026-09-17, and specifically
for its one ordering invariant, which is invisible in a diff and expensive in
person because the first real run happens during an outage:

    the credential must reach the box BEFORE the enable, because
    `install-codex-host.sh` refuses to enable an uncredentialed governor.

Get that order wrong and the flag becomes a no-op that still prints success —
and an enabled-looking governor with nothing to authenticate against wakes every
five minutes, fails, and sits on a six-hour auth cooldown, which from the
outside is indistinguishable from a worker that is running. That is the failure
mode `--enable` exists to prevent, so a test that only asserted "`--enable` ran
the installer" would be asserting the bug.

The second thing pinned here is that the flag is opt-in and the default holds.
Turning on unattended spend is an owner decision taken per box; a later edit
that made enabling the default would be a real regression and is the kind of
thing a passing suite should refuse.

Nothing here reaches the network or a real box: `ssh`, `rsync` and friends are
stubs that record their arguments and answer the probes the script makes.
"""

from __future__ import annotations

import subprocess
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[2]
SCRIPT = REPO / "bootstrap" / "scripts" / "setup-codex-host-from-laptop.sh"

AUTH_JSON = '{"tokens":{"access_token":"EXAMPLEdoesnotexist"}}'
TOKEN = "github_pat_EXAMPLEdoesnotexist"


@pytest.fixture()
def box(tmp_path: Path):
    """A stubbed Hetzner box, plus a fake ~/.ssh the script may read."""
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    calls = tmp_path / "calls.log"
    home = tmp_path / "home"
    (home / ".ssh").mkdir(parents=True)
    # Key discovery looks for something that opens the box; give it one.
    (home / ".ssh" / "id_ed25519").write_text("not-a-real-key\n")
    (home / ".ssh" / "id_ed25519").chmod(0o600)

    # The remote command is the last argument. Recording the whole argv is the
    # point: it is what lets a test assert a credential is NOT in it.
    (bin_dir / "ssh").write_text(
        f"""#!/usr/bin/env bash
printf '%s\\n' "ssh $*" >> "{calls}"
cmd="${{!#}}"

case "$cmd" in
  *"--credentials"*)
    body="$(cat)"
    printf 'STDIN %s bytes: credentials\\n' "${{#body}}" >> "{calls}"
    exit 0 ;;
  true)        exit 0 ;;
  hostname)    echo stub-box ;;
  *uptime*)    echo " 02:00:00 up 9 days" ;;
  *"test -x"*) exit 0 ;;
  *)           exit 0 ;;
esac
"""
    )
    (bin_dir / "rsync").write_text(
        f"""#!/usr/bin/env bash
printf '%s\\n' "rsync $*" >> "{calls}"
exit 0
"""
    )
    (bin_dir / "ssh-keygen").write_text(
        f"""#!/usr/bin/env bash
printf '%s\\n' "ssh-keygen $*" >> "{calls}"
exit 0
"""
    )
    (bin_dir / "ssh-keyscan").write_text("#!/usr/bin/env bash\nexit 0\n")
    (bin_dir / "ssh-add").write_text("#!/usr/bin/env bash\nexit 0\n")

    for f in bin_dir.iterdir():
        f.chmod(0o755)

    class Box:
        def run(self, *args, stdin: str = "", **env):
            environ = {
                "PATH": f"{bin_dir}:/usr/bin:/bin",
                "HOME": str(home),
            }
            environ.update({k: str(v) for k, v in env.items()})
            return subprocess.run(
                [str(SCRIPT), *args],
                capture_output=True,
                text=True,
                input=stdin,
                env=environ,
                timeout=120,
            )

        def log(self) -> str:
            return calls.read_text() if calls.exists() else ""

    return Box()


def _index_of(log: str, needle: str) -> int:
    for i, line in enumerate(log.splitlines()):
        if needle in line:
            return i
    return -1


# ------------------------------------------------------------- the invariant


def test_the_credential_reaches_the_box_before_the_enable(box):
    """`install-codex-host.sh --enable` refuses an uncredentialed governor."""
    result = box.run("--enable", CODEX_AUTH_JSON=AUTH_JSON, GH_TOKEN=TOKEN)
    assert result.returncode == 0, f"{result.stdout}\n{result.stderr}"
    log = box.log()

    creds = _index_of(log, "--credentials")
    enable = _index_of(log, "--enable")
    assert creds >= 0, f"the credential was never written:\n{log}"
    assert enable >= 0, f"--enable never ran on the box:\n{log}"
    assert creds < enable, (
        "the credential must reach the box BEFORE --enable. The installer "
        "refuses to enable an uncredentialed governor, so this order makes the "
        f"flag a no-op that still reports success:\n{log}"
    )


def test_no_credential_is_ever_passed_in_argv(box):
    """Credentials travel over ssh's stdin, so they land in neither history nor ps."""
    box.run("--enable", CODEX_AUTH_JSON=AUTH_JSON, GH_TOKEN=TOKEN)
    log = box.log()
    assert AUTH_JSON not in log, f"the Codex auth JSON appeared in argv:\n{log}"
    assert TOKEN not in log, f"the GitHub PAT appeared in argv:\n{log}"
    assert "STDIN" in log, f"the credential hand-off never happened at all:\n{log}"


# ------------------------------------------------------------- opt-in default


def test_a_plain_run_does_not_enable_anything(box):
    """Unattended spend stays an owner decision taken per box."""
    result = box.run(CODEX_AUTH_JSON=AUTH_JSON, GH_TOKEN=TOKEN)
    assert result.returncode == 0, f"{result.stdout}\n{result.stderr}"
    assert "--enable" not in box.log(), (
        "a run without --enable turned the governor on. Installing and "
        "credentialing are not the same act as authorising unattended spend."
    )


def test_the_env_spelling_works_too(box):
    """`CODEX_ENABLED=1` is how the installer and restore-cluster.sh spell it."""
    result = box.run(CODEX_ENABLED=1, CODEX_AUTH_JSON=AUTH_JSON, GH_TOKEN=TOKEN)
    assert result.returncode == 0, f"{result.stdout}\n{result.stderr}"
    assert "--enable" in box.log(), (
        "CODEX_ENABLED=1 did not enable. A caller driving this from a script "
        "spells it the way install-codex-host.sh and restore-cluster.sh do."
    )


# ------------------------------------------------------------- contradictions


def test_enable_without_credentials_is_refused_up_front(box):
    """Refused before the install, not after it — and with the reason."""
    result = box.run("--enable", "--no-creds")
    assert result.returncode == 2, f"{result.stdout}\n{result.stderr}"
    assert "auth cooldown" in (result.stdout + result.stderr), (
        "the refusal should say WHY: an enabled governor with no credential "
        "loops on a six-hour cooldown and looks like one that is working."
    )
    assert box.log() == "", (
        "nothing should have touched the box — this contradiction is knowable "
        f"before the first ssh:\n{box.log()}"
    )


def test_enable_says_so_when_the_operator_declines_the_credential(box):
    """Asked for, genuinely not done, and said out loud rather than implied."""
    # No credential in the environment and nothing on stdin: the prompt reads
    # empty, so the hand-off is skipped and the enable cannot proceed.
    result = box.run("--enable", stdin="\n\n")
    assert result.returncode == 0, f"{result.stdout}\n{result.stderr}"
    assert "NOT enabled" in result.stdout, (
        "when no credential reached the box the run must say the governor was "
        f"not enabled. Silence here is the failure mode:\n{result.stdout}"
    )
    assert "--enable" not in box.log(), (
        f"--enable was sent to the box with no credential on it:\n{box.log()}"
    )


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__]))
