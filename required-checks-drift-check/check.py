#!/usr/bin/env python3
"""Find branch-protection required status checks that no job can ever report.

    python3 check.py --required-checks names.txt             # scan .github/workflows under .
    python3 check.py /path/to/repo --required-checks names.txt
    python3 check.py                                          # no comparison: just list computed check names
    python3 check.py --required-checks names.txt --format json
    python3 check.py --required-checks names.txt --fail-on-stale   # exit 2 if any required check is stale

## The problem this catches

GitHub branch protection's "required status checks" are matched by **name**
(the job's display name, or its job id if it has none — with a
" (matrix, values)" suffix for a matrix job). That name is not a stable
identifier: renaming a job, removing a job, or renaming the workflow-level
`name:` a job inherits none of GitHub's tooling warns you when it happens.
Branch protection keeps requiring the *old* name. GitHub never receives a
status under that name again, so a fresh pull request sits at "Expected —
Waiting for status to be reported" **forever**, with nothing in the PR itself
explaining why — one of the most common branch-protection support questions
on GitHub's own community forum and Stack Overflow.

A second, related failure this tool also flags: a required check whose job
exists and still has the right name, but whose *workflow* no longer triggers
on `pull_request` (or `pull_request_target`) at all. GitHub can only post a
status onto a pull request from a workflow run that pull request triggered
(or that a `workflow_run`/API call attached to its head SHA) — a workflow
that only runs `on: push` will never report to a PR either, which looks
identical to a renamed job from the branch-protection screen.

## What this tool actually does, and does not do

It is a static, read-only line/indentation scanner over already-parsed-out
`.github/workflows/*.yml` text and a required-checks list you supply. It
makes **no network calls of any kind** — it never calls the GitHub API,
never reads your branch protection settings for you, and never opens a pull
request. You paste (or point it at) the two things it compares.

It does not attempt a full YAML parse. Workflow files are regular enough
that a small indentation-aware scan finds `jobs:`, each job's `name:`, and a
`strategy: matrix:` block without a dependency — the same tradeoff this
portfolio's other workflow checkers (`pinned-actions-check`, etc.) already
make, and `classify.mjs` in the browser uses the identical scan so the CLI
and the page never disagree.

## Known limitations (read before trusting a clean report)

  - A **dynamic matrix** (`matrix: ${{ fromJson(...) }}`, or one with
    `include`/`exclude`) cannot be enumerated statically. Jobs like this are
    reported as `unverifiable` rather than silently matched or silently
    flagged stale — never guess in either direction.
  - A **reusable workflow call** (`jobs.<id>.uses: ./.github/workflows/x.yml`)
    reports its called jobs under a different naming convention
    (`<caller job> / <called job>`) that this tool does not compute. Such
    jobs are skipped, noted in a warning rather than silently ignored.
  - `if:` conditions are not evaluated. A job that is skipped on a given PR
    still reports a (successful, skipped) status under its name, so this is
    not a source of the stale-name problem this tool targets.

Exit status: 0 normally (even with stale findings, unless --fail-on-stale),
2 if --fail-on-stale was given and at least one required check is stale.
"""

import argparse
import json
import re
import sys
from itertools import product
from pathlib import Path

CURRENT = "current"
STALE = "stale"
NO_PR_TRIGGER = "current-but-no-pr-trigger"
UNVERIFIABLE = "unverifiable-dynamic-matrix"

PR_TRIGGERS = frozenset({"pull_request", "pull_request_target"})

_JOB_HEADER_RE = re.compile(r"^(?P<indent>\s*)(?P<id>[A-Za-z0-9_.-]+):\s*(?:#.*)?$")
_NAME_RE = re.compile(r"^\s*name:\s*(?P<val>.+?)\s*(?:#.*)?$")
_STRATEGY_RE = re.compile(r"^\s*strategy:\s*(?:#.*)?$")
_MATRIX_RE = re.compile(r"^\s*matrix:\s*(?:#.*)?$")
_MATRIX_LINE_RE = re.compile(r"^\s*matrix:\s*(?P<val>.*?)\s*(?:#.*)?$")
_KEYVAL_RE = re.compile(r"^\s*(?P<key>[A-Za-z0-9_.-]+):\s*(?P<val>.*?)\s*(?:#.*)?$")
_LIST_ITEM_RE = re.compile(r"^\s*-\s*(?P<val>.+?)\s*(?:#.*)?$")
_ON_LINE_RE = re.compile(r"^on:\s*(?P<val>.*?)\s*(?:#.*)?$")
_USES_WORKFLOW_RE = re.compile(r"^\s*uses:\s*\S+\.ya?ml")


