# The three `*-from-laptop.sh` installers must report EVERY missing local tool
# in one run, not stop at the first.
#
# Why this is worth pinning. These three scripts are the owner's entire route
# to the three things the portfolio is blocked on, one script each:
#
#   setup-runner-from-laptop.sh          a self-hosted runner, which ends the
#                                        Actions starvation that has every
#                                        check in this repo arriving red
#   setup-portfolio-site-from-laptop.sh  the site origin on the box
#   setup-codex-host-from-laptop.sh      host-mode Codex dev capacity
#
# All three run during an outage, on whatever machine the owner has to hand,
# and each is the first gate of the one session the recovery gets. Until
# 2026-09-17 each did `command -v "$tool" || die` inside the loop, so a
# machine missing both `rsync` and `ssh-keyscan` reported `rsync`, and only
# after that was installed and the script re-run did it mention the second.
# Missing local tools are the one class of gap knowable before any network
# call, which is exactly why discovering them serially is indefensible: the
# script already has the whole answer when it prints the first line of it.
#
# This is the same defect `bootstrap/restore-cluster.sh` had until its DRY_RUN
# was changed to print the half that needs no SSH first, and CLAUDE.md records
# that one at length -- the general lesson being that a fix instruction which
# itself costs a round trip spends the reader's one session and their trust in
# the next instruction.
#
# Nothing here reaches the network. Each case runs the real script with a PATH
# containing only a hand-built bin directory, so `command -v` genuinely cannot
# find the tools left out of it, and the script dies in its own preflight long
# before it would try to open an SSH connection.
from __future__ import annotations

import os
import shutil
import subprocess
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[2]
SCRIPTS_DIR = REPO / "bootstrap" / "scripts"

# The three installers and the prefix each one's `die()` prints. The prefix is
# asserted so a copied-and-renamed script cannot pass this suite while telling
# the owner it is a different tool than the one they ran.
INSTALLERS = {
    "setup-codex-host-from-laptop.sh": "setup-codex-host",
    "setup-runner-from-laptop.sh": "setup-runner",
    "setup-portfolio-site-from-laptop.sh": "setup-portfolio-site",
}

# Every tool the preflight checks for, and the package that supplies it.
TOOL_PACKAGES = {
    "ssh": "openssh-client",
    "rsync": "rsync",
    "ssh-keygen": "openssh-client",
    "ssh-keyscan": "openssh-client",
}

# What the scripts need from PATH to reach their own preflight at all: the
# interpreter plus the handful of externals the lines above the tool loop use.
# Deliberately NOT any of TOOL_PACKAGES' keys -- each case adds back exactly
# the ones it wants present.
SUPPORT_TOOLS = (
    "bash", "dirname", "pwd", "cat", "sed", "mktemp", "mkdir", "chmod",
    "touch", "rm", "uname", "tr", "grep",
)


def _bin_dir(tmp_path: Path, present: tuple[str, ...]) -> Path:
    """A bin directory holding the support tools plus `present`, nothing else.

    The tools under test are written as inert stubs rather than symlinked to
    the real binaries. Two reasons, and the first is what makes this suite run
    anywhere: `rsync` is genuinely absent from some CI images (it is absent
    from the one this was written on), so a symlink-only helper could not
    construct the "rsync is present" case at all and the dedupe test below
    would silently assert nothing. The second is that the preflight only ever
    asks `command -v`, so a stub is a complete answer -- and one that cannot
    open a connection if a later edit moves real work above the gate.
    """
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    for tool in SUPPORT_TOOLS:
        resolved = shutil.which(tool)
        if resolved:
            (bin_dir / tool).symlink_to(resolved)
    for tool in present:
        stub = bin_dir / tool
        stub.write_text("#!/bin/sh\nexit 0\n")
        stub.chmod(0o755)
    return bin_dir


def _run(script: str, tmp_path: Path, present: tuple[str, ...]):
    """Run one installer's `--check` with a PATH that holds only `present`."""
    bin_dir = _bin_dir(tmp_path, present)
    home = tmp_path / "home"
    (home / ".ssh").mkdir(parents=True)
    return subprocess.run(
        ["bash", str(SCRIPTS_DIR / script), "--check"],
        capture_output=True,
        text=True,
        # A bare PATH is the whole mechanism here: `command -v` answers from it.
        env={**os.environ, "PATH": str(bin_dir), "HOME": str(home)},
        timeout=60,
    )


