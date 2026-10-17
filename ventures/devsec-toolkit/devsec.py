#!/usr/bin/env python3
"""devsec-toolkit: one command that runs a repository through every devsec check.

    python3 devsec.py scan [PATH]                  # text report, exit 0
    python3 devsec.py scan . --fail-on high        # exit 2 if a high finding exists
    python3 devsec.py scan . --format sarif -o devsec.sarif   # for GitHub code scanning
    python3 devsec.py scan . --format markdown     # for a PR comment or job summary
    python3 devsec.py scan . --write-baseline .devsec-baseline.json   # accept today's findings
    python3 devsec.py scan . --baseline .devsec-baseline.json --fail-on low   # fail on new ones only
    python3 devsec.py list                          # every check, by category
    python3 devsec.py list --paths                  # directories to sparse-checkout
    python3 devsec.py bundle dist/devsec            # self-contained copy to vendor into CI

Each check is a separate tool in this repository (see catalog.py). This runner
finds which ones apply to the repository, runs them in parallel, normalises
their findings onto one schema and one severity scale, and reports them once.

Zero dependencies: Python 3.9+ standard library. Node.js 18+ is needed for the
checks written in JavaScript; without it they are reported as skipped, never
as passing. Nothing is uploaded and no check makes a network call.

Per-repository settings live in ``.devsec.json`` at the scan root:

    {
      "skip": ["actions-timeout"],             # check ids or categories
      "only": [],                              # if non-empty, run just these
      "ignore_paths": ["tests/fixtures/**"],   # drop findings in these files
      "severity": {"pinned-actions": "high", "actions-timeout/job-missing-timeout": "medium"},
      "fail_on": "high",
      "baseline": ".devsec-baseline.json"
    }

Exit status: 0 normally; 2 when --fail-on (or the config's fail_on) is set and
a finding at or above that severity remains after the baseline; 1 on a usage
error or when a check crashed and --strict was given.
"""

from __future__ import annotations

import argparse
import concurrent.futures
import fnmatch
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import catalog  # noqa: E402

VERSION = "0.1.0"
TOOL_URI = "https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/devsec-toolkit"
SKIP_DIRS = {".git", "node_modules", ".venv", "venv", "__pycache__", ".tox", "dist", "build", ".terraform"}
CHECK_TIMEOUT = 300


# --- locating the checks ------------------------------------------------------


def default_checks_dir() -> Path:
    """``checks/`` inside a bundle, else the ``ventures/`` directory this lives in."""
    bundled = HERE / "checks"
    return bundled if bundled.is_dir() else HERE.parent


# --- discovering files --------------------------------------------------------


def list_files(root: Path, limit: int = 200_000) -> list[str]:
    out = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = sorted(d for d in dirnames if d not in SKIP_DIRS)
        rel = os.path.relpath(dirpath, root)
        for name in sorted(filenames):
            out.append(name if rel == "." else f"{rel}/{name}".replace(os.sep, "/"))
            if len(out) >= limit:
                return out
    return out


def glob_match(path: str, pattern: str) -> bool:
    """fnmatch, plus ``**/`` matching zero or more leading directories."""
    if fnmatch.fnmatchcase(path, pattern):
        return True
    parts = path.split("/")
    if pattern.startswith("**/"):
        return any(glob_match("/".join(parts[i:]), pattern[3:]) for i in range(len(parts)))
    if pattern.endswith("/**"):
        return any(glob_match("/".join(parts[:i]), pattern[:-3]) for i in range(1, len(parts)))
    return False


def applicable(check: dict, files: list[str]) -> list[str]:
    return [f for f in files if any(glob_match(f, p) for p in check["applies"])]


# --- config -------------------------------------------------------------------


def load_config(root: Path, explicit: str | None) -> dict:
    path = Path(explicit) if explicit else root / ".devsec.json"
    if not path.is_file():
        if explicit:
            raise SystemExit(f"devsec: config file not found: {explicit}")
        return {}
    try:
        cfg = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        raise SystemExit(f"devsec: {path} is not valid JSON: {e}")
    if not isinstance(cfg, dict):
        raise SystemExit(f"devsec: {path} must hold a JSON object")
    for key in ("severity",):
        for target, sev in (cfg.get(key) or {}).items():
            if sev not in catalog.SEVERITY_RANK and sev != "off":
                raise SystemExit(f"devsec: {path}: severity for {target!r} must be high, medium, low or off")
    return cfg


