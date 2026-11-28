#!/usr/bin/env python3
"""Fail if a hand-rolled constant-time string compare skips a character.

Why this exists
---------------
The red-team run of 2026-11-28 mutated `platform/billing/server.mjs`, the
Worker that turns Paddle's webhook into a licence key. Changing the signature
compare's loop from `let i = 0` to `let i = 1` (so the first hex digit of
`h1` was never checked) passed every billing test. The same XOR-accumulator
loop is copied into 13 files across the paid products: webhook signatures,
OAuth `state`, unsubscribe and delete tokens, PIN hashes. Only some of those
copies have a test that differs in the first character, so a slip in any of
the others would ship.

Each loop must:

- start at index 0;
- be guarded by a length check (`a.length !== b.length` returning early in
  the few lines above it, or the accumulator seeded with
  `a.length ^ b.length`), since the loop alone compares only a prefix;
- run to `<operand>.length`, or to `Math.min(...)` of the two lengths when the
  accumulator is seeded with the length XOR.

This reads the code, so it holds for every copy at once without a test per
copy. Run it the way CI does (`unwired_checks.py` picks it up):

    python3 platform/ci/check_constant_time_compare.py
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

from repo_files import ls_files

REPO_ROOT = Path(__file__).resolve().parents[2]
SUFFIXES = (".js", ".mjs", ".cjs", ".ts", ".tsx")
SKIP_PARTS = ("node_modules/", "/vendor/", "/dist/", "/plain/")

# `acc |= a.charCodeAt(i) ^ b.charCodeAt(i)`
XOR = re.compile(r"(\w+)\s*\|=\s*([\w.\[\]]+)\.charCodeAt\((\w+)\)\s*\^\s*([\w.\[\]]+)\.charCodeAt\(\3\)")
FOR = re.compile(r"for\s*\(\s*(?:let|var)\s+(\w+)\s*=\s*([^;]+);\s*\1\s*<\s*([^;]+);")
LOOKBACK = 6


def problems_in(text: str, name: str = "<text>") -> list[str]:
    lines = text.splitlines()
    out = []
    for n, line in enumerate(lines):
        m = XOR.search(line)
        if not m:
            continue
        acc, a, idx, b = m.group(1), m.group(2), m.group(3), m.group(4)
        where = f"{name}:{n + 1}"
        loop = None
        for back in range(0, 3):
            if n - back < 0:
                break
            f = FOR.search(lines[n - back])
            if f and f.group(1) == idx:
                loop = (n - back, f)
                break
        if loop is None:
            out.append(f"{where}: XOR compare with no `for (let {idx} = 0; ...)` loop found right above it")
            continue
        at, f = loop
        start, bound = f.group(2).strip(), f.group(3).strip()
        if start != "0":
            out.append(f"{where}: compare loop starts at {idx} = {start}, so characters before it are never checked")
        before = "\n".join(lines[max(0, at - LOOKBACK):at + 1])
        seeded = re.search(rf"\b{re.escape(acc)}\s*=\s*[\w.\[\]]+\.length\s*\^\s*[\w.\[\]]+\.length", before)
        guarded = re.search(r"\.length\s*!==?\s*[\w.\[\]]+\.length", before)
        if not (seeded or guarded):
            out.append(f"{where}: no length check before the compare loop, so a prefix of the secret matches")
        operands = {a, b}
        if bound.startswith("Math.min("):
            if not seeded:
                out.append(f"{where}: loop runs to Math.min(...) but `{acc}` is not seeded with the length XOR")
        elif not any(bound == f"{o}.length" for o in operands):
            out.append(f"{where}: loop runs to `{bound}`, not the full length of `{a}` or `{b}`")
    return out


def main() -> int:
    problems = []
    count = 0
    for rel in ls_files(REPO_ROOT):
        if not rel.endswith(SUFFIXES) or ".min." in rel or any(s in "/" + rel for s in SKIP_PARTS):
            continue
        path = REPO_ROOT / rel
        try:
            text = path.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            continue
        if "charCodeAt" not in text:
            continue
        count += len(XOR.findall(text))
        problems += problems_in(text, rel)
    for p in problems:
        print(p)
    print(f"check_constant_time_compare: {count} compare loop(s), {len(problems)} problem(s)")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
