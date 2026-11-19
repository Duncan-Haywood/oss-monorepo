#!/usr/bin/env python3
"""Run research projects' own test suites with an interpreter that can import them.

    python3 platform/ci/run_research_tests.py research/marine-hull research/cell-fidelity
    python3 platform/ci/run_research_tests.py --since origin/main      # projects your diff touches
    python3 platform/ci/run_research_tests.py --sample 40 --seed 2026-11-19   # audit main
    python3 platform/ci/run_research_tests.py --list --since origin/main

Why: no CI workflow runs a research project's tests. research-ci.yml builds
the homepage and checks programmes; only the a11y-* projects and a handful of
others have a workflow of their own. On 2026-11-19, 1,049 of 1,083 research
projects had a tests/ folder with test_*.py files, so a research PR is green
whether or not its own suite passes, and only the session's own run checks it.
Sessions that did run them lost time to the interpreter: a bare `python3 -m
unittest discover` errors on import when tests import pytest or numpy (doc
friction 2026-11-17..19: cell-fidelity four times, marine-hull twice, and
research/CLAUDE.md), and "CI covers the rest" was one run's wrong guess.

For each project: the interpreter comes from pyenv.py --for <project>/tests
(third-party imports of the tests plus the nearest pyproject's deps); a
ModuleNotFoundError for a module the project does not hold adds that module
and retries (tests often load experiments/*/run.py by path, whose imports the
scan of tests/ cannot see). Then `<py> -m pytest tests -q` runs from the
project folder with PYTHONPATH=src:. (marine-hull's documented command).

Verdicts: PASS, FAIL (tests ran, some failed or errored), ENV (no interpreter
could be found or a module could not be installed: not the project's fault
until shown otherwise), TIMEOUT, NONE (no test files). Exit 1 if any FAIL or
TIMEOUT, else 0. --since is what `run_workflow_locally.py --for-changes` would
need; this script is standalone so a run can call it directly.
"""
import argparse
import hashlib
import os
import re
import subprocess
import sys
import time

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PYENV = os.path.join(REPO, "platform", "ci", "pyenv.py")
RESEARCH = "research"
MISSING = re.compile(r"No module named '([A-Za-z_][\w.]*)'")
MAX_RETRIES = 3
TAIL_LINES = 15


def has_tests(project: str) -> bool:
    t = os.path.join(REPO, project, "tests")
    return os.path.isdir(t) and any(
        n.startswith("test") and n.endswith(".py") for n in os.listdir(t))


def all_projects() -> list[str]:
    root = os.path.join(REPO, RESEARCH)
    return sorted(f"{RESEARCH}/{n}" for n in os.listdir(root)
                  if not n.startswith(("_", ".")) and os.path.isdir(os.path.join(root, n)))


def project_of(path: str):
    parts = path.split("/")
    if len(parts) >= 3 and parts[0] == RESEARCH and not parts[1].startswith(("_", ".")):
        return f"{RESEARCH}/{parts[1]}"
    return None


def changed_projects(base: str) -> list[str]:
    """Research projects with a file that differs from `base`, committed or not."""
    paths = set()
    for cmd in (["git", "diff", "--name-only", f"{base}...HEAD"],
                ["git", "diff", "--name-only", "HEAD"],
                ["git", "ls-files", "--others", "--exclude-standard", RESEARCH]):
        done = subprocess.run(cmd, cwd=REPO, capture_output=True, text=True)
        if done.returncode != 0 and cmd[1] == "diff" and "..." in cmd[-1]:
            # no merge base in a shallow clone: fall back to a two-dot diff
            done = subprocess.run(["git", "diff", "--name-only", base, "HEAD"],
                                  cwd=REPO, capture_output=True, text=True)
        paths.update(done.stdout.split())
    return sorted({p for p in map(project_of, paths) if p and os.path.isdir(os.path.join(REPO, p))})


def sample(projects: list[str], n: int, seed: str) -> list[str]:
    """`n` projects chosen by hashing seed+name, so a later run can repeat the pick."""
    key = lambda p: hashlib.sha256(f"{seed}:{p}".encode()).hexdigest()
    return sorted(sorted(projects, key=key)[:n])


def holds_module(project: str, module: str) -> bool:
    """True when the missing module is the project's own file or folder."""
    top = module.split(".")[0]
    for base, dirs, files in os.walk(os.path.join(REPO, project)):
        if f"{top}.py" in files or top in dirs:
            return True
    return False