@pytest.mark.parametrize("script", sorted(INSTALLERS))
def test_every_missing_tool_is_named_in_one_run(script: str, tmp_path: Path):
    """All four absent -> all four named, not just the first."""
    result = _run(script, tmp_path, present=())
    output = result.stdout + result.stderr

    assert result.returncode != 0, (
        f"{script} --check exited 0 with no SSH tooling at all -- a preflight "
        "that cannot proceed must not report success"
    )
    for tool in TOOL_PACKAGES:
        assert tool in output, (
            f"{script} did not name the missing `{tool}`. This is the serial-"
            f"stop regression: it reported only what it hit first.\n{output}"
        )


@pytest.mark.parametrize("script", sorted(INSTALLERS))
def test_two_missing_tools_are_reported_together(script: str, tmp_path: Path):
    """The case that motivated this: `rsync` and `ssh-keyscan` both absent.

    Reporting one of them costs the owner a round trip mid-outage, which is
    the entire cost this test exists to hold down.
    """
    result = _run(script, tmp_path, present=("ssh", "ssh-keygen"))
    output = result.stdout + result.stderr

    assert result.returncode != 0
    assert "rsync" in output and "ssh-keyscan" in output, (
        f"{script} reported only one of the two missing tools:\n{output}"
    )
    # The two that ARE present must not be listed as missing. The check is on
    # the `not on PATH:` line itself rather than the whole output, because the
    # install hint below it legitimately names packages, not binaries.
    missing_line = next(
        (ln for ln in output.splitlines() if "not on PATH:" in ln), ""
    )
    assert missing_line, f"{script} printed no `not on PATH:` line:\n{output}"
    assert " ssh " not in f" {missing_line} ".replace("ssh-keygen", "").replace(
        "ssh-keyscan", ""
    ), f"{script} reported `ssh` missing when it was on PATH:\n{missing_line}"


@pytest.mark.parametrize("script", sorted(INSTALLERS))
def test_the_install_hint_names_packages_and_dedupes_them(
    script: str, tmp_path: Path
):
    """Three of the four tools ship in `openssh-client` -- say it once.

    An owner missing `ssh`, `ssh-keygen` and `ssh-keyscan` has one package to
    install, and a hint that says `openssh-client` three times reads as three
    problems.
    """
    result = _run(script, tmp_path, present=("rsync",))
    output = result.stdout + result.stderr

    assert result.returncode != 0
    assert output.count("openssh-client") == 1, (
        f"{script} repeated `openssh-client` in its install hint -- three "
        f"binaries from one package are one install:\n{output}"
    )
    assert "apt-get install -y openssh-client" in output, (
        f"{script} printed no runnable install line:\n{output}"
    )
    # rsync is present in this case, so it must not appear in the hint.
    assert "apt-get install -y rsync" not in output, (
        f"{script} told the owner to install rsync, which is on PATH:\n{output}"
    )


@pytest.mark.parametrize("script,prefix", sorted(INSTALLERS.items()))
def test_the_failure_names_the_script_the_owner_ran(
    script: str, prefix: str, tmp_path: Path
):
    """`die()`'s prefix must match the script, so a copy cannot misattribute."""
    result = _run(script, tmp_path, present=())
    output = result.stdout + result.stderr
    assert f"{prefix}: not on PATH" in output, (
        f"{script} did not identify itself as `{prefix}`:\n{output}"
    )


@pytest.mark.parametrize("script", sorted(INSTALLERS))
def test_the_preflight_still_checks_all_four_tools(script: str):
    """The loop must not quietly shrink.

    Read from the source rather than from behaviour: a tool dropped from the
    list would make every case above pass while the script sails past a gap
    into a failure the owner meets over SSH instead of on their own machine.
    """
    source = (SCRIPTS_DIR / script).read_text()
    assert "for tool in ssh rsync ssh-keygen ssh-keyscan; do" in source, (
        f"{script}'s preflight tool list changed -- if that is deliberate, "
        "update TOOL_PACKAGES here in the same commit"
    )
    assert 'command -v "$tool" >/dev/null 2>&1 || die' not in source, (
        f"{script} has gone back to dying inside the loop, which is the "
        "serial-stop defect this suite exists to prevent"
    )