def _strip_quotes(value):
    if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
        return value[1:-1]
    return value


def _indent(line):
    return len(line) - len(line.lstrip(" "))


def _is_content(line):
    stripped = line.strip()
    return bool(stripped) and not stripped.startswith("#")


def _find_top_level_block(lines, key):
    """Return (start, end) exclusive of the lines belonging under a
    top-level `<key>:` mapping, or None if the key is absent."""
    start = None
    for i, line in enumerate(lines):
        if re.match(rf"^{re.escape(key)}:\s*(?:#.*)?$", line):
            start = i + 1
            break
        if re.match(rf"^{re.escape(key)}:\s*\S", line) and key != "on":
            # inline scalar/flow value on the same line -- not a block form.
            return None
    if start is None:
        return None
    end = len(lines)
    for j in range(start, len(lines)):
        if _is_content(lines[j]) and _indent(lines[j]) == 0:
            end = j
            break
    return start, end


def parse_triggers(text):
    """Best-effort set of top-level `on:` event names. Handles the scalar
    ("on: push"), flow-list ("on: [push, pull_request]"), block-list, and
    block-mapping forms. Returns an empty set if `on:` cannot be found --
    callers should treat that as "unknown" rather than "no PR trigger"."""
    lines = text.splitlines()
    for i, line in enumerate(lines):
        m = _ON_LINE_RE.match(line)
        if not m:
            continue
        val = m.group("val").strip()
        if val:
            if val.startswith("["):
                inner = val.strip("[]")
                return {_strip_quotes(v.strip()) for v in inner.split(",") if v.strip()}
            return {_strip_quotes(val)}
        # Block form: collect only the `on:` block's *direct* children --
        # a nested key one level deeper (e.g. `push: branches: [...]`) is
        # config for that trigger, not a trigger name of its own.
        triggers = set()
        child_indent = None
        for line2 in lines[i + 1 :]:
            if not _is_content(line2):
                continue
            indent2 = _indent(line2)
            if indent2 == 0:
                break
            if child_indent is None:
                child_indent = indent2
            if indent2 != child_indent:
                continue
            list_m = _LIST_ITEM_RE.match(line2)
            if list_m:
                triggers.add(_strip_quotes(list_m.group("val")))
                continue
            kv_m = _KEYVAL_RE.match(line2)
            if kv_m:
                triggers.add(kv_m.group("key"))
        return triggers
    return set()


def _parse_matrix_block(lines, start, end, field_indent):
    """Parse a `matrix:` block's direct children. Returns
    (ordered_keys_and_values, dynamic) where ordered_keys_and_values is a
    list of (key, [values]) tuples in declaration order."""
    axes = []
    dynamic = False
    i = start
    while i < end:
        line = lines[i]
        if not _is_content(line):
            i += 1
            continue
        indent = _indent(line)
        if indent <= field_indent:
            break
        if indent != field_indent + 2 and axes == [] and not dynamic:
            # Tolerate any single consistent deeper indent width, not just 2.
            pass
        kv = _KEYVAL_RE.match(line)
        if not kv:
            i += 1
            continue
        key, val = kv.group("key"), kv.group("val").strip()
        if key in ("include", "exclude"):
            dynamic = True
            i += 1
            continue
        if "${{" in val:
            dynamic = True
            i += 1
            continue
        if val.startswith("["):
            inner = val.strip("[]")
            values = [_strip_quotes(v.strip()) for v in inner.split(",") if v.strip()]
            axes.append((key, values))
            i += 1
            continue
        if val:
            axes.append((key, [_strip_quotes(val)]))
            i += 1
            continue
        # Block-sequence form: collect deeper `- value` lines.
        values = []
        j = i + 1
        key_indent = indent
        while j < end:
            l2 = lines[j]
            if not _is_content(l2):
                j += 1
                continue
            if _indent(l2) <= key_indent:
                break
            item = _LIST_ITEM_RE.match(l2)
            if item:
                if "${{" in item.group("val"):
                    dynamic = True
                values.append(_strip_quotes(item.group("val")))
            j += 1
        axes.append((key, values))
        i = j
        continue
    return axes, dynamic


