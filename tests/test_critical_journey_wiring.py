"""Binds `docs/QUALITY-ENGINEERING.md`'s critical-journey policy to CI wiring.

The policy sentence this file enforces, from the "End-to-end coverage" section:

    Critical journeys run on every relevant pull request and on the exact
    release candidate.

Until this control existed that sentence was prose and nothing else. The gap it
let through, found 2026-08-16: `ventures/ai-first-markets` carried a complete
critical-journey suite — `playwright.config.ts` with a desktop and a mobile
project, `retries: 0`, trace/video/screenshot retention, and three spec files
covering landing/subscribe, auth and access control, and accessibility — and
**no workflow in the repository ran it**. `.gitea/workflows/ai-first-markets-ci.yml`
had a single `verify` job, and `ai-first-markets-deploy.yml` went straight from
`verify-component.sh` to `npm run deploy` against Cloudflare production. The
suite was authored, reviewed, committed, and inert. Nothing was red, because
nothing was asking.

That is the failure mode this repository keeps producing: a control that is
correct, complete, and on no path anything takes. A suite that no job runs is
indistinguishable — in every report, dashboard and roadmap entry — from a suite
that runs and passes.

**The surface is discovered, not declared.** Every tracked `playwright.config.ts`
enrolls its application automatically. A hardcoded list is how a control comes to
police three applications while a fourth ships unwatched, so adding a journey
suite anywhere in this repository enrolls it here by construction, and there is
no edit that adds a suite without either wiring it or turning this red.
"""

from __future__ import annotations

import re
import subprocess
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent
WORKFLOW_DIR = REPO_ROOT / ".gitea" / "workflows"

# The two shapes that actually execute a Playwright suite. `npm run test:e2e` is
# the convention every venture here uses; the bare binary is accepted so that a
# job invoking Playwright directly still counts as running the journeys.
RUNS_JOURNEYS = re.compile(r"\btest:e2e\b|\bplaywright\s+test\b")

# `npx playwright install` downloads a browser. It matches nothing above on its
# own, and must not be mistaken for running the suite.
INSTALL_ONLY = re.compile(r"playwright\s+install\b")


def tracked_files(*pathspecs: str) -> list[str]:
    """Files git actually tracks.

    Walking the filesystem instead would count an untracked scratch config, a
    build artifact, or another agent's uncommitted work as shipped state.
    """
    result = subprocess.run(
        ["git", "ls-files", "-z", "--", *pathspecs],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=True,
    )
    return [entry for entry in result.stdout.split("\0") if entry]


def journey_applications() -> list[str]:
    """Every application directory carrying a tracked Playwright config."""
    return sorted(
        str(Path(path).parent)
        for path in tracked_files("*playwright.config.ts", "*playwright.config.mjs")
    )


def workflow_sources() -> dict[str, str]:
    return {
        path: (REPO_ROOT / path).read_text(encoding="utf-8")
        for path in tracked_files(".gitea/workflows")
        if path.endswith((".yml", ".yaml"))
    }


def test_the_scan_finds_the_journey_suites_that_are_actually_there() -> None:
    """Anti-vacuity pin.

    A discovery control that collects nothing passes truthfully over everything.
    If `playwright.config.ts` is renamed or the ventures move, this must go red
    rather than silently stop policing every application below.
    """
    applications = journey_applications()

    assert applications, (
        "No tracked playwright.config.ts found anywhere in the repository. "
        "Either every critical-journey suite was deleted — in which case "
        "docs/QUALITY-ENGINEERING.md's end-to-end coverage policy is being "
        "abandoned and that is the thing to argue about — or this control is "
        "looking in the wrong place and is now vacuous."
    )

    expected = {
        "portfolio/marisstella-homepage",
        "ventures/quick-pick-survey",
        "ventures/ai-first-markets",
    }
    missing = expected - set(applications)
    assert not missing, (
        f"Known critical-journey suites were not collected: {sorted(missing)}. "
        "These are the production UIs docs/ENGINEERING-ROADMAP.md names. If one "
        "genuinely moved, point this control at where it went; do not delete the "
        "entry, because an unenrolled application is exactly what this file exists "
        "to prevent."
    )


@pytest.mark.parametrize("application", journey_applications())
def test_every_journey_suite_is_run_by_a_workflow(application: str) -> None:
    """A suite nothing runs is a suite that cannot fail.

    This asserts only that some workflow executes the suite. It deliberately does
    not care which job or which workflow — wiring styles differ across these
    applications, and pinning the shape here would turn a legitimate refactor red
    while catching nothing extra.
    """
    runners = []
    for path, body in workflow_sources().items():
        # Consider only workflows that reference this application at all, so a
        # `test:e2e` belonging to a different venture cannot satisfy this one.
        if application not in body:
            continue
        for number, line in enumerate(body.splitlines(), start=1):
            if INSTALL_ONLY.search(line):
                continue
            if RUNS_JOURNEYS.search(line):
                runners.append(f"{path}:{number}")

    assert runners, (
        f"{application} carries a Playwright critical-journey suite that no "
        f"workflow under .gitea/workflows runs.\n\n"
        "docs/QUALITY-ENGINEERING.md: 'Critical journeys run on every relevant "
        "pull request and on the exact release candidate.' A suite that no job "
        "invokes reports the same green as a suite that runs and passes, so the "
        "policy is satisfied on paper and unenforced in fact.\n\n"
        "Fix by adding a job that runs the suite and that the build or deploy job "
        "depends on — .gitea/workflows/homepage-ci.yml's `journeys` job is the "
        "worked example, including the explicit `npx playwright install` the "
        "`--ignore-scripts` install suppresses."
    )