def select_checks(only: list[str], skip: list[str]) -> list[dict]:
    known = set(catalog.BY_ID) | set(catalog.CATEGORIES)
    for name in only + skip:
        if name not in known:
            raise SystemExit(f"devsec: unknown check or category {name!r} (see `devsec.py list`)")

    def hit(c, names):
        return c["id"] in names or c["category"] in names

    return [c for c in catalog.CHECKS if (not only or hit(c, only)) and not hit(c, skip)]


# --- running ------------------------------------------------------------------


def interpreter(runtime: str) -> str | None:
    if runtime == "python":
        return sys.executable or shutil.which("python3")
    return shutil.which("node")


def run_check(check: dict, root: Path, checks_dir: Path) -> dict:
    result = {"id": check["id"], "status": "ok", "findings": [], "error": None, "seconds": 0.0}
    exe = interpreter(check["runtime"])
    entry = checks_dir / check["entry"]
    if exe is None:
        result.update(status="skipped", error=f"{check['runtime']} not found on PATH")
        return result
    if not entry.is_file():
        result.update(status="skipped", error=f"check not found at {entry}")
        return result
    started = time.monotonic()
    try:
        proc = subprocess.run(
            [exe, str(entry), *check["args"]], cwd=root, capture_output=True, text=True,
            timeout=CHECK_TIMEOUT, env={**os.environ, "NO_COLOR": "1"},
        )
        findings = check["adapt"](proc.stdout, proc.stderr, proc.returncode)
    except subprocess.TimeoutExpired:
        result.update(status="error", error=f"timed out after {CHECK_TIMEOUT}s")
    except (ValueError, KeyError, TypeError, AttributeError) as e:
        detail = (proc.stderr or "").strip().splitlines()[-1:] if "proc" in locals() else []
        result.update(status="error", error=f"could not read output: {e}" + (f" ({detail[0]})" if detail else ""))
    else:
        for f in findings:
            f["file"] = _clean_path(f["file"], root)
            f["check"] = check["id"]
            f["category"] = check["category"]
        result["findings"] = findings
    result["seconds"] = round(time.monotonic() - started, 2)
    return result


def _clean_path(p: str, root: Path) -> str:
    p = (p or "").replace("\\", "/")
    if os.path.isabs(p):
        try:
            p = os.path.relpath(p, root).replace(os.sep, "/")
        except ValueError:
            pass
    while p.startswith("./"):
        p = p[2:]
    return p


def fingerprint(f: dict) -> str:
    """Stable across line shifts: check, rule, file and message, not line."""
    msg = re.sub(r"\bline \d+\b", "line N", f["message"])
    key = "\x1f".join([f["check"], f["rule"] or "", f["file"], msg])
    return hashlib.sha256(key.encode()).hexdigest()[:32]


def scan(root: Path, checks: list[dict], checks_dir: Path, cfg: dict, jobs: int) -> dict:
    files = list_files(root)
    plan, results = [], []
    for c in checks:
        if applicable(c, files):
            plan.append(c)
        else:
            results.append({"id": c["id"], "status": "not-applicable", "findings": [], "error": None, "seconds": 0.0})
    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, jobs)) as pool:
        results += list(pool.map(lambda c: run_check(c, root, checks_dir), plan))
    order = {c["id"]: i for i, c in enumerate(catalog.CHECKS)}
    results.sort(key=lambda r: order[r["id"]])

    overrides = cfg.get("severity") or {}
    ignore = cfg.get("ignore_paths") or []
    findings = []
    for r in results:
        kept = []
        for f in r["findings"]:
            if any(glob_match(f["file"], p) for p in ignore):
                continue
            sev = overrides.get(f"{f['check']}/{f['rule']}", overrides.get(f["check"], f["severity"]))
            if sev == "off":
                continue
            f["severity"] = sev
            f["fingerprint"] = fingerprint(f)
            kept.append(f)
        r["findings"] = kept
        findings += kept
    findings.sort(key=lambda f: (-catalog.SEVERITY_RANK[f["severity"]], f["file"], f["line"] or 0, f["check"]))
    return {"root": str(root), "files_seen": len(files), "checks": results, "findings": findings}


def apply_baseline(report: dict, baseline_path: Path | None) -> None:
    report["baselined"] = 0
    if not baseline_path:
        return
    try:
        known = set(json.loads(baseline_path.read_text(encoding="utf-8")).get("fingerprints", []))
    except FileNotFoundError:
        raise SystemExit(f"devsec: baseline not found: {baseline_path} (create it with --write-baseline)")
    except (json.JSONDecodeError, AttributeError) as e:
        raise SystemExit(f"devsec: baseline {baseline_path} is not a devsec baseline: {e}")
    before = len(report["findings"])
    report["findings"] = [f for f in report["findings"] if f["fingerprint"] not in known]
    report["baselined"] = before - len(report["findings"])
    keep = {id(f) for f in report["findings"]}
    for r in report["checks"]:
        r["findings"] = [f for f in r["findings"] if id(f) in keep]


