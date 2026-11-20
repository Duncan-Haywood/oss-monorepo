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
It also runs the portfolio/**/test_*.py suites no pull-request workflow runs
(unwired_checks.unwired_portfolio_tests; 14 on 2026-11-19, about 13 s serial):
test_no_duplicate_yaml_keys.py was red on main while this printed 279/279.

A run record this session wrote and has not filled yet (`promptctl.py record`
writes `outcome: null`; the master prompt says fill it in last, before merging)
is not a fault on main: when `promptctl.py validate`'s only errors are that
unfilled outcome, on records origin/main does not hold, the line says PEND and
the exit stays 0. venture-preflight runs this script mid-run, so three run
records on 2026-11-14 and 2026-11-15 saw it stop on their own blank record.
"""
import re
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
# check_orphan_pages.py reads _site/ too: with none it passed vacuously ("0
# pages; 0 orphans") in every run, and once run_workflow_locally could build
# pages.yml's _site/ (2026-11-15) a later sweep step failed on that leftover
# build (13 orphans of 3,890 pages), a verdict CI's fresh checkout never sees.
NEEDS_SITE = {"check_pages_links.py", "check_built_site.py", "check_orphan_pages.py"}
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


SKIPPED = "SKIP:"  # unwired_checks.SKIPPED, the prefix run_suite gives a suite it could not run


def is_skip(rc, text):
    return rc == 0 and text.startswith(SKIPPED)


def status(rc):
    return "ok  " if rc == 0 else "TIME" if rc == TIMED_OUT else "FAIL"


UNFILLED = re.compile(r"^error: (prompts/runs/[^:\s]+\.json): outcome must be one of .*"
                      r"\(got None\); fill it in before merging$")


def on_main(path):
    """True when origin/main holds `path`; None when origin/main cannot be read."""
    r = subprocess.run(["git", "ls-tree", "--name-only", "origin/main", "--", path],
                       cwd=ROOT, capture_output=True, text=True)
    return None if r.returncode else bool(r.stdout.strip())


def pending_records(name, rc, text, main_has=on_main):
    """The unfilled run records that alone make `promptctl.py validate` red, or [].

    Only records origin/main does not hold count: an unfilled record that reached
    main is a real fault. When origin/main cannot be read, nothing is excused."""
    if name != "prompts/promptctl.py" or rc in (0, TIMED_OUT):
        return []
    errors = [l for l in text.splitlines() if l.startswith("error:")]
    paths = [m.group(1) for m in map(UNFILLED.match, errors) if m]
    if not errors or len(paths) != len(errors):
        return []
    return paths if all(main_has(p) is False for p in paths) else []


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
    suites = {}
    if not opts.checks_only:
        jobs += [(p,) for p in sorted(HERE.glob("test_*.py"))]
        # portfolio/**/test_*.py no pull-request workflow runs (2026-11-19):
        # test_no_duplicate_yaml_keys.py was red on main while this printed 279/279.
        import unwired_checks
        suites = {label(p): p for p in unwired_checks.unwired_portfolio_tests()}
        jobs += [(p,) for p in suites.values()]

    def job(path, *args):
        # A platform/ci test file of plain pytest functions (18 of 183 on
        # 2026-11-20) runs 0 tests under `python -m unittest`, which Python 3.11
        # calls OK: those lines read "ok" whatever the tests said, and
        # test_friction_rank.py read FAIL once #17828 imported pytest in it.
        # run_suite picks unittest or pytest per file, as CI's sweep does.
        if label(path) in suites or (is_test(path) and not args):
            return unwired_checks.run_suite(path)
        return run(path, *args)

    with ThreadPoolExecutor(max_workers=6) as pool:
        futures = [pool.submit(job, *j) for j in jobs]
        results = []
        for f in as_completed(futures):
            results.append(f.result())
            name, rc, text = results[-1]
            tag = "PEND" if pending_records(name, rc, text) else \
                "SKIP" if is_skip(rc, text) else status(rc)
            print(f"{tag} {name} ({len(results)}/{len(jobs)})", flush=True)
    results = sorted(rerun_timeouts(jobs, results, job))
    pending = {r[0]: pending_records(*r) for r in results}
    for name, paths in pending.items():
        if paths:
            print(f"PEND {name}: this session's unfilled run record ({', '.join(paths)}); "
                  "fill in outcome and the rest before merging, it is not a fault on main")
    bad = [r for r in results if r[1] != 0 and not pending[r[0]]]
    for name, rc, out in bad:
        print(f"{status(rc)} {name} (exit {rc})\n" + "\n".join(out.splitlines()[-8:]) + "\n")
    tests = sum(1 for j in jobs if is_test(j[0]))
    skips = [r[0] for r in results if is_skip(r[1], r[2])]
    if skips:
        print(f"SKIP {len(skips)} suite(s) not run here (pytest or a package missing; "
              "`python3 platform/ci/pyenv.py pytest` finds one): " + ", ".join(skips))
    print(f"{len(results) - len(bad) - len(skips)}/{len(results)} checks pass"
          + (f" ({len(jobs) - tests - len(suites)} checks, {tests} platform/ci test files"
             + (f", {len(suites)} portfolio test files no PR workflow runs" if suites else "")
             + ")" if tests else ""))
    print("DONE", flush=True)
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
