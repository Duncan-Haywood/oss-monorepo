#!/usr/bin/env python3
"""Check and score the portfolio's SOC 2 control register.

    python3 platform/ci/soc2_controls.py           # check, then print the score and gaps
    python3 platform/ci/soc2_controls.py --csv     # the answers as the checker's CSV
    python3 platform/ci/soc2_controls.py --json    # machine-readable result

The register is `docs/security/soc2/controls.yaml`. Its control ids come from
`ventures/soc2-readiness-checker/calc.mjs`, the repository's own public tool,
and the score is that tool's (`cli.mjs --json`), so the self-assessment is
graded by the same rules a visitor's is.

Exit 1 when the register is out of step: a control missing or unknown, an
answer that is not yes/partial/no/na, a `yes` or `partial` without evidence,
an evidence path that does not exist, or a non-`yes` answer without a gap or
note saying why. A low score is not a failure; a register that lies is.
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]
REGISTER = ROOT / "docs/security/soc2/controls.yaml"
CHECKER = ROOT / "ventures/soc2-readiness-checker"
ANSWERS = {"yes", "partial", "no", "na"}
SCOPES = {"security", "availability", "confidentiality", "privacy"}
TSC_RE = re.compile(r"^(CC[1-9]\.\d+|A1\.[1-3]|C1\.[12]|PI1\.[1-5]|P[1-8]\.\d)$")


def load(path: Path = REGISTER) -> dict:
    """The register, with YAML 1.1's bare yes/no (read as booleans) turned back into answers."""
    register = yaml.safe_load(path.read_text()) or {}
    for c in (register.get("controls") or {}).values():
        if isinstance(c, dict) and isinstance(c.get("answer"), bool):
            c["answer"] = "yes" if c["answer"] else "no"
    return register


def checker_ids(checker: Path = CHECKER) -> list[str]:
    """Control ids in the order the public checker lists them."""
    out = subprocess.run(["node", "cli.mjs", "--list"], cwd=checker, capture_output=True, text=True, check=True)
    return [line.split("\t", 1)[0] for line in out.stdout.splitlines() if line.strip()]


def validate(register: dict, ids: list[str], root: Path = ROOT) -> list[str]:
    """Every way the register is out of step, as readable lines (empty = fine)."""
    problems: list[str] = []
    controls = register.get("controls") or {}
    for scope in register.get("scope") or []:
        if scope not in SCOPES:
            problems.append(f"scope: unknown category {scope!r}")
    for cid in ids:
        if cid not in controls:
            problems.append(f"{cid}: in the checker but missing from the register")
    for cid, c in controls.items():
        if cid not in ids:
            problems.append(f"{cid}: not a checker control id")
            continue
        c = c or {}
        answer = c.get("answer")
        if answer not in ANSWERS:
            problems.append(f"{cid}: answer {answer!r} is not one of {sorted(ANSWERS)}")
        for ref in c.get("tsc") or []:
            if not TSC_RE.match(str(ref)):
                problems.append(f"{cid}: {ref!r} is not a Trust Services Criteria reference")
        if not c.get("tsc"):
            problems.append(f"{cid}: no Trust Services Criteria reference")
        evidence = c.get("evidence") or []
        if answer in {"yes", "partial"} and not evidence:
            problems.append(f"{cid}: answered {answer} with no evidence path")
        for path in evidence:
            p = root / path
            if not (p.is_dir() if path.endswith("/") else p.is_file()):
                problems.append(f"{cid}: evidence {path} does not exist")
        if answer != "yes" and not (c.get("gap") or c.get("note")):
            problems.append(f"{cid}: answered {answer} with no gap or note saying why")
    return problems


def answers_csv(register: dict) -> str:
    rows = ["control-id,answer"]
    rows += [f"{cid},{c['answer']}" for cid, c in (register.get("controls") or {}).items()]
    return "\n".join(rows) + "\n"


def score(register: dict, checker: Path = CHECKER) -> dict:
    """The public checker's own result for these answers."""
    flags = [f"--{s}" for s in register.get("scope") or [] if s != "security"]
    with tempfile.NamedTemporaryFile("w", suffix=".csv", delete=False) as f:
        f.write(answers_csv(register))
        path = f.name
    try:
        out = subprocess.run(["node", "cli.mjs", path, *flags, "--json"], cwd=checker, capture_output=True, text=True)
    finally:
        Path(path).unlink(missing_ok=True)
    if not out.stdout.strip():
        raise RuntimeError(out.stderr.strip() or "checker printed nothing")
    return json.loads(out.stdout)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--csv", action="store_true", help="print the answers as checker CSV and stop")
    ap.add_argument("--json", action="store_true", help="print the check and score as JSON")
    args = ap.parse_args(argv)

    register = load()
    if args.csv:
        sys.stdout.write(answers_csv(register))
        return 0
    problems = validate(register, checker_ids())
    result = score(register) if not problems else None
    controls = register.get("controls") or {}
    owner_gaps = [cid for cid, c in controls.items() if c.get("owner") and c.get("answer") in {"no", "partial"}]

    if args.json:
        print(json.dumps({"problems": problems, "score": result, "owner_gaps": owner_gaps}, indent=2))
        return 1 if problems else 0
    if problems:
        print(f"{REGISTER.relative_to(ROOT)} is out of step:")
        for p in problems:
            print(f"  - {p}")
        return 1
    counts = {a: sum(1 for c in controls.values() if c.get("answer") == a) for a in ("yes", "partial", "no", "na")}
    print(f"SOC 2 readiness (self-assessed {register.get('assessed')}, not an audit)")
    print(f"  controls: {len(controls)}  yes {counts['yes']}  partial {counts['partial']}  no {counts['no']}  n/a {counts['na']}")
    summary = result.get("summary") or {}
    print(f"  readiness (the public checker's weighting): {result.get('readiness')}%")
    print(f"  effort left: about {summary.get('totalDays')} person-days")
    print(f"  gaps only the owner can close: {len(owner_gaps)} ({', '.join(owner_gaps)})")
    gaps = result.get("gaps") or []
    if gaps:
        print("  top gaps by value per day of effort:")
        for g in gaps[:8]:
            print(f"    {g.get('id')}: {g.get('title')}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
