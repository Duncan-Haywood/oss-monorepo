#!/usr/bin/env python3
"""Run every argument-free platform/ci/check_*.py in parallel and list failures.

A live fault on main (a check CI runs that is already red) is the best target
for a run with no open backlog item; `promptctl.py measure` friction text mixes
fixed and live items, this does not. Checks that need a built site
(check_pages_links.py) are skipped; `prompts/promptctl.py validate` is included
(runs keep hitting it red by hand). Takes 40 s to 3 min, so start it with
`run_in_background`; each check's result is printed as it finishes (so a
waiting loop sees progress), and exit is 1 if any check fails.
"""
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
NEEDS_SITE = {"check_pages_links.py"}


def run(path, *args):
    try:
        r = subprocess.run([sys.executable, str(path), *args], cwd=ROOT, capture_output=True,
                           text=True, timeout=300)
        return Path(path).name, r.returncode, (r.stdout + r.stderr).strip()
    except subprocess.TimeoutExpired:
        return Path(path).name, 124, "timed out after 300 s"


def main():
    checks = [p for p in sorted(HERE.glob("check_*.py")) if p.name not in NEEDS_SITE]
    jobs = [(p,) for p in checks] + [(ROOT / "prompts" / "promptctl.py", "validate")]
    with ThreadPoolExecutor(max_workers=6) as pool:
        results = []
        for fut in as_completed([pool.submit(run, *j) for j in jobs]):
            name, rc, out = fut.result()
            results.append((name, rc, out))
            if rc == 0:
                print(f"ok   {name}", flush=True)
            else:
                print(f"FAIL {name} (exit {rc})\n" + "\n".join(out.splitlines()[-8:]) + "\n", flush=True)
    bad = [r for r in results if r[1] != 0]
    print(f"{len(results) - len(bad)}/{len(results)} checks pass")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
