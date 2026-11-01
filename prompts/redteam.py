#!/usr/bin/env python3
"""Red team: seed faults into the repository and measure how many its guards catch.

    python3 prompts/redteam.py targets [--limit N] [--seed S] [--under DIR] [--probe SECONDS]
    python3 prompts/redteam.py campaign [--target FILE | --under DIR] [--mutants 8] [--seed S] [--record RUN.json]
    python3 prompts/redteam.py rerun RUN.json          # blue team: re-run escaped mutants
    python3 prompts/redteam.py tally [RUN.json ...]    # catch rate from run records

A *mutant* is one small, deliberate defect in a source file: a flipped
comparison, `+` for `-`, `true` for `false`, a constant off by one. The
campaign applies one mutant at a time, runs the file's own test suite, and
puts the file back byte for byte. A failing suite **caught** the mutant; a
passing one let it **escape**. The catch rate is the share caught, and it is
the repository's measured answer to "if a session shipped this bug, would
anything notice?".

The red-team sub-prompt (`prompts/redteam/prompt-<n>.md`) says how a run uses
this; the blue half is the run's job, not this tool's: triage every escaped
mutant (a real gap, or an `equivalent` mutant that changes no behaviour), add
the guard that catches each gap, and prove it with `rerun`.

Every number this prints comes from a test run it made. `--record` writes the
campaign into the run record so nobody copies numbers by hand, and
`promptctl.py measure` derives the rates from the mutants themselves.

Standard library only.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
import random
import re
import signal
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

REPO = Path(__file__).resolve().parent.parent

# Trees a red-team run never mutates: generated or vendored trees have no
# suite of their own.
EXCLUDED_PREFIXES = ("node_modules/", "gitops/prod/", ".git/")

TIMEOUT_SECONDS = 300
PROBE_SECONDS = 20  # a random draw skips suites slower than this


# --------------------------------------------------------------------------
# Mutation operators. Each is (name, languages, pattern, replacement). Binary
# operators must be surrounded by spaces, which keeps `<` in HTML template
# strings and `-` in identifiers or CSS out of reach.

@dataclass(frozen=True)
class Operator:
    name: str
    langs: tuple[str, ...]
    pattern: re.Pattern[str]
    replace: Any  # str or callable(match) -> str


def _op(name: str, langs: str, pattern: str, replace: Any) -> Operator:
    return Operator(name, tuple(langs.split()), re.compile(pattern), replace)


OPERATORS: tuple[Operator, ...] = (
    _op("eq-flip", "js", r"(?<= )===(?= )", "!=="),
    _op("neq-flip", "js", r"(?<= )!==(?= )", "==="),
    _op("eq-flip", "py", r"(?<= )==(?= )", "!="),
    _op("neq-flip", "py", r"(?<= )!=(?= )", "=="),
    _op("lt-to-le", "js py", r"(?<= )<(?= )", "<="),
    _op("le-to-lt", "js py", r"(?<= )<=(?= )", "<"),
    _op("gt-to-ge", "js py", r"(?<= )>(?= )", ">="),
    _op("ge-to-gt", "js py", r"(?<= )>=(?= )", ">"),
    _op("plus-to-minus", "js py", r"(?<= )\+(?= )", "-"),
    _op("minus-to-plus", "js py", r"(?<= )-(?= )", "+"),
    _op("times-to-div", "js py", r"(?<= )\*(?= )", "/"),
    _op("div-to-times", "js py", r"(?<= )/(?= )", "*"),
    _op("and-to-or", "js", r"(?<= )&&(?= )", "||"),
    _op("or-to-and", "js", r"(?<= )\|\|(?= )", "&&"),
    _op("and-to-or", "py", r"(?<= )and(?= )", "or"),
    _op("or-to-and", "py", r"(?<= )or(?= )", "and"),
    _op("true-to-false", "js", r"\btrue\b", "false"),
    _op("false-to-true", "js", r"\bfalse\b", "true"),
    _op("true-to-false", "py", r"\bTrue\b", "False"),
    _op("false-to-true", "py", r"\bFalse\b", "True"),
    _op("max-to-min", "js", r"\bMath\.max\b", "Math.min"),
    _op("min-to-max", "js", r"\bMath\.min\b", "Math.max"),
    _op("max-to-min", "py", r"(?<![\w.])max\(", "min("),
    _op("min-to-max", "py", r"(?<![\w.])min\(", "max("),
    _op("const-plus-one", "js py", r"(?<![\w.])(\d+)(?![\w.])",
        lambda m: str(int(m.group(1)) + 1)),
)

SKIP_LINE = re.compile(
    r"^\s*(//|#|\*|/\*|import\b|from\s+\S+\s+import\b|export\s*\{|\"\"\"|'''"
    r"|if __name__ == )")


# Docstrings and block comments, which span lines and change no behaviour.
BLOCK_OPEN = {"py": re.compile(r'^\s*(?:[rbuRBU]{0,2})("""|\'\'\')'),
              "js": re.compile(r"^\s*(/\*)")}
