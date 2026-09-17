"""`test_install_codex_host.py` and `test_install_github_runner_host.py` skip
every assertion they contain unless `os.geteuid() == 0` -- both installers do
a real `useradd`, `chown`, and `install -d` against a scratch prefix, which
needs root even off real paths.

No runner in this repository is root. GitHub-hosted `ubuntu-latest` runs
workflow steps as the unprivileged `runner` user, and the self-hosted image
(`gitops/ci/runner.yaml`'s pods and `gitops/ci/host/`'s systemd service alike)
runs `run.sh`/the job as an unprivileged user too. Left to the plain
`pytest gitops/tests -v` step in `hetzner-gitops-ci.yml`, both files report
"skipped" rather than "passed" on every single push, forever -- a step that
stays green while never once exercising the installer it exists to guard.
That is the exact shape CLAUDE.md already records paying for three times over
(`platform/proposal/`, `platform/privacy/`, `platform/webcheck/`): "a guard
going unrun is not usually discovered by a session noticing it is missing --
nobody notices an absence."

The fix lives in the workflow, not here: a second `pytest` step elevates just
these two files with `sudo`, which GitHub-hosted runners carry passwordless
(unlike the self-hosted image, which has neither `apt` nor `sudo` -- see that
workflow's "Install nginx" step). This file is the guard that the elevation
step itself does not quietly disappear -- the same role
`test_it_did_not_skip_on_the_runner_that_is_supposed_to_run_it` plays for the
nginx-dependent serving tests, adapted to a static check because the two
files it watches skip themselves out of this very process when run
unprivileged, so a runtime "did it actually run" assertion inside either of
them would be skipped right along with everything else.
"""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parent
WORKFLOW = REPO / ".github" / "workflows" / "hetzner-gitops-ci.yml"

ROOT_ONLY_FILES = (
    "gitops/tests/test_install_codex_host.py",
    "gitops/tests/test_install_github_runner_host.py",
)


def test_root_only_installer_tests_are_elevated_in_ci():
    text = WORKFLOW.read_text()

    for path in ROOT_ONLY_FILES:
        assert path in text, (
            f"{path} is not referenced anywhere in {WORKFLOW.relative_to(REPO)}. "
            "It skips every test it contains unless run as root, so the plain "
            "`pytest gitops/tests -v` step reports it 'skipped', not 'passed' -- "
            "it needs its own elevated step."
        )

    # Both files must appear together on one `run:` line that starts with
    # `sudo`. Naming them in a comment, or in a step that forgot the prefix,
    # would satisfy the membership check above while still running unprivileged
    # and skipping everything -- the exact failure this test exists to catch.
    run_lines = [
        line.strip()
        for line in text.splitlines()
        if re.match(r"\s*run:\s*sudo\b", line)
    ]
    elevated_line = next(
        (line for line in run_lines if all(path in line for path in ROOT_ONLY_FILES)),
        None,
    )
    assert elevated_line is not None, (
        "no `run: sudo ...` line in "
        f"{WORKFLOW.relative_to(REPO)} names both {ROOT_ONLY_FILES!r}. "
        "GitHub-hosted runners carry passwordless sudo (the self-hosted image "
        "has neither apt nor sudo, per that workflow's 'Install nginx' step); "
        "these two files need it to run as anything but a silent skip."
    )
