"""Re-run every research project's experiment and check it against its committed results.

    python3 research/_audit/repro_audit.py run  --tree DIR --out runs.jsonl [--jobs N] [--timeout S]
    python3 research/_audit/repro_audit.py scan --out scan.jsonl          # README / input census
    python3 research/_audit/repro_audit.py report --runs runs.jsonl --scan scan.jsonl

`run` needs a disposable copy of the repository (`git worktree add DIR origin/main`), because
most `experiments/run.py` scripts overwrite `experiments/results.txt` in place. For each project it
runs `PYTHONPATH=src <python> experiments/run.py` from the project directory, takes the output
(the rewritten `results.txt`, or stdout when the script prints instead) and compares it with the
committed `results.txt`:

- ``exact``      byte-identical after stripping trailing whitespace;
- ``numeric``    same text, every number within 1% (relative) of the committed one;
- ``timing``     differs only on lines that report wall-clock time;
- ``differs``    anything else (the committed numbers are not what the code prints now);
- ``error`` / ``timeout`` / ``missing-dep`` / ``no-runner`` / ``no-results``  could not compare.

`scan` reads each README and the files on disk and records what the inputs are: measured data
checked into the project, data read from the repository itself, or parameters the author chose
(the README's own words: "stylised", "assumed", "synthetic", "toy", ...). Stdlib only.
"""
from __future__ import annotations

import argparse
import concurrent.futures as cf
import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RESEARCH = ROOT / "research"

NUM = re.compile(r"[-+]?(?:\d+\.\d*|\.\d+|\d+)(?:[eE][-+]?\d+)?")
TIMING = re.compile(r"\b(elapsed|wall|seconds|runtime|took|time:|sec\b|ms\b|s\)|\d+(\.\d+)?\s?s\b)", re.I)


def projects(base: Path = RESEARCH) -> list[str]:
    return sorted(p.name for p in base.iterdir()
                  if p.is_dir() and not p.name.startswith(("_", ".")))


def _norm(text: str) -> list[str]:
    return [ln.rstrip() for ln in text.strip().splitlines()]


def compare(committed: str, produced: str, rel: float = 0.01) -> str:
    """Classify how `produced` matches `committed` (see module docstring)."""
    a, b = _norm(committed), _norm(produced)
    if a == b:
        return "exact"
    if len(a) != len(b):
        return "differs"
    numeric_only, timing_only = True, True
    for x, y in zip(a, b):
        if x == y:
            continue
        if NUM.sub("#", x) != NUM.sub("#", y):
            return "differs"
        nx, ny = [float(v) for v in NUM.findall(x)], [float(v) for v in NUM.findall(y)]
        close = all(abs(p - q) <= rel * max(abs(p), abs(q), 1e-12) for p, q in zip(nx, ny))
        if not close:
            numeric_only = False
        if not TIMING.search(x):
            timing_only = False
    if numeric_only:
        return "numeric"
    if timing_only:
        return "timing"
    return "differs"


def _missing(stderr: str) -> str | None:
    m = re.search(r"No module named '([\w.]+)'", stderr)
    if m:
        return m.group(1).split(".")[0]
    m = re.search(r"(?:FileNotFoundError|command not found|No such file or directory)[^\n]*?'?([\w./-]*(yosys|abc|iverilog|verilator|openroad|sta|ngspice|klayout|magic|ccx|gmsh|mujoco)[\w.-]*)'?", stderr, re.I)
    if m:
        return m.group(2).lower()
    return None


CMD = re.compile(r"^[ \t]*((?:PYTHONPATH=\S+[ \t]+)?python3?[ \t]+(?!-m\b)(\S+\.py)(?:[ \t]+[^#>|&;\n]*)?)", re.M)
OUTPUT_EXT = {".txt", ".json", ".jsonl", ".csv", ".tsv"}


def readme_commands(readme: str) -> list[str]:
    """The `python X.py ...` commands a README's code blocks give, minus tests and figures."""
    cmds = []
    for block in re.findall(r"```(?:bash|sh|console)?\n(.*?)```", readme, re.S):
        for m in CMD.finditer(block):
            script = m.group(2)
            if re.search(r"(figure|plot|fig|draw|render|test)\w*\.py$", script):
                continue
            cmds.append(m.group(1).strip())
    seen: list[str] = []
    for c in cmds:
        if c not in seen:
            seen.append(c)
    return seen


def _outputs(d: Path) -> dict[Path, tuple[int, str]]:
    out = {}
    for p in d.rglob("*"):
        rel = p.relative_to(d).parts
        if p.is_file() and p.suffix in OUTPUT_EXT and not set(rel) & {"src", "tests", "data", "rtl", "__pycache__"}:
            if p.stat().st_size <= 5_000_000:
                out[p] = (p.stat().st_mtime_ns, p.read_text(errors="replace"))
    return out


