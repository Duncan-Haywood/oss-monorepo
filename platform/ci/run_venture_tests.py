#!/usr/bin/env python3
"""Run `node --test` for many ventures in parallel and print one line each.

This is the venture test step of CI, not a stand-in for it:
`ventures-tests.yml` calls exactly this, so a pass here is the same pass the
runner would report (docs/history/ci-local-first-2026-10-29.md).

    python3 platform/ci/run_venture_tests.py                 # every venture
    python3 platform/ci/run_venture_tests.py slug-a slug-b   # named ventures
    python3 platform/ci/run_venture_tests.py --changed       # vs merge-base with origin/main,
                                                             # uncommitted edits included
    python3 platform/ci/run_venture_tests.py --since BASE    # ventures BASE..HEAD touched (CI)

Each suite runs as `node --test` from the venture's own directory, which is
what the 418 per-venture `<slug>-ci.yml` workflows this replaced ran: Node's
default discovery (`**/*.test.mjs`, `test/**`, ..., never `node_modules`). A
venture that keeps a workflow of its own gets its `*.test.mjs` files only
(see own_workflow_slugs).
An empty or all-zero `--since` (a new branch, a dispatch) means every venture.

Exit 0 when every suite passes (ventures with no tests are skipped), else 1.
"""
import argparse
import functools
import os
import re
import signal
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
VENTURES = ROOT / "ventures"
WORKFLOWS = ROOT / ".github" / "workflows"
NULL_SHA = "0" * 40
# A suite that hangs should fail by name, not eat the whole job's 30 minutes.
# The slowest real suite, changepoint-detector, took over 10 minutes on a
# loaded 4-core container (2026-10-29), so the cap sits well above it.
SUITE_TIMEOUT = 1200
ON_ACTIONS = os.environ.get("GITHUB_ACTIONS") == "true"


def git(*args):
    return subprocess.run(["git", *args], cwd=ROOT, capture_output=True,
                          text=True, check=True).stdout


def has_tests(slug):
    venture = VENTURES / slug
    return venture.is_dir() and any(
        "node_modules" not in p.parts for p in venture.rglob("*.test.mjs"))


def slugs_in(paths):
    return sorted({p.split("/")[1] for p in paths if p.startswith("ventures/") and p.count("/") >= 2})


def since_slugs(base):
    return slugs_in(git("diff", "--name-only", base, "HEAD", "--", "ventures").splitlines())


def changed_slugs(base_ref="origin/main"):
    """Committed, staged, unstaged and untracked changes since the merge base."""
    base = git("merge-base", base_ref, "HEAD").strip()
    paths = git("diff", "--name-only", base, "--", "ventures").splitlines()
    paths += git("ls-files", "--others", "--exclude-standard", "--", "ventures").splitlines()
    return slugs_in(paths)


@functools.lru_cache(maxsize=None)
def own_workflow_slugs():
    """Ventures some other workflow names by path, so it runs their other suites.

    Node's default discovery also finds `*.test.ts`, `test/**` and the like.
    For a venture whose only CI is this runner that is right: it is what its
    removed `<slug>-ci.yml` ran (sponsor-ready's `*.test.js` among them). A
    venture with a workflow of its own (print-atelier, with npm dependencies
    and TypeScript tests) runs those there, so here it gets the `*.test.mjs`
    files only, as `ventures-tests.yml` always gave it.
    """
    slugs = set()
    for wf in WORKFLOWS.glob("*.y*ml"):
        if wf.name != "ventures-tests.yml":
            slugs.update(re.findall(r"ventures/([\w.-]+)/", wf.read_text()))
    return frozenset(slugs)


def command(slug):
    if slug not in own_workflow_slugs():
        return ["node", "--test"]
    venture = VENTURES / slug
    return ["node", "--test", *sorted(
        str(p.relative_to(venture)) for p in venture.rglob("*.test.mjs")
        if "node_modules" not in p.parts)]


def run(slug):
    start = time.monotonic()
    # Its own process group, so a timeout also stops the per-file children
    # `node --test` spawns rather than leaving them running.
    p = subprocess.Popen(command(slug), cwd=VENTURES / slug, stdout=subprocess.PIPE,
                         stderr=subprocess.STDOUT, text=True, start_new_session=True)
    try:
        out, _ = p.communicate(timeout=SUITE_TIMEOUT)
        ok = p.returncode == 0
    except subprocess.TimeoutExpired:
        os.killpg(p.pid, signal.SIGKILL)
        out, _ = p.communicate()
        ok, out = False, f"{out}\ntimed out after {SUITE_TIMEOUT}s"
    return slug, ok, out, time.monotonic() - start


def failures(out, context=30):
    """Each `not ok` block of the TAP output, or the tail when there is none.

    The tail alone can miss the failure entirely: a 198-test suite prints its
    one failing test long before the last 3,000 characters.
    """
    lines = out.splitlines()
    picked = [i for i, line in enumerate(lines) if line.lstrip().startswith("not ok")]
    if not picked:
        return out[-3000:]
    keep = sorted({j for i in picked for j in range(i, min(i + context, len(lines)))})
    return "\n".join(lines[j] for j in keep) + "\n" + "\n".join(
        l for l in lines[-10:] if l.startswith("# "))


def main(argv):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("slugs", nargs="*")
    ap.add_argument("--changed", action="store_true")
    ap.add_argument("--since", metavar="BASE")
    ap.add_argument("--jobs", type=int, default=os.cpu_count() or 2)
    args = ap.parse_args(argv)

    if args.since is not None and args.since.strip("0 "):
        slugs = since_slugs(args.since)
    elif args.changed:
        slugs = changed_slugs()
    elif args.slugs:
        slugs = args.slugs
    else:
        slugs = sorted(d.name for d in VENTURES.iterdir() if d.is_dir())
    slugs = [s for s in slugs if has_tests(s)]

    failed = []
    with ThreadPoolExecutor(max_workers=args.jobs) as pool:
        # Printed as each finishes, so one slow suite does not hide the rest.
        for future in as_completed([pool.submit(run, s) for s in slugs]):
            slug, ok, out, secs = future.result()
            print(f"{'ok  ' if ok else 'FAIL'} {slug} ({secs:.1f}s)", flush=True)
            if not ok:
                failed.append(slug)
                if ON_ACTIONS:
                    print(f"::group::{slug} output\n{out}\n::endgroup::")
                    print(f"::error title=node --test failed::ventures/{slug}")
                else:
                    print(failures(out))
    print(f"{len(slugs)} suites run, {len(failed)} failed"
          + (f": {' '.join(sorted(failed))}" if failed else ""))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
