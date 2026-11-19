#!/usr/bin/env python3
"""Fail when a venture's CI-gate CLI passes a path that does not exist.

    python3 platform/ci/check_cli_missing_path.py          # every gate CLI
    python3 platform/ci/check_cli_missing_path.py --list   # just name them

The repository ships about 40 stdlib checkers (`ventures/*/check.py` and the
copies `ventures/workflow-audit/checks/` vendors) that a stranger wires into
CI with a `--fail-on-risk`-style flag. On 2026-11-19 a red-team run found 33
of 37 printed "No ... found under <path>" and exited 0 when handed a path
that does not exist, so a gate with a typo (`check.py .gihub`) or a moved
directory passed every build, forever. Each was fixed by hand; this check
keeps the next one from shipping: it runs every CLI that takes a positional
path and has a `--fail...` flag against a missing path and fails on exit 0.

`unwired_checks.py` runs it on every pull request that touches `ventures/`
(through `run_venture_tests.py --since`), with no workflow edit. About 3 s.
"""
import argparse
import re
import subprocess
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
POSITIONAL = re.compile(
    r"""add_argument\(\s*["'](?:path|paths|root|dir|directory|target)["']"""
)
FAIL_FLAG = re.compile(r"""["']--fail[-\w]*["']""")
SKIP_PARTS = {"node_modules", "tests", "eval", "fixtures", "__pycache__", ".venv"}


def gate_clis(root=ROOT):
    """Python files under ventures/ that take a positional path and a --fail flag."""
    found = []
    for path in sorted((Path(root) / "ventures").glob("**/*.py")):
        rel = path.relative_to(root)
        if SKIP_PARTS & set(rel.parts) or path.name.startswith("test_") or path.name.endswith("_test.py"):
            continue
        if len(rel.parts) > 4:
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            continue
        if "argparse" in text and POSITIONAL.search(text) and FAIL_FLAG.search(text):
            found.append(path)
    return found


def exits_zero_on_missing_path(script, missing):
    """True when the CLI reports success for a path that does not exist."""
    try:
        done = subprocess.run(
            [sys.executable, str(script), str(missing)],
            cwd=script.parent, capture_output=True, text=True, timeout=60,
        )
    except subprocess.TimeoutExpired:
        return False
    return done.returncode == 0


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--root", default=str(ROOT))
    ap.add_argument("--list", action="store_true", help="name the CLIs and stop")
    args = ap.parse_args(argv)
    root = Path(args.root)
    clis = gate_clis(root)
    if not clis:
        # A wrong --root must not pass as "nothing to check" (test_checks_refuse_empty_root.py).
        print(f"check_cli_missing_path: no venture gate CLI found under {root}; wrong --root?")
        return 2
    if args.list:
        for c in clis:
            print(c.relative_to(root))
        return 0
    with tempfile.TemporaryDirectory() as d:
        missing = Path(d) / "no-such-path"
        with ThreadPoolExecutor(max_workers=8) as pool:
            results = list(pool.map(lambda c: (c, exits_zero_on_missing_path(c, missing)), clis))
    bad = [c for c, zero in results if zero]
    for c in bad:
        print(f"{c.relative_to(root)}: exits 0 on a path that does not exist; "
              "after parse_args add `if not Path(args.path).exists(): sys.exit(f\"path not found: {args.path}\")`")
    print(f"check_cli_missing_path: {len(bad)} of {len(clis)} gate CLI(s) pass a missing path")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
