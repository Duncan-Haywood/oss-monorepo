#!/usr/bin/env python3
"""Find YAML values that a ` #` silently cut short.

In YAML a space followed by `#` starts a comment, even in the middle of an
unquoted value. So `title: Move CMMC (step 4, bet #4)` loads as
`Move CMMC (step 4, bet`, and nothing complains. On 2026-11-27 five
portfolio/work/tasks.yaml titles printed that way in `roadmap_claim.py --bets`
and `workctl.py next`, pay-app-guides' VENTURE.yaml description loaded as
"Free front door for paid bet", and three secrets-inventory notes lost their
PR numbers.

A comment meant as a comment has a space after the `#` (`value  # note`); a
cut value has text right after it (`#4)`, `#18670`). This reports the second
kind: an unquoted scalar whose line goes on with ` #<non-space>`.

Usage:
    python3 platform/ci/check_yaml_cut_values.py [--fix] [PATH ...]

With no PATH it checks every tracked *.yaml and *.yml file. `--fix` wraps a
cut one-line value in double quotes. Exit 0: none found (or all fixed).
Exit 1: findings printed as file:line: value.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parent))
from repo_files import ls_files  # noqa: E402

REPO = Path(__file__).resolve().parents[2]
CUT = re.compile(r"[ \t]+#\S")
# Sensitive files (.github/CODEOWNERS) are fixed in their own reviewed PR, not
# by a sweep; listed here so the check can gate everything else meanwhile.
SKIP = {
    # Its `reason:` values lose "(PR #18780)"-style tails; the gate reads only
    # the rule and path keys, so nothing is mis-matched. A gate file: own PR.
    "platform/ci/adversarial_gate/allowlist.yaml",
}


def cut_values(text: str) -> list[tuple[int, int, str]]:
    """(line, start column, rest of line) per cut plain scalar, 0-based; start -1 if multi-line."""
    try:
        docs = list(yaml.compose_all(text, Loader=yaml.SafeLoader))
    except yaml.YAMLError:
        return []  # unparseable files are another check's job
    lines = text.splitlines()
    out = []
    stack = [d for d in docs if d is not None]
    while stack:
        node = stack.pop()
        if isinstance(node, yaml.MappingNode):
            for k, v in node.value:
                stack += [k, v]
        elif isinstance(node, yaml.SequenceNode):
            stack += node.value
        elif isinstance(node, yaml.ScalarNode) and node.style is None:
            end = node.end_mark
            if end.line < len(lines):
                rest = lines[end.line][end.column:]
                if CUT.match(rest):
                    start = node.start_mark
                    out.append((end.line, start.column if start.line == end.line else -1, rest))
    return sorted(out)


def fix_text(text: str) -> tuple[str, int]:
    """Quote every one-line cut value; return (new text, how many were fixed)."""
    lines = text.split("\n")
    fixed = 0
    for ln, start, _rest in reversed(cut_values(text)):
        if start < 0:
            continue  # a multi-line plain scalar: quote it by hand
        line = lines[ln]
        value = line[start:].rstrip()
        lines[ln] = line[:start] + json.dumps(value, ensure_ascii=False)
        fixed += 1
    return "\n".join(lines), fixed


def tracked_yaml(repo: Path) -> list[str]:
    return [p for p in ls_files(repo, "*.yaml", "*.yml") if p not in SKIP]


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("paths", nargs="*")
    ap.add_argument("--fix", action="store_true", help="quote cut one-line values in place")
    args = ap.parse_args(argv)
    paths = args.paths or tracked_yaml(REPO)
    found = 0
    for rel in paths:
        p = Path(rel) if Path(rel).is_absolute() else REPO / rel
        try:
            text = p.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            continue
        if args.fix:
            text, _ = fix_text(text)
            p.write_text(text, encoding="utf-8")
        for ln, _start, rest in cut_values(text):
            found += 1
            print(f"{rel}:{ln + 1}: value cut at '{rest.strip()[:40]}': "
                  "quote the value; ' #' starts a YAML comment")
    if found:
        print(f"{found} cut value(s). `--fix` quotes the one-line ones.", file=sys.stderr)
        return 1
    print(f"ok: no YAML value cut by ' #' in {len(paths)} file(s)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
