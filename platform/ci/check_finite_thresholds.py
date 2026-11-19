#!/usr/bin/env python3
"""Fail when a threshold flag (--max-*, --min-*, --threshold*, --fail-under*)
is parsed with a bare `type=float`.

`float()` accepts "nan" and "inf". Every threshold check is a `>` or `<`
comparison, and NaN compares False both ways, so `--max-age-hours nan` or
`--max-order nan` switches its guard off without a word, and `inf` makes it
pass everything. The 2026-11-16 red-team run found three shipped cases:

    coverage-drop-check/check.py          --max-drop inf: a 50-point coverage
                                          drop exited 0 ("within the inf point
                                          allowance"); the browser page already
                                          refused it with Number.isFinite
    agentic-trading-lab (tradelab)        --max-order nan / --max-weight nan
                                          disabled the per-order and per-symbol
                                          risk limits, and a NaN order notional
                                          passed check_orders
    backup-verification-evidence          record --max-age-hours nan wrote NaN
                                          into the record, and a 4-day-old
                                          backup then classified as verified

The fix in each was a small argparse type that rejects non-finite values (or
an explicit math.isfinite check right after parsing, which this check cannot
see: give the flag a named type instead). This check reads every tracked
Python file under ventures/, platform/ and research/ with `ast`, so a new copy
fails the pull request that adds it.

    python3 platform/ci/check_finite_thresholds.py
"""
import ast
import re
import sys
from pathlib import Path
from repo_files import ls_files

ROOT = Path(__file__).resolve().parents[2]
SCOPES = ("ventures", "platform", "research")
FLAG = re.compile(r"^--(max|min|threshold|fail-under)([-_][\w-]*)?$")


def offending_flags(source, filename="<string>"):
    """Yield (line, flag) for each add_argument(--threshold..., type=float)."""
    # A hit needs the attribute `add_argument` and the name `float`, and
    # identifiers are spelled out in the source. 155 of 9,081 tracked files
    # carry both; parsing and walking the rest took about 14 s of every run
    # (docs/history/ci-perf-2026-11-16-research-title-index.md).
    if "add_argument" not in source or "float" not in source:
        return
    try:
        tree = ast.parse(source, filename=filename)
    except SyntaxError:
        return
    for node in ast.walk(tree):
        if not (isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute)
                and node.func.attr == "add_argument"):
            continue
        flags = [a.value for a in node.args if isinstance(a, ast.Constant) and isinstance(a.value, str)]
        flag = next((f for f in flags if FLAG.match(f)), None)
        if flag is None:
            continue
        for kw in node.keywords:
            if kw.arg == "type" and isinstance(kw.value, ast.Name) and kw.value.id == "float":
                yield node.lineno, flag


def tracked_python(root=ROOT):
    return [root / line for line in ls_files(root, *(f"{s}/*.py" for s in SCOPES))]


def main():
    hits = []
    for path in tracked_python():
        try:
            source = path.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            continue
        rel = path.relative_to(ROOT).as_posix()
        hits += [f"{rel}:{line}: {flag} uses type=float, which accepts nan and inf"
                 for line, flag in offending_flags(source, rel)]
    if hits:
        print("check_finite_thresholds: threshold flags that a 'nan' or 'inf' switches off:")
        print("\n".join(f"  {h}" for h in hits))
        print("Give each a type that rejects non-finite values, e.g.\n"
              "  def finite_nonneg(text):\n"
              "      value = float(text)\n"
              "      if not math.isfinite(value) or value < 0:\n"
              "          raise argparse.ArgumentTypeError(f'must be a finite number >= 0, got {text!r}')\n"
              "      return value")
        return 1
    print("check_finite_thresholds: ok, no threshold flag parses with a bare float")
    return 0


if __name__ == "__main__":
    sys.exit(main())