def _matrix_check_name_suffixes(axes):
    """Cartesian product of matrix axis values, in declared order, formatted
    the way GitHub Actions names a matrix job's check run:
    "<job name> (<value1>, <value2>, ...)"."""
    if not axes:
        return []
    value_lists = [values for _key, values in axes if values]
    if len(value_lists) != len(axes):
        return []  # an axis with no resolvable values -- do not guess
    combos = product(*value_lists)
    return [", ".join(combo) for combo in combos]


def _parse_job(lines, seg_start, seg_end):
    field_indent = None
    for i in range(seg_start, seg_end):
        if _is_content(lines[i]):
            field_indent = _indent(lines[i])
            break
    result = {"name": None, "matrix_axes": [], "dynamic_matrix": False, "reusable": False}
    if field_indent is None:
        return result
    i = seg_start
    while i < seg_end:
        line = lines[i]
        if not _is_content(line):
            i += 1
            continue
        indent = _indent(line)
        if indent != field_indent:
            i += 1
            continue
        if _USES_WORKFLOW_RE.match(line):
            result["reusable"] = True
            i += 1
            continue
        name_m = _NAME_RE.match(line)
        if name_m and line.strip().startswith("name:"):
            result["name"] = _strip_quotes(name_m.group("val"))
            i += 1
            continue
        if _STRATEGY_RE.match(line.strip()):
            # Find `matrix:` among strategy's direct children.
            strat_field_indent = None
            j = i + 1
            while j < seg_end and _is_content(lines[j]) is False:
                j += 1
            if j < seg_end and _indent(lines[j]) > indent:
                strat_field_indent = _indent(lines[j])
            k = i + 1
            while k < seg_end:
                l2 = lines[k]
                if not _is_content(l2):
                    k += 1
                    continue
                if _indent(l2) <= indent:
                    break
                if strat_field_indent is not None and _indent(l2) == strat_field_indent:
                    matrix_line_m = _MATRIX_LINE_RE.match(l2.strip())
                    if matrix_line_m:
                        inline_val = matrix_line_m.group("val").strip()
                        if inline_val:
                            # The whole matrix is a single-line expression
                            # (e.g. `matrix: ${{ fromJson(...) }}`), not a
                            # block of per-axis lists -- unenumerable.
                            result["matrix_axes"] = []
                            result["dynamic_matrix"] = True
                            k += 1
                            continue
                        m_start = k + 1
                        m_end = k + 1
                        while m_end < seg_end:
                            l3 = lines[m_end]
                            if _is_content(l3) and _indent(l3) <= strat_field_indent:
                                break
                            m_end += 1
                        axes, dynamic = _parse_matrix_block(lines, m_start, m_end, strat_field_indent)
                        result["matrix_axes"] = axes
                        result["dynamic_matrix"] = dynamic
                        k = m_end
                        continue
                k += 1
            i = k
            continue
        i += 1
    return result


def scan_text(text, filename="<workflow>"):
    """Scan one workflow file's text. Returns a list of job-report dicts:
    {file, job_id, base_name, check_names, dynamic, reusable, runs_on_pr}."""
    lines = text.splitlines()
    triggers = parse_triggers(text)
    runs_on_pr = bool(triggers & PR_TRIGGERS) if triggers else None  # None = unknown

    block = _find_top_level_block(lines, "jobs")
    if block is None:
        return []
    start, end = block

    job_indent = None
    for i in range(start, end):
        if _is_content(lines[i]):
            job_indent = _indent(lines[i])
            break
    if job_indent is None:
        return []

    reports = []
    i = start
    while i < end:
        line = lines[i]
        if _is_content(line) and _indent(line) == job_indent:
            header = _JOB_HEADER_RE.match(line)
            if header:
                job_id = header.group("id")
                seg_start = i + 1
                j = seg_start
                while j < end:
                    if _is_content(lines[j]) and _indent(lines[j]) <= job_indent:
                        break
                    j += 1
                parsed = _parse_job(lines, seg_start, j)
                base_name = parsed["name"] or job_id
                if parsed["reusable"]:
                    check_names = None
                elif parsed["dynamic_matrix"]:
                    check_names = None
                elif parsed["matrix_axes"]:
                    suffixes = _matrix_check_name_suffixes(parsed["matrix_axes"])
                    check_names = [f"{base_name} ({s})" for s in suffixes] if suffixes else None
                else:
                    check_names = [base_name]
                reports.append(
                    {
                        "file": filename,
                        "job_id": job_id,
                        "base_name": base_name,
                        "check_names": check_names,
                        "dynamic": check_names is None and not parsed["reusable"],
                        "reusable": parsed["reusable"],
                        "runs_on_pr": runs_on_pr,
                    }
                )
                i = j
                continue
        i += 1
    return reports