WORST = ["differs", "timing", "numeric", "exact"]


def run_one(tree: Path, slug: str, python: str, timeout: int, readme_mode: bool = False) -> dict:
    d = tree / "research" / slug
    rec: dict = {"slug": slug}
    readme = (d / "README.md").read_text(errors="replace") if (d / "README.md").exists() else ""
    listed = [re.sub(r"\bpython3?\b", python, c, count=1) for c in readme_commands(readme)]
    if (d / "experiments" / "run.py").exists() and not (readme_mode and listed):
        cmds, rec["runner"] = [f"{python} experiments/run.py"], "experiments/run.py"
    else:
        cmds, rec["runner"] = listed, "readme"
    if not cmds:
        rec["outcome"] = "no-runner"
        return rec
    rec["commands"] = len(cmds)
    before = _outputs(d)
    env = dict(os.environ, PYTHONPATH="src", MPLBACKEND="Agg", PYTHONHASHSEED="0")
    t0, stdout = time.time(), ""
    for c in cmds:
        left = timeout - (time.time() - t0)
        if left <= 0:
            rec.update(outcome="timeout", seconds=timeout)
            return rec
        try:
            p = subprocess.run(c, shell=True, cwd=d, env=env, capture_output=True, text=True,
                               timeout=left, errors="replace")
        except subprocess.TimeoutExpired:
            rec.update(outcome="timeout", seconds=timeout)
            return rec
        if p.returncode != 0:
            dep = _missing(p.stderr)
            rec.update(outcome="missing-dep" if dep else "error", dep=dep,
                       seconds=round(time.time() - t0, 1),
                       stderr=p.stderr.strip().splitlines()[-1][:300] if p.stderr.strip() else "")
            return rec
        stdout += p.stdout
    rec["seconds"] = round(time.time() - t0, 1)
    after = _outputs(d)
    rewritten = [f for f in before if f in after and after[f][0] != before[f][0]]
    verdicts = {}
    for f in rewritten:
        verdicts[str(f.relative_to(d))] = compare(before[f][1], after[f][1])
    results = d / "experiments" / "results.txt"
    if not rewritten and results in before and stdout.strip():
        verdicts["experiments/results.txt"] = compare(before[results][1], stdout)
        rec["source"] = "stdout"
    if stdout.strip():
        (d / "experiments").mkdir(exist_ok=True)
        (d / "experiments" / "_audit_stdout.txt").write_text(stdout)
    if not verdicts:
        rec["outcome"] = "ran-nothing-to-compare"
        return rec
    rec["files"] = verdicts
    rec["outcome"] = min(verdicts.values(), key=WORST.index)
    if rec["outcome"] == "differs":
        f = next(k for k, v in verdicts.items() if v == "differs")
        old = before[d / f][1]
        new = after[d / f][1] if d / f in after and after[d / f][0] != before[d / f][0] else stdout
        x, y = _norm(old), _norm(new)
        rec["lines"] = [len(x), len(y)]
        rec["first_diff"] = next(([u[:160], v[:160]] for u, v in zip(x, y) if u != v), None)
    return rec


def cmd_run(args) -> None:
    tree = Path(args.tree).resolve()
    slugs = args.only or projects(tree / "research")
    done = set()
    out = Path(args.out)
    if out.exists():
        done = {json.loads(ln)["slug"] for ln in out.read_text().splitlines() if ln.strip()}
    todo = [s for s in slugs if s not in done]
    with out.open("a") as fh, cf.ThreadPoolExecutor(args.jobs) as ex:
        futs = {ex.submit(run_one, tree, s, args.python, args.timeout, args.readme): s for s in todo}
        for i, f in enumerate(cf.as_completed(futs), 1):
            rec = f.result()
            fh.write(json.dumps(rec) + "\n")
            fh.flush()
            print(f"[{i}/{len(todo)}] {rec['slug']}: {rec['outcome']}", flush=True)


def test_one(base: Path, slug: str, python: str, timeout: int) -> dict:
    d = base / slug
    if not any(d.rglob("test*.py")):
        return {"slug": slug, "tests": "none"}
    env = dict(os.environ, PYTHONPATH="src", MPLBACKEND="Agg")
    t0 = time.time()
    try:
        p = subprocess.run([python, "-m", "pytest", "-q", "-x", "-p", "no:cacheprovider", "."],
                           cwd=d, env=env, capture_output=True, text=True, timeout=timeout,
                           errors="replace")
    except subprocess.TimeoutExpired:
        return {"slug": slug, "tests": "timeout", "seconds": timeout}
    tail = (p.stdout.strip().splitlines() or [""])[-1][:200]
    status = {0: "pass", 1: "fail", 5: "none"}.get(p.returncode, "error")
    if status != "pass" and re.search(r"No module named|ModuleNotFoundError", p.stdout + p.stderr):
        status = "missing-dep"
    return {"slug": slug, "tests": status, "summary": tail, "seconds": round(time.time() - t0, 1)}