def write_baseline(report: dict, path: Path) -> None:
    data = {
        "tool": "devsec-toolkit",
        "version": 1,
        "note": "Findings accepted as of this file's last write. devsec only reports findings not listed here when run with --baseline.",
        "fingerprints": sorted({f["fingerprint"] for f in report["findings"]}),
    }
    path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


def summarise(report: dict) -> dict:
    counts = {s: 0 for s in catalog.SEVERITIES}
    for f in report["findings"]:
        counts[f["severity"]] += 1
    status = {}
    for r in report["checks"]:
        status[r["status"]] = status.get(r["status"], 0) + 1
    return {"findings": counts, "checks": status, "baselined": report.get("baselined", 0)}


# --- reporters ----------------------------------------------------------------


def fmt_location(f: dict) -> str:
    return f"{f['file']}:{f['line']}" if f["line"] else (f["file"] or "(repository)")


def render_text(report: dict) -> str:
    out = []
    marks = {"high": "HIGH  ", "medium": "MEDIUM", "low": "LOW   "}
    for f in report["findings"]:
        out.append(f"{marks[f['severity']]} {fmt_location(f)}  [{f['check']}/{f['rule']}]")
        out.append(f"       {f['message']}")
        if f["fix"]:
            fix = f["fix"].splitlines()
            out.append(f"       fix: {fix[0]}")
            out += [f"            {line}" for line in fix[1:6]]
        out.append("")
    s = summarise(report)
    ran = [r for r in report["checks"] if r["status"] == "ok"]
    out.append(
        f"devsec-toolkit {VERSION}: {len(report['findings'])} finding(s) "
        f"({s['findings']['high']} high, {s['findings']['medium']} medium, {s['findings']['low']} low) "
        f"from {len(ran)} check(s) over {report['files_seen']} file(s)."
    )
    if s["baselined"]:
        out.append(f"{s['baselined']} known finding(s) suppressed by the baseline.")
    na = [r["id"] for r in report["checks"] if r["status"] == "not-applicable"]
    if na:
        out.append(f"Not applicable (no matching files): {', '.join(na)}.")
    for r in report["checks"]:
        if r["status"] in ("skipped", "error"):
            out.append(f"{r['status'].upper()}: {r['id']}: {r['error']}")
    out.append("A clean report means these checks found nothing, not that the repository is secure.")
    return "\n".join(out) + "\n"


def render_json(report: dict) -> str:
    data = {
        "tool": "devsec-toolkit",
        "version": VERSION,
        "root": report["root"],
        "summary": summarise(report),
        "checks": [
            {k: r[k] for k in ("id", "status", "error", "seconds")} | {"findings": len(r["findings"])}
            for r in report["checks"]
        ],
        "findings": report["findings"],
    }
    return json.dumps(data, indent=2) + "\n"


SARIF_LEVEL = {"high": "error", "medium": "warning", "low": "note"}
SARIF_SCORE = {"high": "8.0", "medium": "5.0", "low": "2.0"}


