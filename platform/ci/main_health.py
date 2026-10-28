#!/usr/bin/env python3
"""Run every argument-free platform/ci/check_*.py in parallel and list failures.

A live fault on main (a check CI runs that is already red) is the best target
for a run with no open backlog item; `promptctl.py measure` friction text mixes
fixed and live items, this does not. Checks that need a built site
(check_pages_links.py, and check_built_site.py unless `_site/` exists) are skipped; `prompts/promptctl.py validate` is included
(runs keep hitting it red by hand). Takes 40 s to 3 min, so start it with
`run_in_background`; prints one line per check as it finishes and a final DONE line
(so `wait_for.py out.log` works on it); exit 1 if any check fails.
"""
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
NEEDS_SITE = {"check_pages_links.py", "check_built_site.py"}


def run(path, *args):
    try:
        r = subprocess.run([sys.executable, str(path), *args], cwd=ROOT, capture_output=True,
                           text=True, timeout=300)
        return Path(path).name, r.returncode, (r.stdout + r.stderr).strip()
    except subprocess.TimeoutExpired:
        return Path(path).name, 124, "timed out after 300 s"


def main():
    site = (ROOT / "_site").is_dir()
    checks = [p for p in sorted(HERE.glob("check_*.py"))
              if p.name not in NEEDS_SITE or (site and p.name == "check_built_site.py")]
    jobs = [(p,) for p in checks] + [(ROOT / "prompts" / "promptctl.py", "validate")]
    with ThreadPoolExecutor(max_workers=6) as pool:
        futures = [pool.submit(run, *j) for j in jobs]
        results = []
        for f in as_completed(futures):
            results.append(f.result())
            name, rc, _ = results[-1]
            print(f"{'ok  ' if rc == 0 else 'FAIL'} {name} ({len(results)}/{len(jobs)})", flush=True)
    results.sort()
    bad = [r for r in results if r[1] != 0]
    for name, rc, out in bad:
        print(f"FAIL {name} (exit {rc})\n" + "\n".join(out.splitlines()[-8:]) + "\n")
    print(f"{len(results) - len(bad)}/{len(results)} checks pass")
    print("DONE", flush=True)
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