def cmd_tests(args) -> None:
    base = Path(args.tree).resolve() / "research"
    slugs = args.only or projects(base)
    with open(args.out, "w") as fh, cf.ThreadPoolExecutor(args.jobs) as ex:
        for i, rec in enumerate(ex.map(lambda s: test_one(base, s, args.python, args.timeout), slugs), 1):
            fh.write(json.dumps(rec) + "\n")
            fh.flush()
            print(f"[{i}/{len(slugs)}] {rec['slug']}: {rec['tests']}", flush=True)


# --- what the inputs are ---------------------------------------------------------------

ASSUMED = re.compile(r"\b(styli[sz]ed|assum(?:ed|ption|e)s?|synthetic|toy|illustrative|hypothetical|"
                     r"made[- ]up|invented|chosen by me|my choice|plausible|not measured|"
                     r"not calibrated|uncalibrated|placeholder)\b", re.I)
SIM = re.compile(r"\b(simulat\w*|monte carlo|seeds?|sampled|random(?:ly)?)\b", re.I)
REAL = re.compile(r"\b(measured|dataset|real[- ]world|real data|published (?:data|figures)|census|"
                  r"survey|snapshot|downloaded|fetched|github api|git log|this repository'?s|"
                  r"ledger|pdk|datasheet)\b", re.I)
DATA_EXT = {".csv", ".jsonl", ".tsv", ".parquet", ".json", ".npz", ".lib", ".v"}


def scan_one(slug: str, base: Path = RESEARCH) -> dict:
    d = base / slug
    readme = (d / "README.md").read_text(errors="replace") if (d / "README.md").exists() else ""
    data_files = [p for p in d.rglob("*") if p.is_file() and p.suffix in DATA_EXT
                  and "src" not in p.parts and "tests" not in p.parts and "rtl" not in p.parts]
    data_bytes = sum(p.stat().st_size for p in data_files)
    head = readme[:4000]
    tests = 0
    for t in d.rglob("test*.py"):
        tests += len(re.findall(r"^\s*def test_", t.read_text(errors="replace"), re.M))
    corpus = ""
    outputs = list((d / "experiments").rglob("*")) + [p for p in d.glob("*") if p.is_file()]
    for p in outputs:
        if p.is_file() and p.suffix in {".txt", ".json", ".jsonl", ".csv", ".tsv"}:
            corpus += p.read_text(errors="replace")[:2_000_000] + "\n"
    claims = claim_numbers(readme)
    return {
        "slug": slug,
        "tests": tests,
        "claim_numbers": len(claims),
        "claim_traced": traced(claims, corpus),
        "has_data_dir": (d / "data").is_dir(),
        "data_files": len(data_files),
        "data_kb": round(data_bytes / 1024),
        "assumed_words": len(ASSUMED.findall(readme)),
        "sim_words": len(SIM.findall(head)),
        "real_words": len(REAL.findall(head)),
        "has_limitations": bool(re.search(r"^#+\s*Limitations", readme, re.M | re.I)),
        "ai_note": bool(re.search(r"AI assistance|Claude", readme)),
        "reviewed_by_expert": bool(re.search(r"reviewed by (a|an) (licensed|domain|human)", readme, re.I)
                                   and not re.search(r"not (been )?reviewed", readme, re.I)),
    }


SKIP = re.compile(r"^(method|methods|reproduce|use it|usage|builds on|outside|owner|next|motivation|"
                  r"limitations|install|how to|setup|files|layout|references|related)", re.I)


def _claim_text(readme: str) -> str:
    """The README minus its method, setup and limitations sections, code and links."""
    keep, on = [], True
    for ln in readme.splitlines():
        h = re.match(r"^#{2,}\s*(.*)", ln)
        if h:
            on = not SKIP.match(h.group(1).strip())
            continue
        if ln.lstrip().startswith(("**Live page", "**Builds on", "**Owner", "**Outside")):
            continue
        if on:
            keep.append(ln)
    text = re.sub(r"```.*?```", " ", "\n".join(keep), flags=re.S)
    return text


CLAIM_NUM = re.compile(r"(?<![\w.-])(\d{1,3}(?:,\d{3})+|\d+\.\d+|\d{2,})(?![\d.]|[a-wyzA-Z_])")


