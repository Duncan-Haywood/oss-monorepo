#!/usr/bin/env python3
"""Run the portfolio's own zero-dependency Actions checkers over this
repository's `.github/workflows/`, so a workflow that would fail one of our
published tools cannot merge.

    python3 platform/ci/dogfood_workflows.py          # exit 1 on a new finding
    python3 platform/ci/dogfood_workflows.py --json

The checkers live in `ventures/actions-*-check/check.py`; each prints a JSON
list of findings and takes a repo path. Findings are matched on (checker,
file, type). `ACCEPTED` holds the ones reviewed and kept, with the reason; an
accepted entry that stops matching is reported too, so the list cannot rot.

Measured 2026-10-19 over 536 workflows: these checkers report 0 findings
apart from the accepted ones below (the continue-on-error checker joined 2026-10-27). Not run here: the permissions, runtime-
deprecation and pinned-actions checkers (explicit-permission inventories and
Node 20 notices that report ~1,100 informational rows each, not defects),
and the self-hosted check (577 rows, every runner label is the `CI_RUNNER`
fallback expression).
"""

import argparse
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

# Checkers whose every finding is a defect to fix or consciously accept.
CHECKERS = (
    "actions-timeout-check",
    "actions-injection-check",
    "actions-checkout-credentials-check",
    "actions-secrets-inherit-check",
    "actions-cache-poisoning-check",
    "actions-artifact-poisoning-check",
    "actions-secret-leak-check",
    "actions-schedule-check",
    "actions-continue-on-error-check",
)

# (checker, workflow file, finding type) -> why it stays.
ACCEPTED = {
    ("actions-checkout-credentials-check", ".github/workflows/distribute-homebrew.yml", "checkout-persists-credentials"):
        "the tap checkout carries HOMEBREW_TAP_TOKEN on purpose; the job's `git push` needs it",
    ("actions-checkout-credentials-check", ".github/workflows/research-archive.yml", "checkout-persists-credentials"):
        "the job pushes archive/* branches with the checkout's credential",
    ("actions-continue-on-error-check", ".github/workflows/agent-cross-review.yml", "job-continue-on-error"):
        "the cross-review bots assist and are not a merge gate (CLAUDE.md); one bot's outage must not turn the others red",
    ("actions-continue-on-error-check", ".github/workflows/browser-checks-ci.yml", "step-continue-on-error"):
        "the Chromium install retries once without --with-deps; if it still fails the sweep step after it fails loudly",
    ("actions-continue-on-error-check", ".github/workflows/distribute-shorts.yml", "step-continue-on-error"):
        "the Piper voice is optional narration (commented in the workflow); videos render silent with captions",
}


def run_checker(slug, root=ROOT):
    script = root / "ventures" / slug / "check.py"
    proc = subprocess.run(
        [sys.executable, str(script), str(root), "--format", "json"],
        capture_output=True, text=True, cwd=root, timeout=300,
    )
    if proc.returncode not in (0, 2):
        raise RuntimeError(f"{slug} exited {proc.returncode}: {proc.stderr.strip()[:300]}")
    return json.loads(proc.stdout or "[]")


def key_of(slug, finding, root=ROOT):
    file = Path(finding["file"])
    try:
        file = file.relative_to(root)
    except ValueError:
        pass
    return (slug, file.as_posix(), finding.get("type", ""))


def audit(checkers=CHECKERS, accepted=ACCEPTED, root=ROOT):
    """Returns (new findings, accepted entries that no longer match)."""
    new, seen = [], set()
    for slug in checkers:
        for finding in run_checker(slug, root):
            key = key_of(slug, finding, root)
            if key in accepted:
                seen.add(key)
            else:
                new.append({"checker": slug, **finding})
    stale = sorted(k for k in accepted if k not in seen and k[0] in checkers)
    return new, stale


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args(argv)
    new, stale = audit()
    if args.json:
        print(json.dumps({"new": new, "stale_accepted": [list(k) for k in stale]}, indent=2))
    else:
        for f in new:
            print(f"!! {f['checker']}: {f['file']}:{f.get('line')}  {f.get('type')}\n     {f.get('detail', '')}")
        for k in stale:
            print(f"?? accepted entry no longer matches (remove it from ACCEPTED): {k}")
        if not new and not stale:
            print(f"ok: {len(CHECKERS)} checkers, no unaccepted findings")
    return 1 if new or stale else 0


if __name__ == "__main__":
    sys.exit(main())
