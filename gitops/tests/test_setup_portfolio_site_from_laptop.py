# Execute `bootstrap/scripts/setup-portfolio-site-from-laptop.sh` against a
# stubbed box.
#
# This driver exists because two of the three host-mode routes had a
# one-command laptop installer and the one that *serves the site* did not. The
# obvious way to write it -- copy `setup-codex-host-from-laptop.sh` and swap
# the installer name -- produces a script that strands a fresh box, because the
# site installer does something neither of the other two does: it clones the
# repository during the install.
#
# That gives it two ordering invariants which are invisible in the diff and
# expensive in person, since the first real run happens on a box during an
# outage:
#
#   1. the credential must be written BEFORE the install, or the clone the
#      install performs never sees it;
#   2. `.git` must ride along in the rsync when there is NO token, because the
#      installer's only fallback is to clone the copied tree -- and must be
#      excluded when there is one, because this repository's history is large.
#
# Both are the kind of thing a later edit "tidies" without noticing. Nothing
# here reaches the network: `ssh`, `rsync` and friends are stubs that record
# their arguments and answer the probes the script makes.
from __future__ import annotations

import re
import subprocess
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[2]
SCRIPT = REPO / "bootstrap" / "scripts" / "setup-portfolio-site-from-laptop.sh"
WORKFLOW = REPO / ".github" / "workflows" / "hetzner-gitops-ci.yml"

TOKEN = "github_pat_EXAMPLEdoesnotexist"