def claim_numbers(readme: str) -> list[str]:
    """Numbers stated in the README's headline and results sections (years and dates dropped)."""
    text = _claim_text(readme)
    text = re.sub(r"`[^`]*`|\(https?://[^)]*\)|<https?://[^>]*>|\[[^\]]*\]\([^)]*\)", " ", text)
    text = re.sub(r"\b(19|20)\d\d(-\d\d){0,2}\b", " ", text)
    return [n for n in (m.replace(",", "") for m in CLAIM_NUM.findall(text)) if specific(n)]


def _forms(n: str) -> set[str]:
    """`n` as written, and as the fraction or percentage it may be printed as."""
    out = {n}
    dec = len(n.split(".")[1]) if "." in n else 0
    v = float(n)
    out.add(f"{v / 100:.{dec + 2}f}")
    if dec >= 2:
        out.add(f"{v * 100:.{dec - 2}f}")
    return out


def specific(n: str) -> bool:
    """A number specific enough that a chance match is unlikely: 3+ significant digits."""
    digits = n.replace(".", "").lstrip("0")
    return len(digits) >= 3 and not re.fullmatch(r"10*|\d0+", digits)


def traced(numbers: list[str], corpus: str) -> int:
    """How many of `numbers` appear (in some plain rendering) in `corpus`."""
    raw = {t.lstrip("+-") for t in NUM.findall(corpus.replace(",", ""))}
    toks = set(raw)
    for t in raw:  # a README rounds 0.93462 to 0.935 or 93.5%
        if "." in t and len(t.split(".")[1]) > 1 and "e" not in t.lower():
            v = float(t)
            for k in range(1, len(t.split(".")[1])):
                toks.add(f"{v:.{k}f}")
    return sum(1 for n in numbers if _forms(n) & toks)


def input_basis(s: dict) -> str:
    """measured / mixed / assumed: where the numbers a project starts from come from."""
    measured = s["has_data_dir"] or s["data_kb"] >= 20 or s["real_words"] >= 3
    if measured and s["assumed_words"] >= 3:
        return "mixed"
    if measured:
        return "measured"
    return "assumed"


def cmd_scan(args) -> None:
    with open(args.out, "w") as fh:
        for s in projects():
            rec = scan_one(s)
            rec["input_basis"] = input_basis(rec)
            fh.write(json.dumps(rec) + "\n")


def _load(path: str) -> dict[str, dict]:
    return {r["slug"]: r for r in map(json.loads, Path(path).read_text().splitlines()) if r}


def cmd_report(args) -> None:
    runs, scan = _load(args.runs), _load(args.scan)
    from collections import Counter
    c = Counter(r["outcome"] for r in runs.values())
    n = len(scan)
    print(f"projects {n}; rerun outcomes:")
    for k, v in c.most_common():
        print(f"  {k:12s} {v:4d}  {100 * v / n:5.1f}%")
    b = Counter(s["input_basis"] for s in scan.values())
    print("input basis:", dict(b))
    cross = Counter((scan[s]["input_basis"], runs.get(s, {}).get("outcome", "?")) for s in scan)
    for k, v in sorted(cross.items()):
        print(f"  {k[0]:9s} {k[1]:12s} {v}")
    deps = Counter(r.get("dep") for r in runs.values() if r["outcome"] == "missing-dep")
    print("missing deps:", dict(deps))


def main(argv=None) -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("run")
    r.add_argument("--tree", required=True)
    r.add_argument("--out", required=True)
    r.add_argument("--jobs", type=int, default=os.cpu_count() or 2)
    r.add_argument("--timeout", type=int, default=600)
    r.add_argument("--python", default=sys.executable)
    r.add_argument("--only", nargs="*")
    r.add_argument("--readme", action="store_true",
                   help="run the README's own python commands even when experiments/run.py exists")
    t = sub.add_parser("tests")
    t.add_argument("--tree", default=str(ROOT))
    t.add_argument("--out", required=True)
    t.add_argument("--jobs", type=int, default=2)
    t.add_argument("--timeout", type=int, default=300)
    t.add_argument("--python", default=sys.executable)
    t.add_argument("--only", nargs="*")
    s = sub.add_parser("scan")
    s.add_argument("--out", required=True)
    p = sub.add_parser("report")
    p.add_argument("--runs", required=True)
    p.add_argument("--scan", required=True)
    args = ap.parse_args(argv)
    {"run": cmd_run, "tests": cmd_tests, "scan": cmd_scan, "report": cmd_report}[args.cmd](args)


if __name__ == "__main__":
    main()