BLOCK_CLOSE = {'"""': '"""', "'''": "'''", "/*": "*/"}


def lang_of(path: Path) -> str | None:
    return {".mjs": "js", ".js": "js", ".py": "py"}.get(path.suffix)


@dataclass(frozen=True)
class Site:
    line: int      # 1-based
    col: int       # 0-based offset of the match in the line
    operator: str
    before: str    # the line as it stands
    after: str     # the line with this one mutation


def _in_string(line: str, col: int) -> bool:
    """Crude: an odd number of unescaped quotes of any kind before col."""
    head = re.sub(r"\\.", "", line[:col])
    return any(head.count(q) % 2 for q in ("'", '"', "`"))


def sites(text: str, lang: str) -> list[Site]:
    """Every place one operator applies, outside comments and string literals."""
    out = []
    in_block = None  # the closing token of a docstring or /* */ comment we are inside
    for n, line in enumerate(text.split("\n"), 1):
        if in_block:
            if in_block in line:
                in_block = None
            continue
        opener = BLOCK_OPEN[lang].match(line)
        if opener:
            close = BLOCK_CLOSE[opener.group(1)]
            if line.count(close) < (2 if close == opener.group(1) else 1):
                in_block = close
            continue
        if SKIP_LINE.match(line) or "redteam: skip" in line:
            continue
        code = line.split("//", 1)[0] if lang == "js" else line.split("  #", 1)[0]
        for op in OPERATORS:
            if lang not in op.langs:
                continue
            for m in op.pattern.finditer(code):
                if _in_string(line, m.start()):
                    continue
                rep = op.replace(m) if callable(op.replace) else op.replace
                after = line[:m.start()] + rep + line[m.end():]
                if after != line:
                    out.append(Site(n, m.start(), op.name, line, after))
    return out


def apply(text: str, site: Site) -> str:
    lines = text.split("\n")
    if lines[site.line - 1] != site.before:
        raise ValueError(f"line {site.line} no longer reads {site.before!r}")
    lines[site.line - 1] = site.after
    return "\n".join(lines)


# --------------------------------------------------------------------------
# Targets: a source file and the command that runs the suite guarding it.


def _has_pytest() -> bool:
    return importlib.util.find_spec("pytest") is not None


def suite_for(path: Path, repo: Path = REPO) -> tuple[list[str], Path] | None:
    """(argv, cwd) for the suite that guards `path`, or None if none does."""
    rel = path.relative_to(repo).as_posix()
    if rel.startswith(EXCLUDED_PREFIXES) or path.name.startswith("test_") \
            or ".test." in path.name or "/tests/" in f"/{rel}":
        return None
    lang = lang_of(path)
    parts = rel.split("/")
    if lang == "js":
        if parts[0] == "ventures" and len(parts) >= 3:
            vdir = repo / "ventures" / parts[1]
            if any(vdir.rglob("*.test.mjs")):
                # node expands the quoted glob itself, so this reaches suites
                # kept in a subdirectory (CLAUDE.md's checklist, same shape).
                return ["node", "--test", f"ventures/{parts[1]}/**/*.test.mjs"], repo
            return None
        sibling = path.with_name(path.stem + ".test.mjs")
        if sibling.is_file():
            return ["node", "--test", sibling.relative_to(repo).as_posix()], repo
        return None
    if lang == "py":
        candidates = [path.with_name(f"test_{path.name}"),
                      path.parent / "tests" / f"test_{path.name}",
                      path.parent.parent / "tests" / f"test_{path.name}"]
        for test in candidates:
            if test.is_file():
                if _has_pytest():
                    return [sys.executable, "-m", "pytest", "-q", "-x", "-p",
                            "no:cacheprovider", test.name], test.parent
                # Without pytest only unittest-style suites can run: a pytest-style
                # file (plain test_ functions) would run zero tests, pass, and make
                # every mutant read as escaped.
                if "unittest.TestCase" not in test.read_text(encoding="utf-8", errors="replace"):
                    return None
                return [sys.executable, "-m", "unittest", test.stem], test.parent
        return None
    return None


