#!/usr/bin/env python3
"""Workflow Audit: run twelve GitHub Actions workflow checks and merge the results.

    python3 audit.py                       # scan ./.github/workflows, print a report
    python3 audit.py path/to/repo          # scan another checkout
    python3 audit.py --format json         # machine-readable
    python3 audit.py --format sarif        # SARIF 2.1.0 for github/codeql-action/upload-sarif
    python3 audit.py --format markdown     # for $GITHUB_STEP_SUMMARY or a PR comment
    python3 audit.py --fail-on high        # exit 2 when a finding is at least this severe
    python3 audit.py --write-baseline .workflow-audit-baseline.json   # accept today's findings
    python3 audit.py --baseline .workflow-audit-baseline.json         # then report only new ones

A finding can also be silenced in the workflow itself with a comment on its
line or the line above: `# workflow-audit: ignore` or
`# workflow-audit: ignore[rule-a, rule-b]`.

Zero dependencies (Python 3.8+). Read-only. Makes no network calls. Each check
is a vendored copy of the matching `actions-*-check` venture in `checks/`, run
as a subprocess so one check failing never hides the others.

Not a security audit and not a compliance attestation: it matches documented
patterns line by line. A clean report means these patterns were absent.
"""
import argparse
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
CHECKS_DIR = HERE / "checks"

SEVERITIES = ("high", "medium", "low")
RANK = {"high": 3, "medium": 2, "low": 1, "none": 4}

# (script, field holding the rule, {rule -> severity}). A rule absent from the
# map is informational (e.g. "explicit" permissions) and is dropped.
CHECKS = [
    ("injection", "type", {"pwn-request-checkout": "high", "script-injection": "high"}),
    ("secret-leak", "type", {"transformed-secret": "high", "unmasked-env-export": "medium"}),
    ("artifact-poisoning", "type", {"artifact-executed": "high", "unscoped-artifact-download": "medium"}),
    ("cache-poisoning", "type", {"cache-write-on-untrusted-trigger": "high", "unscoped-restore-keys": "medium"}),
    ("self-hosted-exposure", "classification", {"fork-exposed": "high", "self-hosted-other-trigger": "low"}),
    ("secrets-inherit", "type", {"secrets-inherit-untrusted-trigger": "high", "secrets-inherit-external-workflow": "medium"}),
    ("permissions", "classification", {"write-all": "medium", "unspecified": "low"}),
    ("checkout-credentials", "type", {"checkout-persists-credentials": "medium"}),
    ("runtime-deprecation", "type", {"deprecated-runtime": "low"}),
    ("timeout", "type", {"job-missing-timeout": "low", "job-timeout-at-default": "low"}),
    ("unpinned-action", "type", {"unpinned-third-party-action": "medium", "unpinned-first-party-action": "low", "unpinned-docker-action": "low"}),
    ("deploy-concurrency", "type", {"no-concurrency": "medium", "per-run-concurrency-group": "medium", "cancel-in-progress-on-deploy": "medium", "split-concurrency-group": "low", "mutable-ref-checkout": "low"}),
]

# Checks whose CLI is not `<script> <root> --format json`: (args builder, flattener).
# deploy-concurrency takes workflow paths and prints one object per file with a
# `findings` list; flatten it to the same shape every other check emits.
def _deploy_args(script, root):
    wf = Path(root) / ".github" / "workflows"
    return [sys.executable, str(script), str(wf), "--json"]


def _deploy_flatten(data):
    reports = data if isinstance(data, list) else [data]
    return [
        {"type": f.get("id"), "file": f.get("file", r.get("file", "")), "line": f.get("line"),
         "scope": f.get("job"), "detail": f"{f.get('title', '')}: {f.get('detail', '')}".strip(": "),
         "remediation": (f.get("fix") or "").split("\n")[0]}
        for r in reports if isinstance(r, dict) for f in r.get("findings", [])
    ]


ADAPTERS = {"deploy-concurrency": (_deploy_args, _deploy_flatten)}

REMEDIATION_FALLBACK = {
    "write-all": "Set `permissions:` to the least the job needs (often `contents: read`).",
    "unspecified": "Add a top-level `permissions: contents: read` and widen per job only where needed.",
    "fork-exposed": "Do not run fork-triggered workflows on self-hosted runners; use GitHub-hosted runners.",
    "self-hosted-other-trigger": "Keep self-hosted runners ephemeral and out of public-repo reach.",
}


