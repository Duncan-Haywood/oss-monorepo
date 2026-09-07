#!/usr/bin/env python3
"""Recompute the `runs-on` count sentence in `gitops/ci/README.md`.

`gitops/ci/README.md` states, in prose, how many `runs-on` lines read the
`CI_RUNNER` switch: "N of the M `runs-on` lines across W workflows now read
this." `gitops/tests/test_ci_runner.py::test_readme_runs_on_count_matches_reality`
asserts that sentence against the workflow tree, so the number cannot drift
unnoticed -- adding any workflow job turns that test red.

That guard works. What it did not do until now is *fix* anything: the failure
named the right number and left a human to hand-edit prose, and that edit has
been made and then re-broken three times (#2713 fixed it at 247/221, #2740
pushed it to 248 the same week; on 2026-09-06 #3516 corrected it to 263/265/230
and #3517 had to correct it again to 264/266/231 hours later, because #3515 had
added a workflow while #3516's branch was open). Two whole pull requests in one
afternoon to retype three integers is a tax on adding CI, which is the opposite
of what the guard is for.

So this script is the fix half. `--check` reports drift without writing, for
callers that only want the exit code; the default rewrites the sentence in
place. It is deliberately the *only* thing it edits.

**It derives the "reads the switch" count independently of the test.** The test
subtracts `DOCKER_DEPENDENT_JOBS`, a hand-maintained allowlist of the two jobs
pinned to `ubuntu-latest`. This script instead counts the `runs-on` values that
literally are the switch expression. The two derivations agree today and are
meant to: if the allowlist ever drifts from what the workflows actually say,
the test fails against this script's number rather than both moving together,
which is the property a shared constant would have destroyed.
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

import yaml

REPO = Path(__file__).resolve().parents[2]
WORKFLOWS = REPO / ".github" / "workflows"
README = REPO / "gitops" / "ci" / "README.md"

# Must stay byte-identical to `RUNS_ON` in gitops/tests/test_ci_runner.py --
# that is the switch expression every non-Docker job is required to carry.
RUNS_ON = "${{ vars.CI_RUNNER || 'ubuntu-latest' }}"

SENTENCE = re.compile(r"(\d+) of the (\d+) `runs-on` lines across (\d+) workflows")

FIX_COMMAND = "python3 gitops/ci/sync_readme_counts.py"


def counts(workflows_dir: Path = WORKFLOWS) -> tuple[int, int, int]:
    """Return (reads_switch, total_runs_on, workflow_count).

    One `runs-on` line per job is the repo's invariant (every job declares one),
    which is why the test counts jobs rather than grepping for the string; this
    mirrors that so the two numbers are comparable.
    """
    paths = sorted(workflows_dir.glob("*.yml"))
    total = 0
    reads_switch = 0
    for path in paths:
        spec = yaml.safe_load(path.read_text()) or {}
        for job in (spec.get("jobs") or {}).values():
            total += 1
            if isinstance(job, dict) and job.get("runs-on") == RUNS_ON:
                reads_switch += 1
    return reads_switch, total, len(paths)


def rewrite(text: str, reads_switch: int, total: int, workflows: int) -> str:
    replacement = f"{reads_switch} of the {total} `runs-on` lines across {workflows} workflows"
    new, n = SENTENCE.subn(replacement, text, count=1)
    if n != 1:
        raise SystemExit(
            "sync_readme_counts: the README's runs-on count sentence was not found. "
            "It was reworded or removed -- fix the sentence or this script, not both silently."
        )
    return new


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check",
        action="store_true",
        help="report drift and exit 1 without writing (default: rewrite in place)",
    )
    args = parser.parse_args(argv)

    reads_switch, total, workflows = counts()
    text = README.read_text()
    match = SENTENCE.search(text)
    if not match:
        print(
            "sync_readme_counts: the README's runs-on count sentence was not found.",
            file=sys.stderr,
        )
        return 2

    stated = (int(match.group(1)), int(match.group(2)), int(match.group(3)))
    actual = (reads_switch, total, workflows)

    if stated == actual:
        print(
            f"gitops/ci/README.md is current: {reads_switch} of {total} "
            f"`runs-on` lines across {workflows} workflows read the switch."
        )
        return 0

    print(
        f"gitops/ci/README.md is stale: it says {stated[0]} of {stated[1]} across "
        f"{stated[2]} workflows; actual is {actual[0]} of {actual[1]} across {actual[2]}."
    )
    if args.check:
        print(f"Run `{FIX_COMMAND}` and commit the result.")
        return 1

    README.write_text(rewrite(text, reads_switch, total, workflows))
    print("Rewrote the sentence. Commit gitops/ci/README.md with your workflow change.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
