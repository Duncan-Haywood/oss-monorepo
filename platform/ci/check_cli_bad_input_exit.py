#!/usr/bin/env python3
"""Fail if a gate CLI crashes on bad input with exit 1, the code it reserves for "gate tripped".

About twenty `ventures/*/cli.mjs` (the pricing calculators and a few others)
document their exit codes in the header as

    // Exit 0 ok, 1 over --budget, 2 bad input.

and sell `--budget` as a CI gate. Node exits 1 on an uncaught exception, so a
crash on bad input reads to that gate as "over budget", not as "your command
is wrong". Red team 2026-11-17 found `--months 0` (project() read path[-1])
and a `--prices` file holding `null` both doing that in
search-api-pricing-calculator, and the same template in its siblings.

For each such CLI this builds the smallest valid `compare` command from its
usage line (every required `--flag <n>` set to 10), checks that it exits 0,
then runs it again with each hostile input below and requires exit 2:

    --months 0, --months -1, --months 2.5, --months abc
    --prices <file> holding null, [1], "x", or {"<first provider>": 3}

A CLI whose usage has no `compare` subcommand or whose baseline does not exit 0
is reported as skipped, not failed (the baseline is the venture suite's job).

    python3 platform/ci/check_cli_bad_input_exit.py [--root DIR] [--verbose]   # exit 1 on any crash
"""
import argparse
import json
import re
import subprocess
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HEADER = re.compile(r"^// Exit 0[^\n]*\b1 [^\n]*\b2 (?:bad|usage|invalid)", re.M)
USAGE = re.compile(r"usage: node cli\.mjs compare ([^\n`]*)")
MONTHS = ["0", "-1", "2.5", "abc"]
PRICES = ["null", "[1]", '"x"', None]  # None: {"<first provider>": 3}


def gate_clis(root):
    """(venture, cli path, usage args) for every cli.mjs that documents exit 1 vs 2 and has `compare`."""
    out = []
    for cli in sorted(root.glob("ventures/*/cli.mjs")):
        text = cli.read_text(encoding="utf-8", errors="replace")
        if not HEADER.search(text):
            continue
        m = USAGE.search(text)
        out.append((cli.parent.name, cli, m.group(1) if m else None))
    return out


def required_args(usage):
    """Every `--flag <...>` outside [brackets], set to 10; a bare `--flag` outside brackets is kept as is."""
    depth, outside = 0, []
    for ch in usage:
        if ch == "[":
            depth += 1
        elif ch == "]":
            depth = max(0, depth - 1)
        elif depth == 0:
            outside.append(ch)
    args = []
    for flag, value in re.findall(r"(--[a-z][a-z0-9-]*)(\s+<[^>]*>)?", "".join(outside)):
        args += [flag, "10"] if value else [flag]
    return args


def run(cli, args, timeout=60):
    try:
        r = subprocess.run(["node", str(cli), "compare", *args], capture_output=True, text=True, timeout=timeout)
        return r.returncode, r.stderr
    except subprocess.TimeoutExpired:
        return None, "timed out"


def first_provider(cli):
    m = re.search(r"\b([a-z][a-z0-9_]*)\s*:\s*\{\s*label:", (cli.parent / "engine.mjs").read_text(encoding="utf-8", errors="replace")) if (cli.parent / "engine.mjs").exists() else None
    return m.group(1) if m else "x"


def probe(venture, cli, usage, tmp):
    """(venture, skipped reason or None, [(hostile args, exit code, last stderr line)])."""
    if usage is None:
        return venture, "no compare subcommand", []
    base = required_args(usage)
    code, err = run(cli, base)
    if code != 0:
        return venture, f"baseline {' '.join(base)} exited {code}", []
    cases = []
    if "--months" in usage:
        cases += [["--months", m] for m in MONTHS]
    if "--prices" in usage:
        for i, body in enumerate(PRICES):
            f = Path(tmp) / f"{venture}-{i}.json"
            f.write_text(body if body is not None else json.dumps({first_provider(cli): 3}))
            cases.append(["--prices", str(f)])
    bad = []
    for extra in cases:
        code, err = run(cli, base + extra)
        if code != 2:
            if extra[0] == "--prices":
                extra = ["--prices", Path(extra[1]).read_text()]
            lines = [ln for ln in err.strip().splitlines() if ln.strip()]
            bad.append((extra, code, lines[-1][:160] if lines else ""))
    return venture, None, bad


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--root", type=Path, default=ROOT)
    ap.add_argument("--verbose", action="store_true")
    a = ap.parse_args(argv)
    clis = gate_clis(a.root)
    with tempfile.TemporaryDirectory() as tmp, ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(lambda c: probe(*c, tmp), clis))
    failed = 0
    for venture, skipped, bad in results:
        if skipped:
            if a.verbose:
                print(f"skip {venture}: {skipped}")
            continue
        for extra, code, last in bad:
            failed += 1
            print(f"FAIL {venture}: compare ... {' '.join(extra)} exited {code}, not 2 ({last})")
    probed = sum(1 for _, s, _ in results if not s)
    print(f"{probed} gate CLIs probed, {len(results) - probed} skipped, {failed} bad-input runs did not exit 2")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