def list_targets(repo: Path = REPO, under: str | None = None) -> list[Path]:
    """Guarded files; `under` keeps those below a repo-relative directory prefix."""
    out = []
    tracked = subprocess.run(["git", "ls-files", "*.mjs", "*.js", "*.py"], cwd=repo,
                             capture_output=True, text=True, check=True).stdout.split()
    prefix = under.strip("/") + "/" if under else ""
    for rel in tracked:
        if not rel.startswith(prefix):
            continue
        path = repo / rel
        if path.is_file() and suite_for(path, repo) is not None:
            out.append(path)
    return out


# --------------------------------------------------------------------------
# Running


def run_suite(cmd: list[str], cwd: Path, timeout: int = TIMEOUT_SECONDS) -> tuple[bool, float]:
    """(passed, seconds). A timeout counts as a failure: the suite noticed."""
    start = time.monotonic()
    try:
        # No .pyc written: a same-size mutant's pyc (mtime+size match) would
        # keep serving the mutant after the file is restored.
        env = {**os.environ, "PYTHONDONTWRITEBYTECODE": "1"}
        proc = subprocess.run(cmd, cwd=cwd, capture_output=True, timeout=timeout, env=env)
        passed = proc.returncode == 0
    except subprocess.TimeoutExpired:
        passed = False
    return passed, round(time.monotonic() - start, 1)


def draw_fast_target(pool: list[Path], seed: int, probe: int = PROBE_SECONDS,
                     tries: int = 6) -> Path:
    """The seeded random draw, redrawn (up to `tries`) past suites slower than `probe`
    seconds: a campaign runs the suite once per mutant, so a slow suite wastes the run."""
    rng = random.Random(seed)
    for _ in range(tries):
        target = rng.choice(pool)
        suite = suite_for(target) if probe else None
        if suite is None:
            return target
        _, secs = run_suite(*suite, probe)
        if secs < probe:
            return target
        print(f"skipping {target.relative_to(REPO)}: suite slower than {probe}s",
              file=sys.stderr)
    return target


def _commit(repo: Path) -> str | None:
    proc = subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=repo,
                          capture_output=True, text=True)
    return proc.stdout.strip() or None


def _dirty(path: Path, repo: Path) -> bool:
    proc = subprocess.run(["git", "status", "--porcelain", "--", str(path)], cwd=repo,
                          capture_output=True, text=True)
    return bool(proc.stdout.strip())


def campaign(target: Path, mutants: int, seed: int, repo: Path = REPO,
             timeout: int = TIMEOUT_SECONDS) -> dict[str, Any]:
    found = suite_for(target, repo)
    if found is None:
        raise SystemExit(f"{target}: no suite guards this file; pick another target")
    cmd, cwd = found
    if _dirty(target, repo):
        raise SystemExit(f"{target}: has uncommitted changes; commit or stash them first")
    lang = lang_of(target)
    assert lang is not None
    original = target.read_bytes()
    text = original.decode()

    ok, base_seconds = run_suite(cmd, cwd, timeout)
    if not ok and base_seconds >= timeout:
        raise SystemExit(f"baseline timed out after {timeout}s: `{' '.join(cmd)}` may be slow, "
                         "not red. Re-run with a larger --timeout before calling it a defect.")
    if not ok:
        raise SystemExit(f"baseline is red: `{' '.join(cmd)}` fails on the unmutated tree. "
                         "That is a real defect: fix it (blue team) before measuring.")

    pool = sites(text, lang)
    n = min(mutants, len(pool))
    print(f"baseline green in {base_seconds}s; {n} mutants will take about "
          f"{round(base_seconds * n / 60, 1)} min. If a slow suite makes you kill this, "
          "run `git status` afterwards: a suite may rewrite tracked files outside the target.",
          file=sys.stderr)
    rng = random.Random(seed)
    chosen = sorted(rng.sample(pool, min(mutants, len(pool))), key=lambda s: (s.line, s.col))
    results = []
    # A tool-timeout kill is SIGTERM, which skips `finally` unless it raises.
    old_term = signal.signal(signal.SIGTERM, lambda *_: sys.exit(143))
    try:
        for i, site in enumerate(chosen, 1):
            target.write_text(apply(text, site))
            passed, seconds = run_suite(cmd, cwd, timeout)
            target.write_bytes(original)
            results.append({
                "file": target.relative_to(repo).as_posix(), "line": site.line,
                "col": site.col, "operator": site.operator,
                "before": site.before.strip(), "after": site.after.strip(),
                "line_text": site.before, "caught": not passed, "seconds": seconds,
                "triage": None, "caught_after_fix": None, "note": "",
            })
            print(f"  [{i}/{len(chosen)}] line {site.line} {site.operator}: "
                  f"{'caught' if not passed else 'ESCAPED'} ({seconds}s)", file=sys.stderr)
    finally:
        signal.signal(signal.SIGTERM, old_term)
        target.write_bytes(original)
    if target.read_bytes() != original:
        raise SystemExit(f"{target}: could not restore the original; check `git diff`")
    return {
        "target": target.relative_to(repo).as_posix(),
        "test": " ".join(cmd) + (f"  (in {cwd.relative_to(repo).as_posix() or '.'})"),
        "seed": seed, "commit": _commit(repo), "sites": len(pool),
        "baseline_seconds": base_seconds, "mutants": results,
    }