def render_sarif(report: dict) -> str:
    rules, index = [], {}
    for f in report["findings"]:
        rid = f"{f['check']}/{f['rule']}"
        if rid in index:
            continue
        check = catalog.BY_ID[f["check"]]
        index[rid] = len(rules)
        rules.append({
            "id": rid,
            "name": re.sub(r"[^A-Za-z0-9]", "", (f["rule"] or "finding").title()),
            "shortDescription": {"text": f"{check['title']}: {f['rule']}"},
            "helpUri": f"https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/{check['venture']}",
            "help": {"text": f["fix"] or check["title"]},
            "defaultConfiguration": {"level": SARIF_LEVEL[f["severity"]]},
            "properties": {"tags": ["security", check["category"]], "security-severity": SARIF_SCORE[f["severity"]]},
        })
    results = []
    for f in report["findings"]:
        rid = f"{f['check']}/{f['rule']}"
        loc = {"artifactLocation": {"uri": f["file"] or ".", "uriBaseId": "%SRCROOT%"}}
        if f["line"]:
            loc["region"] = {"startLine": f["line"]}
        text = f["message"] + (f"\nFix: {f['fix']}" if f["fix"] else "")
        results.append({
            "ruleId": rid,
            "ruleIndex": index[rid],
            "level": SARIF_LEVEL[f["severity"]],
            "message": {"text": text},
            "locations": [{"physicalLocation": loc}],
            "partialFingerprints": {"devsecFingerprint/v1": f["fingerprint"]},
        })
    notes = [
        {"level": "error" if r["status"] == "error" else "warning",
         "message": {"text": f"{r['id']} {r['status']}: {r['error']}"}, "descriptor": {"id": r["id"]}}
        for r in report["checks"] if r["status"] in ("error", "skipped")
    ]
    sarif = {
        "$schema": "https://json.schemastore.org/sarif-2.1.0.json",
        "version": "2.1.0",
        "runs": [{
            "tool": {"driver": {"name": "devsec-toolkit", "version": VERSION, "informationUri": TOOL_URI, "rules": rules}},
            "originalUriBaseIds": {"%SRCROOT%": {"uri": "file:///"}},
            "results": results,
            "invocations": [{"executionSuccessful": not any(r["status"] == "error" for r in report["checks"]),
                             "toolExecutionNotifications": notes}],
        }],
    }
    return json.dumps(sarif, indent=2) + "\n"


def _md(text: str) -> str:
    return text.replace("|", "\\|").replace("\n", " ")


def render_markdown(report: dict, limit: int = 100) -> str:
    s = summarise(report)
    c = s["findings"]
    out = ["## devsec-toolkit", ""]
    out.append(f"**{len(report['findings'])} finding(s)**: {c['high']} high, {c['medium']} medium, {c['low']} low"
               + (f" ({s['baselined']} known finding(s) suppressed by the baseline)" if s["baselined"] else "") + ".")
    out.append("")
    if report["findings"]:
        out += ["| Severity | Location | Check | Finding |", "|---|---|---|---|"]
        for f in report["findings"][:limit]:
            out.append(f"| {f['severity']} | `{_md(fmt_location(f))}` | `{f['check']}/{f['rule']}` | {_md(f['message'])} |")
        if len(report["findings"]) > limit:
            out.append(f"\n{len(report['findings']) - limit} more in the JSON or SARIF report.")
        out.append("")
    out += ["<details><summary>Checks run</summary>", "", "| Check | Category | Status | Findings |", "|---|---|---|---|"]
    for r in report["checks"]:
        status = r["status"] + (f": {_md(r['error'])}" if r["error"] else "")
        out.append(f"| `{r['id']}` | {catalog.BY_ID[r['id']]['category']} | {status} | {len(r['findings'])} |")
    out += ["", "</details>", "",
            "_A clean report means these checks found nothing, not that the repository is secure. "
            "No warranty; not a security audit._", ""]
    return "\n".join(out)


RENDERERS = {"text": render_text, "json": render_json, "sarif": render_sarif, "markdown": render_markdown}


def render_list() -> str:
    out = []
    for cat, label in catalog.CATEGORIES.items():
        out.append(f"{cat}: {label}")
        for c in catalog.CHECKS:
            if c["category"] == cat:
                out.append(f"  {c['id']:<30} {c['title']}  [{c['runtime']}]")
        out.append("")
    out.append(f"{len(catalog.CHECKS)} checks. Skip one with --skip <id> or a whole category with --skip <category>.")
    return "\n".join(out) + "\n"


# --- bundle -------------------------------------------------------------------

_IMPORT_RE = re.compile(r"""(?:from\s+|import\s*\(\s*|import\s+)["'](\.{1,2}/[^"']+)["']""")


def bundle(dest: Path, checks_dir: Path) -> list[str]:
    """Copy the runner and just the files each check needs into ``dest``."""
    dest.mkdir(parents=True, exist_ok=True)
    copied = []
    for name in ("devsec.py", "catalog.py", "README.md", "LICENSE"):
        if (HERE / name).is_file():
            shutil.copy2(HERE / name, dest / name)
            copied.append(name)
    for check in catalog.CHECKS:
        pending = [checks_dir / check["entry"]]
        seen = set()
        while pending:
            src = pending.pop().resolve()
            if src in seen:
                continue
            seen.add(src)
            if not src.is_file():
                raise SystemExit(f"devsec: bundle: {check['id']} needs {src}, which does not exist")
            rel = src.relative_to(checks_dir.resolve())
            target = dest / "checks" / rel
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src, target)
            copied.append(f"checks/{rel.as_posix()}")
            if src.suffix in (".mjs", ".js"):
                for m in _IMPORT_RE.finditer(src.read_text(encoding="utf-8")):
                    pending.append(src.parent / m.group(1))
        lic = checks_dir / check["venture"] / "LICENSE"
        if lic.is_file():
            shutil.copy2(lic, dest / "checks" / check["venture"] / "LICENSE")
    return sorted(set(copied))