def interpreter(project: str, extra: list[str], timeout: float):
    """(path or None, stderr tail) from pyenv.py --for <project>/tests plus `extra`."""
    cmd = [sys.executable, PYENV, "--for", os.path.join(project, "tests"), *extra]
    try:
        done = subprocess.run(cmd, cwd=REPO, capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        return None, f"pyenv.py timed out after {timeout:.0f} s"
    path = done.stdout.strip().splitlines()[-1] if done.stdout.strip() else ""
    if done.returncode != 0 or not path:
        return None, "\n".join(done.stderr.strip().splitlines()[-3:])
    return path, ""


def run_one(project: str, timeout: float, env_timeout: float) -> dict:
    start = time.monotonic()
    if not has_tests(project):
        return {"project": project, "verdict": "NONE", "seconds": 0.0, "tail": ""}
    extra: list[str] = []
    tail = ""
    for _ in range(MAX_RETRIES + 1):
        py, err = interpreter(project, extra, env_timeout)
        if not py:
            return {"project": project, "verdict": "ENV", "seconds": time.monotonic() - start,
                    "tail": err, "extra": extra}
        cwd = os.path.join(REPO, project)
        env = dict(os.environ, PYTHONDONTWRITEBYTECODE="1",
                   PYTHONPATH=os.pathsep.join(p for p in ("src", ".", os.environ.get("PYTHONPATH", "")) if p))
        try:
            done = subprocess.run([py, "-m", "pytest", "tests", "-q", "-p", "no:cacheprovider",
                                   "--no-header", "-rN"],
                                  cwd=cwd, env=env, capture_output=True, text=True, timeout=timeout)
        except subprocess.TimeoutExpired:
            return {"project": project, "verdict": "TIMEOUT", "seconds": time.monotonic() - start,
                    "tail": f"pytest passed the {timeout:.0f} s limit", "python": py}
        out = done.stdout + done.stderr
        tail = "\n".join(out.strip().splitlines()[-TAIL_LINES:])
        if done.returncode == 0:
            return {"project": project, "verdict": "PASS", "seconds": time.monotonic() - start,
                    "tail": out.strip().splitlines()[-1] if out.strip() else "", "python": py,
                    "extra": extra}
        if done.returncode == 5:  # pytest: no tests collected
            return {"project": project, "verdict": "NONE", "seconds": time.monotonic() - start,
                    "tail": "pytest collected no tests", "python": py}
        missing = sorted({m.split(".")[0] for m in MISSING.findall(out)} - set(extra))
        missing = [m for m in missing if not holds_module(project, m)]
        if not missing:
            break
        extra += missing
    return {"project": project, "verdict": "FAIL", "seconds": time.monotonic() - start,
            "tail": tail, "python": py, "extra": extra}


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("projects", nargs="*", help="research/<slug> folders (or bare slugs)")
    ap.add_argument("--since", metavar="BASE", help="the research projects that differ from BASE")
    ap.add_argument("--sample", type=int, metavar="N", help="N projects with tests, picked by --seed")
    ap.add_argument("--seed", default="0", help="seed for --sample (a date makes it repeatable)")
    ap.add_argument("--timeout", type=float, default=600, help="pytest seconds per project (600)")
    ap.add_argument("--env-timeout", type=float, default=900,
                    help="pyenv.py seconds per attempt (900; a first install can take minutes)")
    ap.add_argument("--list", action="store_true", help="name the projects; run nothing")
    args = ap.parse_args(argv)

    projects = [p.rstrip("/") if p.startswith(RESEARCH + "/") else f"{RESEARCH}/{p}"
                for p in args.projects]
    if args.since:
        projects += changed_projects(args.since)
    if args.sample:
        projects += sample([p for p in all_projects() if has_tests(p)], args.sample, args.seed)
    projects = sorted(set(projects))
    if not projects:
        print("No research projects selected (name some, or pass --since BASE / --sample N).")
        return 0
    if args.list:
        for p in projects:
            print(f"{p}  {'tests' if has_tests(p) else 'no tests'}")
        return 0

    results = []
    for p in projects:
        r = run_one(p, args.timeout, args.env_timeout)
        results.append(r)
        extra = f" (+{', '.join(r['extra'])})" if r.get("extra") else ""
        print(f"{r['verdict']:<8}{r['project']}  {r['seconds']:.0f} s{extra}", flush=True)
        if r["verdict"] in ("FAIL", "TIMEOUT", "ENV") and r["tail"]:
            print("    " + r["tail"].replace("\n", "\n    "), flush=True)
    counts = {v: sum(r["verdict"] == v for r in results)
              for v in ("PASS", "FAIL", "TIMEOUT", "ENV", "NONE")}
    print("research tests: " + ", ".join(f"{n} {v}" for v, n in counts.items() if n)
          + f" of {len(results)} project(s)")
    return 1 if counts["FAIL"] or counts["TIMEOUT"] else 0


if __name__ == "__main__":
    sys.exit(main())
