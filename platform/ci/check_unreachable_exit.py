#!/usr/bin/env python3
"""Fail if a URL-checker CLI exits 0 when its target cannot be reached.

Most security and SEO checkers under `ventures/` ship a `check.mjs` (or
`cli/check.mjs`) that their README sells as a CI gate. A gate that passes
when no request completed is worse than none: a dead staging host, a DNS
outage or a typo in the URL turns the build green. Red team 2026-11-12 found
two (dotenv-exposure-check, backup-file-exposure-check) whose READMEs promised
exit 1 "when a request could not be completed at all" and which exited 0.

This runs every CLI whose usage line takes a `<...url>` argument against
http://127.0.0.1:1/ (loopback port 1 refuses the connection at once, offline
and in CI) and requires a non-zero exit. A CLI whose usage takes a hostname
(DNS over HTTPS) is out of scope: it needs the network.

    python3 platform/ci/check_unreachable_exit.py [--root DIR]   # exit 1 if any pass
"""
import argparse
import re
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
USAGE = re.compile(r"Usage: node \S*check\.mjs <([a-z-]*url)>")
DEAD = "http://127.0.0.1:1/"


def url_clis(root):
    """(venture, cli path) for every check.mjs whose usage takes a URL."""
    out = []
    for cli in sorted([*root.glob("ventures/*/check.mjs"), *root.glob("ventures/*/cli/check.mjs")]):
        if USAGE.search(cli.read_text(encoding="utf-8", errors="replace")):
            venture = cli.relative_to(root / "ventures").parts[0]
            out.append((venture, cli))
    return out


def exit_code(cli, timeout=60):
    """The CLI's exit code against the dead URL; None if it hung past `timeout`."""
    try:
        proc = subprocess.run(["node", str(cli), DEAD, "--timeout", "2000"], cwd=cli.parent,
                              capture_output=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        return None
    return proc.returncode


def failures(root):
    clis = url_clis(root)
    with ThreadPoolExecutor(max_workers=8) as pool:
        codes = list(pool.map(lambda vc: exit_code(vc[1]), clis))
    bad = []
    for (venture, cli), code in zip(clis, codes):
        if code == 0:
            bad.append(f"{cli.relative_to(root)}: exit 0 with {DEAD} unreachable "
                       "(a CI gate on it passes when no request completed)")
        elif code is None:
            bad.append(f"{cli.relative_to(root)}: still running after 60 s against {DEAD}")
    return clis, bad


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--root", type=Path, default=ROOT)
    args = ap.parse_args(argv)
    clis, bad = failures(args.root)
    for line in bad:
        print(line)
    print(f"{len(clis)} URL-checker CLI(s) run against {DEAD}; {len(bad)} passed or hung.")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