def rerun(record_path: Path, repo: Path = REPO, timeout: int = TIMEOUT_SECONDS) -> dict[str, Any]:
    """Re-apply every escaped, non-equivalent mutant and set `caught_after_fix`."""
    rec = json.loads(record_path.read_text())
    for camp in (rec.get("redteam") or {}).get("campaigns", []):
        for m in camp["mutants"]:
            if m["caught"] or m.get("triage") == "equivalent":
                continue
            target = repo / m["file"]
            found = suite_for(target, repo)
            if found is None or not target.is_file():
                m["caught_after_fix"] = None
                m["note"] = (m.get("note") or "") + " [rerun: target or suite gone]"
                continue
            original = target.read_bytes()
            lines = original.decode().split("\n")
            # The blue team may have edited the file, so find the line by its
            # text, nearest the original line number.
            hits = [i for i, l in enumerate(lines, 1) if l == m["line_text"]]
            if not hits:
                m["caught_after_fix"] = None
                m["note"] = (m.get("note") or "") + " [rerun: line changed; triage by hand]"
                continue
            line = min(hits, key=lambda i: abs(i - m["line"]))
            site = next((s for s in sites(original.decode(), lang_of(target) or "")
                         if s.line == line and s.col == m["col"]
                         and s.operator == m["operator"]), None)
            if site is None:
                m["caught_after_fix"] = None
                m["note"] = (m.get("note") or "") + " [rerun: mutation no longer applies]"
                continue
            try:
                target.write_text(apply(original.decode(), site))
                passed, _ = run_suite(*found, timeout=timeout)
            finally:
                target.write_bytes(original)
            m["caught_after_fix"] = not passed
    record_path.write_text(json.dumps(rec, indent=2) + "\n")
    return rec


# --------------------------------------------------------------------------
# Tally: the rates, derived from the mutants and never typed in.


def tally(records: list[dict[str, Any]]) -> dict[str, Any]:
    seeded = caught = equivalent = fixed = untriaged = 0
    defects = patched = 0
    runs = 0
    for rec in records:
        rt = rec.get("redteam")
        if not isinstance(rt, dict):
            continue
        runs += 1
        for camp in rt.get("campaigns", []):
            for m in camp.get("mutants", []):
                seeded += 1
                if m.get("caught"):
                    caught += 1
                elif m.get("triage") == "equivalent":
                    equivalent += 1
                else:
                    if m.get("caught_after_fix") is True:
                        fixed += 1
                    if m.get("triage") not in ("gap", "equivalent"):
                        untriaged += 1
        for d in rt.get("real_defects", []):
            defects += 1
            patched += bool(d.get("patched"))
    effective = seeded - equivalent
    return {
        "redteam_runs": runs,
        "seeded": seeded,
        "caught": caught,
        "escaped": effective - caught,
        "equivalent": equivalent,
        "untriaged": untriaged,
        "catch_rate": round(caught / effective, 3) if effective else None,
        "catch_rate_after_fix": round((caught + fixed) / effective, 3) if effective else None,
        "real_defects": defects,
        "real_defects_patched": patched,
        "defects_per_run": round(defects / runs, 2) if runs else None,
    }