# --- CLI ----------------------------------------------------------------------


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(prog="devsec", description="Run a repository through every devsec-toolkit check.")
    parser.add_argument("--version", action="version", version=f"devsec-toolkit {VERSION}")
    sub = parser.add_subparsers(dest="cmd")

    p_scan = sub.add_parser("scan", help="scan a directory (the default command)")
    p_scan.add_argument("path", nargs="?", default=".", help="repository to scan (default: .)")
    p_scan.add_argument("--format", choices=sorted(RENDERERS), default="text")
    p_scan.add_argument("-o", "--output", help="write the report here instead of stdout")
    p_scan.add_argument("--fail-on", choices=("high", "medium", "low", "none"), help="exit 2 if a finding at or above this severity remains")
    p_scan.add_argument("--only", action="append", default=[], help="run only this check id or category (repeatable)")
    p_scan.add_argument("--skip", action="append", default=[], help="skip this check id or category (repeatable)")
    p_scan.add_argument("--config", help="config file (default: <path>/.devsec.json when present)")
    p_scan.add_argument("--baseline", help="suppress findings listed in this baseline file")
    p_scan.add_argument("--write-baseline", metavar="FILE", help="write every current finding to FILE as accepted")
    p_scan.add_argument("--checks-dir", help="where the checks live (default: alongside this file)")
    p_scan.add_argument("--jobs", type=int, default=min(8, os.cpu_count() or 2), help="checks to run in parallel")
    p_scan.add_argument("--strict", action="store_true", help="exit 1 if any check errored or was skipped")

    p_list = sub.add_parser("list", help="list every check")
    p_list.add_argument("--paths", action="store_true",
                        help="print the repository directories the checks live in (for a sparse checkout)")
    p_bundle = sub.add_parser("bundle", help="write a self-contained copy (runner + check files) to DEST")
    p_bundle.add_argument("dest")
    p_bundle.add_argument("--checks-dir", help="where the checks live (default: alongside this file)")

    argv = list(sys.argv[1:] if argv is None else argv)
    if not argv or (argv[0] not in ("scan", "list", "bundle", "-h", "--help", "--version")):
        argv.insert(0, "scan")
    args = parser.parse_args(argv)

    if args.cmd == "list":
        if args.paths:
            dirs = {f"ventures/{HERE.name}"} | {f"ventures/{c['venture']}" for c in catalog.CHECKS}
            sys.stdout.write("\n".join(sorted(dirs)) + "\n")
        else:
            sys.stdout.write(render_list())
        return 0

    checks_dir = Path(args.checks_dir).resolve() if args.checks_dir else default_checks_dir()
    if args.cmd == "bundle":
        files = bundle(Path(args.dest), checks_dir)
        print(f"devsec: wrote {len(files)} files to {args.dest}. Run: python3 {Path(args.dest) / 'devsec.py'} scan .")
        return 0

    root = Path(args.path).resolve()
    if not root.is_dir():
        print(f"devsec: not a directory: {args.path}", file=sys.stderr)
        return 1
    cfg = load_config(root, args.config)
    checks = select_checks(args.only or list(cfg.get("only") or []), args.skip + list(cfg.get("skip") or []))
    report = scan(root, checks, checks_dir, cfg, args.jobs)

    if args.write_baseline:
        write_baseline(report, Path(args.write_baseline))
        print(f"devsec: wrote {len(report['findings'])} finding(s) to {args.write_baseline}", file=sys.stderr)
    baseline = args.baseline or cfg.get("baseline")
    if baseline and not args.write_baseline:
        bpath = Path(baseline)
        apply_baseline(report, bpath if bpath.is_absolute() or args.baseline else root / bpath)
    else:
        report["baselined"] = 0

    text = RENDERERS[args.format](report)
    if args.output:
        Path(args.output).write_text(text, encoding="utf-8")
    else:
        sys.stdout.write(text)

    if args.strict and any(r["status"] in ("error", "skipped") for r in report["checks"]):
        return 1
    fail_on = args.fail_on or cfg.get("fail_on") or "none"
    if fail_on != "none":
        threshold = catalog.SEVERITY_RANK[fail_on]
        if any(catalog.SEVERITY_RANK[f["severity"]] >= threshold for f in report["findings"]):
            return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