@pytest.fixture()
def box(tmp_path: Path):
    """A stubbed Hetzner box, plus a fake ~/.ssh the script may write to."""
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    calls = tmp_path / "calls.log"
    home = tmp_path / "home"
    (home / ".ssh").mkdir(parents=True)

    # The remote command is the last argument. Recording the whole argv is the
    # point: it is what lets a test assert the PAT is NOT in it.
    (bin_dir / "ssh").write_text(
        f"""#!/usr/bin/env bash
printf '%s\\n' "ssh $*" >> "{calls}"
cmd="${{!#}}"

case "$cmd" in
  # The credential arrives on stdin, never in argv. Drain it so the writer's
  # pipe does not break, and record only that it happened.
  *"--credentials"*)
    body="$(cat)"
    printf 'STDIN %s bytes: credentials\\n' "${{#body}}" >> "{calls}"
    exit 0 ;;
  true)        exit 0 ;;
  hostname)    echo stub-box ;;
  *uptime*)    echo " 02:00:00 up 9 days" ;;
  *healthz*)   printf '200' ;;
  *"http://127.0.0.1/"*) printf '200' ;;
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

    # `-F` answers "is this host already known?" -- yes, so the run never
    # reaches the interactive accept prompt.
    (bin_dir / "ssh-keygen").write_text(
        f"""#!/usr/bin/env bash
printf '%s\\n' "ssh-keygen $*" >> "{calls}"
exit 0
"""
    )
    (bin_dir / "ssh-keyscan").write_text("#!/usr/bin/env bash\nexit 0\n")
    (bin_dir / "dig").write_text("#!/usr/bin/env bash\necho 89.167.29.39\n")

    for f in bin_dir.iterdir():
        f.chmod(0o755)

    class Box:
        log_path = calls

        def run(self, *args, **env):
            environ = {
                "PATH": f"{bin_dir}:/usr/bin:/bin",
                "HOME": str(home),
            }
            environ.update({k: str(v) for k, v in env.items()})
            return subprocess.run(
                [str(SCRIPT), *args],
                capture_output=True,
                text=True,
                env=environ,
                timeout=60,
            )

        def log(self) -> str:
            return calls.read_text() if calls.exists() else ""

    return Box()


def _index_of(log: str, needle: str) -> int:
    for i, line in enumerate(log.splitlines()):
        if needle in line:
            return i
    return -1


# --------------------------------------------------------------- ordering


def test_credentials_are_written_before_the_install(box):
    """The install clones the repo; a PAT handed over afterwards is too late."""
    result = box.run(GH_TOKEN=TOKEN)
    assert result.returncode == 0, result.stderr
    log = box.log()

    creds = _index_of(log, "--credentials")
    install = _index_of(log, "CONFIRM=install-portfolio-site-host")
    assert creds >= 0, f"the credential was never written:\n{log}"
    assert install >= 0, f"the installer was never run:\n{log}"
    assert creds < install, (
        "the credential must be written BEFORE the install -- the install "
        "clones the repository and reads GH_TOKEN from the file it finds "
        f"already on disk:\n{log}"
    )


def test_the_token_never_appears_in_argv(box):
    """It travels over ssh's stdin, so it lands in neither history nor `ps`."""
    box.run(GH_TOKEN=TOKEN)
    log = box.log()
    assert TOKEN not in log, (
        "the PAT reached a command line; it must be piped on stdin only:\n" + log
    )
    assert "STDIN" in log, "the credential was never sent on stdin at all"


# ------------------------------------------------------------ the .git rule


def _rsync_line(log: str) -> str:
    line = next((ln for ln in log.splitlines() if ln.startswith("rsync ")), "")
    assert line, f"no rsync was performed:\n{log}"
    return line


def test_git_is_excluded_when_a_token_exists(box):
    box.run(GH_TOKEN=TOKEN)
    assert "--exclude .git" in _rsync_line(box.log())


def test_git_travels_when_there_is_no_token(box):
    """The installer's only fallback is cloning the copied tree."""
    box.run("--no-creds")
    line = _rsync_line(box.log())
    assert "--exclude .git" not in line, (
        "with no PAT the box cannot clone from the origin, so the rsync'd "
        "tree's .git is the only thing left to clone from -- excluding it is "
        "the installer's 'cannot clone ... was .git excluded from the rsync?' "
        f"failure:\n{line}"
    )


def test_no_credential_write_when_creds_are_skipped(box):
    box.run("--no-creds")
    assert "--credentials" not in box.log()


# ------------------------------------------------------------------- tls


def test_tls_without_an_email_refuses_before_touching_the_box(box):
    result = box.run("--tls")
    assert result.returncode != 0
    assert "SITE_TLS_EMAIL" in result.stderr
    assert box.log() == "", (
        "it refused only after reaching the box; the check must come first so "
        "a missing address costs nothing"
    )


def test_tls_runs_after_the_install_and_carries_the_email(box):
    result = box.run("--tls", GH_TOKEN=TOKEN, SITE_TLS_EMAIL="you@example.com")
    assert result.returncode == 0, result.stderr
    log = box.log()

    install = _index_of(log, "CONFIRM=install-portfolio-site-host ./bootstrap")
    tls = _index_of(log, "--tls")
    assert tls >= 0, f"--tls never reached the box:\n{log}"
    assert install < tls, "certbot needs the ACME webroot the install creates"
    assert "SITE_TLS_EMAIL='you@example.com'" in log


# ----------------------------------------------------------------- checking


def test_check_only_changes_nothing(box):
    result = box.run("--check")
    assert result.returncode == 0, result.stderr
    log = box.log()
    assert "rsync " not in log, "--check copied a tree"
    assert "CONFIRM=install-portfolio-site-host" not in log, "--check installed"
    assert "--credentials" not in log, "--check wrote a credential"


def test_it_verifies_through_nginx_rather_than_a_manifest(box):
    """A status code from the server, not a correct reading of a config."""
    box.run(GH_TOKEN=TOKEN)
    log = box.log()
    assert "/healthz" in log
    assert "Host: marisstella.dev" in log


def test_unknown_argument_exits_two(box):
    result = box.run("--wat")
    assert result.returncode == 2
    assert "unknown argument" in result.stderr


def test_help_exits_zero_and_stops_before_the_body(box):
    result = box.run("--help")
    assert result.returncode == 0
    assert "WHY THIS EXISTS" in result.stdout
    assert "set -euo pipefail" not in result.stdout, (
        "the --help sed range overruns the comment block"
    )


# ------------------------------------------------------------- consistency


def test_it_is_in_the_workflow_shellcheck_list():
    """`test_shellcheck_coverage.py` enforces this both ways; assert it here
    too, so a failure names this script rather than a set difference."""
    run = WORKFLOW.read_text()
    assert "bootstrap/scripts/setup-portfolio-site-from-laptop.sh" in run


def test_it_defaults_to_the_box_dns_points_at():
    """157.180.80.188 is the 4 GB agent box; the site belongs on the other."""
    src = SCRIPT.read_text()
    assert re.search(r'BOX_IP="\$\{BOX_IP:-89\.167\.29\.39\}"', src)