def scan_files(files):
    reports = []
    for f in files:
        reports.extend(scan_text(f["text"], f.get("name", "<workflow>")))
    return reports


def discover_workflow_files(root):
    workflows_dir = Path(root) / ".github" / "workflows"
    if not workflows_dir.is_dir():
        return []
    files = list(workflows_dir.glob("*.yml")) + list(workflows_dir.glob("*.yaml"))
    return sorted(files)


def scan_path(root):
    reports = []
    for path in discover_workflow_files(root):
        try:
            text = path.read_text(encoding="utf-8")
        except OSError as exc:
            print(f"warning: could not read {path}: {exc}", file=sys.stderr)
            continue
        reports.extend(scan_text(text, filename=str(path)))
    return reports


def parse_required_checks(text):
    """Accepts the JSON shape of `GET .../branches/:branch/protection`
    (`required_status_checks.contexts`, or the newer `.checks[].context`),
    a bare JSON list of strings, or plain text with one name per line
    (an optional leading "- " bullet is stripped for convenience)."""
    stripped = text.strip()
    if stripped:
        try:
            parsed = json.loads(stripped)
        except (json.JSONDecodeError, ValueError):
            parsed = None
        if parsed is not None:
            if isinstance(parsed, list):
                return [str(v) for v in parsed if str(v).strip()]
            if isinstance(parsed, dict):
                if isinstance(parsed.get("contexts"), list):
                    return [str(v) for v in parsed["contexts"] if str(v).strip()]
                if isinstance(parsed.get("required_status_checks"), dict):
                    inner = parsed["required_status_checks"]
                    if isinstance(inner.get("contexts"), list):
                        return [str(v) for v in inner["contexts"] if str(v).strip()]
                if isinstance(parsed.get("checks"), list):
                    return [
                        str(c["context"])
                        for c in parsed["checks"]
                        if isinstance(c, dict) and str(c.get("context", "")).strip()
                    ]
    names = []
    for line in text.splitlines():
        candidate = line.strip()
        if candidate.startswith("- "):
            candidate = candidate[2:].strip()
        if candidate:
            names.append(candidate)
    return names


def compare(required_names, reports):
    """Returns a list of {name, status, note} for each required check."""
    all_current = set()
    no_pr_names = set()
    unverifiable_bases = []  # list of (base_name, note)
    for r in reports:
        if r["reusable"]:
            unverifiable_bases.append(
                (
                    r["base_name"],
                    "this job calls a reusable workflow (`uses: <file>.yml`), whose check-run naming convention (typically \"<caller job> / <called job>\") this tool does not compute -- this tool cannot confirm whether the name still exists.",
                )
            )
            continue
        if r["dynamic"]:
            unverifiable_bases.append(
                (
                    r["base_name"],
                    "a job with this base name has a dynamic or include/exclude matrix that cannot be enumerated statically -- this tool cannot confirm whether the name still exists.",
                )
            )
            continue
        for name in r["check_names"] or []:
            if r["runs_on_pr"] is False:
                no_pr_names.add(name)
            else:
                all_current.add(name)

    def _unverifiable_match(name):
        for base, note in unverifiable_bases:
            if name == base or name.startswith(base + " (") or name.startswith(base + " / "):
                return note
        return None

    results = []
    for name in required_names:
        if name in all_current:
            results.append({"name": name, "status": CURRENT, "note": None})
        elif name in no_pr_names:
            results.append(
                {
                    "name": name,
                    "status": NO_PR_TRIGGER,
                    "note": "the job exists with this exact name, but its workflow does not trigger on pull_request (or pull_request_target) -- it can never post this status to a pull request either.",
                }
            )
        elif _unverifiable_match(name) is not None:
            results.append({"name": name, "status": UNVERIFIABLE, "note": _unverifiable_match(name)})
        else:
            results.append(
                {
                    "name": name,
                    "status": STALE,
                    "note": "no job in the scanned workflow(s) currently reports a status under this exact name. GitHub will never satisfy this required check again -- every new pull request will sit at \"Expected — Waiting for status to be reported\" forever until it is removed from branch protection or a job is renamed/added to match.",
                }
            )
    return results