def add_to_record(record_path: Path, camp: dict[str, Any]) -> None:
    rec = json.loads(record_path.read_text())
    rt = rec.get("redteam") or {}
    rt.setdefault("campaigns", []).append(camp)
    rt.setdefault("real_defects", [])
    rec["redteam"] = rt
    record_path.write_text(json.dumps(rec, indent=2) + "\n")


# --------------------------------------------------------------------------


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    sub = parser.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("targets", help="files a suite guards, sampled")
    p.add_argument("--limit", type=int, default=20)
    p.add_argument("--seed", type=int)
    p.add_argument("--under", help="only files below this directory, e.g. platform")
    p.add_argument("--probe", type=int, metavar="SECONDS",
                   help="time each listed target's suite (cached per suite), giving up after "
                   "SECONDS, so a campaign is not started on a suite too slow to run")
    p = sub.add_parser("campaign", help="seed mutants into one file and run its suite")
    p.add_argument("--target", help="file to mutate; default a random guarded file")
    p.add_argument("--under", help="draw the random file from below this directory, "
                   "e.g. platform (3,500 of 3,670 guarded files are ventures)")
    p.add_argument("--mutants", type=int, default=8)
    p.add_argument("--seed", type=int, help="default: random, printed in the result")
    p.add_argument("--timeout", type=int, default=TIMEOUT_SECONDS)
    p.add_argument("--probe", type=int, default=PROBE_SECONDS, metavar="SECONDS",
                   help="a random draw skips targets whose suite takes longer than this "
                   "(0 keeps the first draw); with --target, a slower suite stops the "
                   "campaign (0 runs it anyway)")
    p.add_argument("--record", type=Path, help="add the campaign to this run record")
    p = sub.add_parser("rerun", help="re-run escaped mutants after the blue team's fix")
    p.add_argument("record", type=Path)
    p.add_argument("--timeout", type=int, default=TIMEOUT_SECONDS)
    p = sub.add_parser("tally", help="catch rate across run records")
    p.add_argument("records", nargs="*", type=Path,
                   help="default: every record under prompts/runs/")
    args = parser.parse_args(argv)

    if args.cmd == "targets":
        targets = list_targets(under=args.under)
        rng = random.Random(args.seed)
        seen: dict[tuple[str, str], str] = {}
        for path in rng.sample(targets, min(args.limit, len(targets))):
            rel = path.relative_to(REPO).as_posix()
            if args.probe:
                cmd, cwd = suite_for(path)
                key = (" ".join(cmd), str(cwd))
                if key not in seen:
                    ok, secs = run_suite(cmd, cwd, args.probe)
                    seen[key] = (f">{args.probe}s (too slow)" if secs >= args.probe
                                 else f"{secs}s" + ("" if ok else " (red)"))
                rel = f"{rel}\t{seen[key]}"
            print(rel)
        print(f"({len(targets)} guarded files)", file=sys.stderr)
        return 0
    if args.cmd == "campaign":
        seed = args.seed if args.seed is not None else random.randrange(1 << 30)
        if args.target:
            target = (REPO / args.target).resolve()
            suite = suite_for(target) if args.probe else None
            if suite is not None:
                _, secs = run_suite(*suite, args.probe)
                if secs >= args.probe:
                    raise SystemExit(
                        f"{args.target}: its suite takes over {args.probe}s and a campaign "
                        "runs it once per mutant. Pick a faster file (`targets --probe "
                        f"{args.probe}`), or pass --probe 0 to run it anyway.")
        else:
            pool = list_targets(under=args.under)
            if not pool:
                raise SystemExit(f"no guarded files under {args.under}")
            target = draw_fast_target(pool, seed, args.probe)
        print(f"red team: {target.relative_to(REPO)} seed {seed}", file=sys.stderr)
        camp = campaign(target, args.mutants, seed, timeout=args.timeout)
        if args.record:
            add_to_record(args.record, camp)
        else:
            print("not saved: rerun with --record prompts/runs/<your record>.json "
                  "to keep this campaign in the run record", file=sys.stderr)
        print(json.dumps(camp, indent=2))
        print(json.dumps(tally([{"redteam": {"campaigns": [camp]}}])), file=sys.stderr)
        return 0
    if args.cmd == "rerun":
        rec = rerun(args.record, timeout=args.timeout)
        print(json.dumps(tally([rec]), indent=2))
        return 0
    paths = args.records or sorted((REPO / "prompts" / "runs").glob("*.json"))
    print(json.dumps(tally([json.loads(p.read_text()) for p in paths]), indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