def run_check(name, root):
    """Run one vendored check; return (findings_list, error_or_None)."""
    script = CHECKS_DIR / f"{name}.py"
    if not script.exists():
        return [], f"{name}: checker missing"
    build, flatten = ADAPTERS.get(name, (None, None))
    if build and not (Path(root) / ".github" / "workflows").is_dir():
        return [], None
    try:
        proc = subprocess.run(
            build(script, root) if build else [sys.executable, str(script), str(root), "--format", "json"],
            capture_output=True, text=True, timeout=120,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        return [], f"{name}: {exc}"
    if proc.returncode not in (0, 2):
        return [], f"{name}: exited {proc.returncode}: {proc.stderr.strip()[:200]}"
    try:
        data = json.loads(proc.stdout or "[]")
    except ValueError:
        return [], f"{name}: unreadable output"
    if flatten:
        return flatten(data), None
    return (data if isinstance(data, list) else []), None


def relpath(file, root):
    try:
        return Path(file).resolve().relative_to(Path(root).resolve()).as_posix()
    except ValueError:
        return str(file)


def normalise(name, field, severities, raw, root):
    out = []
    for f in raw:
        rule = f.get(field)
        sev = severities.get(rule)
        if sev is None:
            continue
        out.append({
            "check": name,
            "rule": rule,
            "severity": sev,
            "file": relpath(f.get("file", ""), root),
            "line": int(f.get("line") or 1),
            "scope": f.get("scope"),
            "detail": str(f.get("detail", "")),
            "fix": f.get("remediation") or REMEDIATION_FALLBACK.get(rule, ""),
        })
    return out


def audit(root):
    findings, errors = [], []
    for name, field, sev in CHECKS:
        raw, err = run_check(name, root)
        if err:
            errors.append(err)
            continue
        findings.extend(normalise(name, field, sev, raw, root))
    seen, unique = set(), []
    for f in findings:
        key = (f["file"], f["line"], f["rule"], f["scope"])
        if key not in seen:
            seen.add(key)
            unique.append(f)
    unique.sort(key=lambda f: (-RANK[f["severity"]], f["file"], f["line"], f["rule"]))
    return unique, errors


IGNORE_RE = re.compile(r"#\s*workflow-audit:\s*ignore(?:\[([^\]]*)\])?", re.I)


def _source_lines(root, file, cache):
    if file not in cache:
        try:
            cache[file] = (Path(root) / file).read_text(encoding="utf-8", errors="replace").splitlines()
        except OSError:
            cache[file] = []
    return cache[file]


def _line_text(lines, line):
    return lines[line - 1].strip() if 1 <= line <= len(lines) else ""


def fingerprint(f, text):
    """Stable across line-number shifts: file + rule + scope + the offending line's text."""
    raw = "\x1f".join((f["file"], f["rule"], str(f["scope"] or ""), text))
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()[:16]


def inline_ignored(f, lines):
    for n in (f["line"], f["line"] - 1):
        if not 1 <= n <= len(lines):
            continue
        m = IGNORE_RE.search(lines[n - 1])
        if not m:
            continue
        if m.group(1) is None:
            return True
        if f["rule"] in {r.strip() for r in m.group(1).split(",")}:
            return True
    return False


def load_baseline(path):
    """Return {fingerprint: allowed count}. A missing or unreadable file is an error, not 'no baseline'."""
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    out = {}
    for entry in data.get("findings", []):
        out[entry["fingerprint"]] = out.get(entry["fingerprint"], 0) + 1
    return out


def write_baseline(path, findings, root):
    cache = {}
    entries = [{
        "fingerprint": fingerprint(f, _line_text(_source_lines(root, f["file"], cache), f["line"])),
        "file": f["file"], "rule": f["rule"], "severity": f["severity"],
    } for f in findings]
    entries.sort(key=lambda e: (e["file"], e["rule"], e["fingerprint"]))
    Path(path).write_text(json.dumps({"version": 1, "findings": entries}, indent=2) + "\n", encoding="utf-8")
    return len(entries)


def suppress(findings, root, baseline=None):
    """Drop inline-ignored and baselined findings; return (kept, n_inline, n_baselined)."""
    cache, kept, n_inline, n_base = {}, [], 0, 0
    budget = dict(baseline or {})
    for f in findings:
        lines = _source_lines(root, f["file"], cache)
        if inline_ignored(f, lines):
            n_inline += 1
            continue
        fp = fingerprint(f, _line_text(lines, f["line"]))
        if budget.get(fp, 0) > 0:
            budget[fp] -= 1
            n_base += 1
            continue
        kept.append(f)
    return kept, n_inline, n_base


def counts(findings):
    return {s: sum(1 for f in findings if f["severity"] == s) for s in SEVERITIES}


def should_fail(findings, fail_on):
    if fail_on == "none":
        return False
    return any(RANK[f["severity"]] >= RANK[fail_on] for f in findings)


def suppressed_note(n_inline, n_base):
    parts = []
    if n_inline:
        parts.append(f"{n_inline} ignored inline")
    if n_base:
        parts.append(f"{n_base} in the baseline")
    return f"Suppressed: {', '.join(parts)}." if parts else ""


def render_text(findings, errors, note=""):
    c = counts(findings)
    lines = []
    for f in findings:
        lines.append(f"[{f['severity'].upper():6}] {f['file']}:{f['line']}  {f['rule']}  ({f['check']})")
        lines.append(f"         {f['detail']}")
        if f["fix"]:
            lines.append(f"         fix: {f['fix']}")
    lines.append(summary_line(findings, c))
    if note:
        lines.append(note)
    lines.extend(f"warning: {e}" for e in errors)
    return "\n".join(lines)


def summary_line(findings, c=None):
    c = c or counts(findings)
    if not findings:
        return "No findings: none of the twelve patterns checked were present. This is not a security audit."
    return f"{len(findings)} finding(s): {c['high']} high, {c['medium']} medium, {c['low']} low."


def render_markdown(findings, errors, note=""):
    out = ["## Workflow Audit", "", summary_line(findings), ""]
    if note:
        out += [note, ""]
    if findings:
        out += ["| Severity | Location | Rule | Detail | Fix |", "|---|---|---|---|---|"]
        for f in findings:
            esc = lambda s: s.replace("|", "\\|").replace("\n", " ")
            out.append(f"| {f['severity']} | `{f['file']}:{f['line']}` | `{f['rule']}` | {esc(f['detail'])} | {esc(f['fix'])} |")
    out += [""] + [f"> warning: {e}" for e in errors]
    out += ["", "_Pattern matching on workflow YAML, not a security audit. Free and MIT-licensed._"]
    return "\n".join(out)


def render_sarif(findings):
    rules = {}
    for f in findings:
        rules.setdefault(f["rule"], {
            "id": f["rule"],
            "name": f["rule"],
            "shortDescription": {"text": f"{f['check']}: {f['rule']}"},
            "helpUri": "https://duncan-haywood.github.io/monorepo-projects/workflow-audit/",
        })
    level = {"high": "error", "medium": "warning", "low": "note"}
    results = [{
        "ruleId": f["rule"],
        "level": level[f["severity"]],
        "message": {"text": f"{f['detail']} -- {f['fix']}".strip(" -")},
        "locations": [{"physicalLocation": {
            "artifactLocation": {"uri": f["file"]},
            "region": {"startLine": f["line"]}}}],
    } for f in findings]
    return json.dumps({
        "$schema": "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json",
        "version": "2.1.0",
        "runs": [{"tool": {"driver": {"name": "workflow-audit", "version": "0.1.0",
                                      "rules": list(rules.values())}}, "results": results}],
    }, indent=2)


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("path", nargs="?", default=".", help="repository checkout to scan (default: .)")
    p.add_argument("--format", choices=("text", "json", "sarif", "markdown"), default="text")
    p.add_argument("--fail-on", choices=("high", "medium", "low", "none"), default="none",
                   help="exit 2 when a finding is at least this severe (default: never)")
    p.add_argument("--baseline", help="JSON file from --write-baseline; findings it lists are not reported")
    p.add_argument("--write-baseline", metavar="FILE",
                   help="write every current finding to FILE as the accepted baseline, then exit 0")
    p.add_argument("--output", help="write the report to this file instead of stdout")
    args = p.parse_args(argv)
    root = Path(args.path)
    if not root.is_dir():
        print(f"error: {root} is not a directory", file=sys.stderr)
        return 1
    findings, errors = audit(root)
    if args.write_baseline:
        # Inline ignores still apply: the baseline only needs what they do not cover.
        kept, _, _ = suppress(findings, root)
        n = write_baseline(args.write_baseline, kept, root)
        print(f"Wrote {n} finding(s) to {args.write_baseline}. Commit it; later runs with --baseline report only new ones.")
        return 0
    baseline = None
    if args.baseline:
        try:
            baseline = load_baseline(args.baseline)
        except (OSError, ValueError, KeyError, TypeError) as exc:
            print(f"error: cannot read baseline {args.baseline}: {exc}", file=sys.stderr)
            return 1
    findings, n_inline, n_base = suppress(findings, root, baseline)
    note = suppressed_note(n_inline, n_base)
    if args.format == "json":
        text = json.dumps({"summary": counts(findings), "suppressed": {"inline": n_inline, "baseline": n_base}, "findings": findings, "errors": errors}, indent=2)
    elif args.format == "sarif":
        text = render_sarif(findings)
    elif args.format == "markdown":
        text = render_markdown(findings, errors, note)
    else:
        text = render_text(findings, errors, note)
    if args.output:
        Path(args.output).write_text(text + "\n", encoding="utf-8")
    else:
        print(text)
    return 2 if should_fail(findings, args.fail_on) else 0


if __name__ == "__main__":
    sys.exit(main())
