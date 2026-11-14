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

It also runs each platform/ci/test_*.py file (`python -m unittest <file>` from
platform/ci, one job per file; `--checks-only` skips them). Those tests run in CI
only on the workflows whose path filters name the module, so a change elsewhere
can leave one red on main unseen: #15891 renamed `unwired_checks.run_all` and
test_run_venture_tests.py stayed red until #15894 while this script printed 73/73
(run record 2026-11-14T08:57, P067). All 133 files pass alone in about 187 s of
serial time; with them the whole script took 72 s on an idle 4-core container
(206/206 green, 2026-11-14). One
`unittest discover` over the folder is not used: it also descends into
agent_review/, whose test_review.py imports `review` from its own folder and fails
that way (it has its own workflow), so it reports 1 error that is not a fault.
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
# 2026-11-13: doc_index.py check had been red for days (43 report-tag problems).
EXTRA = [("platform/pages/propose_seo_titles.py", "--check"), ("platform/ci/doc_index.py", "check")]


def label(path):
    """Bare name for platform/ci scripts; repo-relative path for the others, so a red
    line says where the script lives (runs lost time looking for propose_seo_titles.py)."""
    p = Path(path).resolve()
    if p.parent == HERE or not p.is_relative_to(ROOT):
        return p.name
    return str(p.relative_to(ROOT))


TIMED_OUT = 124
TIMEOUT = 300


def is_test(path):
    return Path(path).parent.resolve() == HERE and Path(path).name.startswith("test_")


def command(path, *args):
    """(argv, cwd) for one job: a unit-test file runs under unittest from platform/ci,
    as its CI workflow does (`python3 -m unittest platform/ci/...` from the root fails:
    `platform` shadows the stdlib module)."""
    if is_test(path):
        return [sys.executable, "-m", "unittest", Path(path).stem], HERE
    return [sys.executable, str(path), *args], ROOT


def run(path, *args, timeout=TIMEOUT):
    argv, cwd = command(path, *args)
    try:
        r = subprocess.run(argv, cwd=cwd, capture_output=True, text=True, timeout=timeout)
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


def main(argv=None):
    import argparse
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--checks-only", action="store_true",
                    help="skip the platform/ci/test_*.py unit-test files")
    opts = ap.parse_args(argv)
    site = (ROOT / "_site").is_dir()
    checks = [p for p in sorted(HERE.glob("check_*.py"))
              if p.name not in NEEDS_SITE or (site and p.name == "check_built_site.py")]
    jobs = [(p,) for p in checks] + [(ROOT / "prompts" / "promptctl.py", "validate")] \
        + [(ROOT / p, *a) for p, *a in EXTRA]
    if not opts.checks_only:
        jobs += [(p,) for p in sorted(HERE.glob("test_*.py"))]
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
    tests = sum(1 for j in jobs if is_test(j[0]))
    print(f"{len(results) - len(bad)}/{len(results)} checks pass"
          + (f" ({len(jobs) - tests} checks, {tests} platform/ci test files)" if tests else ""))
    print("DONE", flush=True)
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
