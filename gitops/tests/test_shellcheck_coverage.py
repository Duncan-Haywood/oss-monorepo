"""Every shell script the cluster bootstrap depends on gets shellchecked.

`bootstrap/scripts/enable-codex-governor.sh` (#3145, 2026-09-03) shipped and
was never added to `hetzner-gitops-ci.yml`'s `scripts` job -- the workflow
triggers on any `bootstrap/**` change, so a session could edit that script,
watch every check go green, and still have shipped a shell bug shellcheck
would have caught (it did: SC2015 on two lines, fixed alongside this test).
No test caught the omission because `test_ci_runner.py`'s shellcheck test
only checks that a job invoking `shellcheck` installs it first -- it says
nothing about which files are named. This closes that gap the same way: by
diffing the filesystem against the workflow's own invocation instead of
letting the list drift again in either direction next time a script is added.
"""

from __future__ import annotations

import re
from pathlib import Path

import yaml

REPO = Path(__file__).resolve().parents[2]
WORKFLOW = REPO / ".github" / "workflows" / "hetzner-gitops-ci.yml"

# Directories whose `.sh` files are the bootstrap/restore/CI-runner surface
# this workflow exists to protect. Not every shell script in the repo belongs
# here -- a venture's own build script is that venture's CI's job -- so this
# is an explicit list of the directories `scripts:`'s own shellcheck line
# already draws from, not "every .sh anywhere".
CHECKED_DIRS = (
    REPO / "bootstrap",
    REPO / "infra" / "scripts",
    REPO / "gitops" / "agents" / "workers",
    REPO / "gitops" / "ci",
    # `platform/pages` holds one script rather than a suite of them, and it is
    # here for the same reason the bootstrap ones are: `publish-branch.sh`
    # writes a branch that GitHub can serve directly to strangers, so a shell
    # bug in it is a publishing bug, not a local inconvenience.
    REPO / "platform" / "pages",
)


def _scripts_job_shellcheck_paths() -> set[Path]:
    spec = yaml.safe_load(WORKFLOW.read_text())
    job = spec["jobs"]["scripts"]
    run = next(
        step["run"] for step in job["steps"] if step.get("name") == "shellcheck"
    )
    # One `shellcheck a b c` invocation, arguments split across lines with a
    # trailing backslash (the first path rides on the same line as the
    # `shellcheck` command itself). `pip install shellcheck-py` is the only
    # other line in this step and never matches `*.sh`.
    paths = re.findall(r"([\w./-]+\.sh)\b", run)
    return {REPO / p for p in paths}


def _scripts_on_disk() -> set[Path]:
    found: set[Path] = set()
    for d in CHECKED_DIRS:
        found.update(d.rglob("*.sh"))
    return found


def test_every_bootstrap_and_ci_script_is_shellchecked() -> None:
    checked = _scripts_job_shellcheck_paths()
    on_disk = _scripts_on_disk()
    missing = sorted(str(p.relative_to(REPO)) for p in on_disk - checked)
    assert not missing, (
        "these .sh files exist but the 'scripts' job in "
        f"{WORKFLOW.relative_to(REPO)} never shellchecks them: {missing}"
    )


def test_the_shellcheck_invocation_names_no_dead_path() -> None:
    """The reverse gap: a path that used to exist and was never removed.

    Shellcheck itself would fail loudly on a missing file, so this is a
    weaker property than the one above -- but it is what keeps the list a
    live inventory instead of accreting cruft nobody reads.
    """
    missing = sorted(
        str(p.relative_to(REPO))
        for p in _scripts_job_shellcheck_paths()
        if not p.is_file()
    )
    assert not missing, f"shellcheck list names a path that does not exist: {missing}"