def has_stale(results):
    return any(r["status"] == STALE for r in results)


def render_text(reports, results):
    lines = []
    if results is None:
        if not reports:
            lines.append("No jobs found under jobs: in the scanned workflow(s).")
        else:
            lines.append(f"{len(reports)} job(s) found. Computed check name(s) a required-status-check list could reference:")
            for r in reports:
                if r["reusable"]:
                    lines.append(f"  ?? {r['file']} : {r['job_id']}  (calls a reusable workflow -- check name convention not computed)")
                elif r["dynamic"]:
                    lines.append(f"  ?? {r['file']} : {r['job_id']}  (dynamic/include-exclude matrix -- names not enumerable)")
                else:
                    for name in r["check_names"]:
                        pr_note = "" if r["runs_on_pr"] is not False else "  [workflow does not trigger on pull_request]"
                        lines.append(f"  -- {name}{pr_note}")
            lines.append("")
            lines.append("Pass --required-checks <file> to compare these against your branch protection settings.")
        return "\n".join(lines)

    stale = [r for r in results if r["status"] == STALE]
    no_pr = [r for r in results if r["status"] == NO_PR_TRIGGER]
    unverifiable = [r for r in results if r["status"] == UNVERIFIABLE]
    current = [r for r in results if r["status"] == CURRENT]

    for r in stale:
        lines.append(f"!! STALE  {r['name']}")
        lines.append(f"     {r['note']}")
        lines.append("")
    for r in no_pr:
        lines.append(f"!! NO-PR-TRIGGER  {r['name']}")
        lines.append(f"     {r['note']}")
        lines.append("")
    for r in unverifiable:
        lines.append(f"??  UNVERIFIABLE  {r['name']}")
        lines.append(f"     {r['note']}")
        lines.append("")

    lines.append(
        f"{len(current)} current, {len(no_pr)} matched-but-no-pr-trigger, "
        f"{len(unverifiable)} unverifiable, {len(stale)} stale, of {len(results)} required check(s)."
    )
    if stale or no_pr:
        lines.append(
            "A stale or no-pr-trigger required check blocks every future pull request "
            "from ever becoming mergeable through the normal UI. Remove it from branch "
            "protection, or rename/re-trigger the job so it reports under that name again."
        )
    return "\n".join(lines)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("path", nargs="?", default=".", help="directory to scan (default: current directory)")
    parser.add_argument(
        "--required-checks",
        metavar="FILE",
        help="file with required status check names (JSON branch-protection shape, JSON list, or one name per line). Use - for stdin.",
    )
    parser.add_argument("--format", choices=("text", "json"), default="text", help="output format")
    parser.add_argument(
        "--fail-on-stale",
        action="store_true",
        help="exit 2 when any required check is stale (no job can report it)",
    )
    args = parser.parse_args(argv)

    reports = scan_path(args.path)
    results = None
    if args.required_checks:
        if args.required_checks == "-":
            required_text = sys.stdin.read()
        else:
            required_text = Path(args.required_checks).read_text(encoding="utf-8")
        required_names = parse_required_checks(required_text)
        results = compare(required_names, reports)

    if args.format == "json":
        print(json.dumps({"jobs": reports, "results": results}, indent=2))
    else:
        print(render_text(reports, results))

    if args.fail_on_stale and results is not None and has_stale(results):
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
