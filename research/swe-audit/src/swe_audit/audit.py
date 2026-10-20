"""Re-run a seeded sample of research/ projects and compare with committed output."""
import math
import os
import random
import re
import shutil
import subprocess
import sys
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor

TRACKS = ["selfrep", "ambient", "chip", "robofab", "simdesign", "garment", "eda",
          "accel", "osrobot", "swe", "mimic"]
TIMING = re.compile(r"\b(sec|secs|seconds|ms|time|timing|elapsed|wall|runtime)\b|\d\s?s\b", re.I)
MISSING = re.compile(r"ModuleNotFoundError|No module named|FileNotFoundError|command not found|"
                     r"yosys|openroad|iverilog|verilator|No such file", re.I)


def wilson(k, n, z=1.96):
    if n == 0:
        return (0.0, 1.0)
    p = k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return (max(0.0, c - h), min(1.0, c + h))


def track_of(slug):
    head = slug.split("-")[0]
    return head if head in TRACKS else "other"


def candidates(research_dir):
    """Projects with a runnable experiment and a committed results.txt."""
    out = []
    for slug in sorted(os.listdir(research_dir)):
        d = os.path.join(research_dir, slug)
        if os.path.isfile(os.path.join(d, "experiments", "run.py")) and \
           os.path.isfile(os.path.join(d, "experiments", "results.txt")):
            out.append(slug)
    return out


def sample(slugs, n, seed):
    return sorted(random.Random(seed).sample(slugs, min(n, len(slugs))))


def classify_diff(old, new):
    """'identical', 'timing-only' (every differing line mentions time) or 'differs'."""
    if old == new:
        return "identical", 0
    a, b = old.splitlines(), new.splitlines()
    bad = 0
    timing_only = len(a) == len(b)
    for x, y in zip(a, b):
        if x != y:
            bad += 1
            if not (TIMING.search(x) and TIMING.search(y)):
                timing_only = False
    bad += abs(len(a) - len(b))
    return ("timing-only" if timing_only else "differs"), bad


def classify_failure(text):
    return "tool-missing" if MISSING.search(text) else "crashed"


def run_project(research_dir, slug, timeout):
    """Run experiments/run.py on a temporary copy; return a result dict."""
    src = os.path.join(research_dir, slug)
    tmp = tempfile.mkdtemp(prefix="audit-")
    dst = os.path.join(tmp, slug)
    shutil.copytree(src, dst, ignore=shutil.ignore_patterns("__pycache__", ".git"))
    # Sibling projects stay importable by relative path (some depend on them); the
    # project under audit is the only real copy, so nothing in the repository is written.
    for other in os.listdir(research_dir):
        if other != slug and os.path.isdir(os.path.join(research_dir, other)):
            os.symlink(os.path.join(research_dir, other), os.path.join(tmp, other))
    old = open(os.path.join(dst, "experiments", "results.txt"), errors="replace").read()
    # Own src first, then every sibling's src: several READMEs document a PYTHONPATH that
    # reaches into sibling projects (e.g. ../garment-nesting/src).
    paths = [os.path.join(dst, "src")] + sorted(
        os.path.join(tmp, o, "src") for o in os.listdir(tmp) if o != slug)
    env = dict(os.environ, PYTHONPATH=os.pathsep.join(paths), MPLBACKEND="Agg")
    t0 = time.time()
    err = ""
    try:
        p = subprocess.run([sys.executable, "experiments/run.py"], cwd=dst, env=env,
                           capture_output=True, text=True, timeout=timeout)
        secs = time.time() - t0
        if p.returncode != 0:
            status, nd = classify_failure(p.stdout + p.stderr), 0
            err = (p.stderr.strip().splitlines() or [""])[-1][:120]
        else:
            new = open(os.path.join(dst, "experiments", "results.txt"), errors="replace").read()
            status, nd = classify_diff(old, new)
    except subprocess.TimeoutExpired:
        secs, status, nd = time.time() - t0, "timeout", 0
    shutil.rmtree(tmp, ignore_errors=True)
    return {"slug": slug, "track": track_of(slug), "status": status,
            "diff_lines": nd, "seconds": round(secs, 1), "error": err}


def readme_traceability(research_dir, slug):
    """Share of decimal numbers in the README that occur in committed results files."""
    d = os.path.join(research_dir, slug)
    try:
        readme = open(os.path.join(d, "README.md"), errors="replace").read()
    except OSError:
        return None
    nums = set(re.findall(r"(?<![\w.])\d+\.\d+(?![\w.])", readme))
    if not nums:
        return None
    blob = ""
    ed = os.path.join(d, "experiments")
    for f in os.listdir(ed) if os.path.isdir(ed) else []:
        if f.startswith("results") and f.endswith((".txt", ".json", ".csv")):
            blob += open(os.path.join(ed, f), errors="replace").read()
    found = sum(1 for x in nums if x in blob)
    return found, len(nums)


def audit(research_dir, n, seed, timeout=90, workers=4):
    slugs = sample(candidates(research_dir), n, seed)
    with ThreadPoolExecutor(workers) as ex:
        rows = list(ex.map(lambda s: run_project(research_dir, s, timeout), slugs))
    for r in rows:
        r["readme"] = readme_traceability(research_dir, r["slug"])
    return rows


def summarise(rows):
    n = len(rows)
    ok = sum(r["status"] in ("identical", "timing-only") for r in rows)
    ran = [r for r in rows if r["status"] in ("identical", "timing-only", "differs")]
    ident = sum(r["status"] == "identical" for r in ran)
    return {"n": n, "reproduced": ok, "ran": len(ran), "identical_of_ran": ident,
            "ci_reproduced": wilson(ok, n), "ci_ran_ident": wilson(ident, len(ran))}
