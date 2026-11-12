#!/usr/bin/env python3
"""Run every argument-free platform/ci/check_*.py in parallel and list failures.

A live fault on main (a check CI runs that is already red) is the best target
for a run with no open backlog item; `promptctl.py measure` friction text mixes
fixed and live items, this does not. Checks that need a built site
(check_pages_links.py, and check_built_site.py unless `_site/` exists) are skipped; `prompts/promptctl.py validate` and `propose_seo_titles.py --check` are included
(runs keep hitting it red by hand). About 18 s on an idle 4-core container since
check_js_syntax.py stopped starting one node per file (2026-11-12; ~76 s before), minutes under load, so start it with
`run_in_background`; prints one line per check as it finishes and a final DONE line
(so `wait_for.py out.log` works on it); exit 1 if any check fails.

A check that times out in the parallel pass is re-run once alone before it
counts as red, and its line says TIME, not FAIL: run beside a full venture-suite
run (load ~34 on 4 cores), check_js_syntax.py hit the 300 s cap and read like a
real red check (run record 2026-11-11T22:23).
"""
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
NEEDS_SITE = {"check_pages_links.py", "check_built_site.py"}
# Checks outside platform/ci/check_*.py that no PR workflow runs (2026-11-08: a post
# went over the title budget on main unseen). Each is (script path, args).
EXTRA = [("platform/pages/propose_seo_titles.py", "--check")]


def label(path):
    """Bare name for platform/ci scripts; repo-relative path for the others, so a red
    line says where the script lives (runs lost time looking for propose_seo_titles.py)."""
    p = Path(path).resolve()
    return p.name if p.parent == HERE else str(p.relative_to(ROOT))


TIMED_OUT = 124
TIMEOUT = 300


def run(path, *args, timeout=TIMEOUT):
    try:
        r = subprocess.run([sys.executable, str(path), *args], cwd=ROOT, capture_output=True,
                           text=True, timeout=timeout)
        return label(path), r.returncode, (r.stdout + r.stderr).strip()
    except subprocess.TimeoutExpired:
        return label(path), TIMED_OUT, f"timed out after {timeout} s"


def status(rc):
    return "ok  " if rc == 0 else "TIME" if rc == TIMED_OUT else "FAIL"


def rerun_timeouts(jobs, results, runner=run):
    """Re-run, one at a time, the jobs that timed out in the parallel pass.

    A timeout under load says nothing about the check; a solo re-run does. Returns
    the results with each re-run's outcome in place, its output prefixed so a
    reader knows it passed or failed alone."""
    by_name = {label(j[0]): j for j in jobs}
    out = []
    for name, rc, text in results:
        if rc == TIMED_OUT and name in by_name:
            print(f"re-running {name} alone (timed out beside the others)", flush=True)
            name, rc, text = runner(*by_name[name])
            text = f"(re-run alone after a parallel timeout) {text}".strip()
            print(f"{status(rc)} {name} (solo re-run)", flush=True)
        out.append((name, rc, text))
    return out


def main():
    site = (ROOT / "_site").is_dir()
    checks = [p for p in sorted(HERE.glob("check_*.py"))
              if p.name not in NEEDS_SITE or (site and p.name == "check_built_site.py")]
    jobs = [(p,) for p in checks] + [(ROOT / "prompts" / "promptctl.py", "validate")] \
        + [(ROOT / p, *a) for p, *a in EXTRA]
    with ThreadPoolExecutor(max_workers=6) as pool:
        futures = [pool.submit(run, *j) for j in jobs]
        results = []
        for f in as_completed(futures):
            results.append(f.result())
            name, rc, _ = results[-1]
            print(f"{status(rc)} {name} ({len(results)}/{len(jobs)})", flush=True)
    results = sorted(rerun_timeouts(jobs, results))
    bad = [r for r in results if r[1] != 0]
    for name, rc, out in bad:
        print(f"{status(rc)} {name} (exit {rc})\n" + "\n".join(out.splitlines()[-8:]) + "\n")
    print(f"{len(results) - len(bad)}/{len(results)} checks pass")
    print("DONE", flush=True)
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
