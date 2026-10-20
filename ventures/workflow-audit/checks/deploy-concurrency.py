#!/usr/bin/env python3
"""Find the ways a GitHub Actions deploy workflow can apply an older revision.

    python3 check.py .github/workflows/*.yml
    python3 check.py .github/workflows/ --fail-on-risk
    python3 check.py deploy.yml --json

A deploy that races itself does not fail. It succeeds, twice, in the wrong
order -- and the evidence is a green check on the newer commit sitting above a
live site running the older one. Nothing in the run log says "this overwrote
something newer", because from inside the run nothing did.

This is a line-for-line port of `classify.mjs`, which is the browser tool's
logic. `classify.test.mjs` runs both over the same fixtures and asserts
identical findings, so the page and the CLI cannot drift apart.

Stdlib only, no network, read-only: it opens the files you name and prints. It
never calls the GitHub API, never reads a token, and never edits a workflow.

Exit codes:
    0   no findings, or findings but --fail-on-risk was not passed
    1   --fail-on-risk was passed and at least one high-risk finding was made
    2   bad usage (no such file, nothing to scan)
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys

RISK_HIGH = "high"
RISK_MEDIUM = "medium"

NO_CONCURRENCY = "no-concurrency"
PER_RUN_GROUP = "per-run-concurrency-group"
CANCEL_IN_PROGRESS = "cancel-in-progress-on-deploy"
SPLIT_GROUP = "split-concurrency-group"
MUTABLE_REF = "mutable-ref-checkout"

# Keep in the same order as classify.mjs's PER_RUN_CONTEXTS: the parity test
# compares findings, but a reader comparing the two files should see one list.
PER_RUN_CONTEXTS = [
    "github.sha",
    "github.run_id",
    "github.run_number",
    "github.run_attempt",
    "github.event.head_commit.id",
    "github.event.after",
    "github.event.pull_request.head.sha",
]

DEPLOY_WORD_RE = re.compile(
    r"(^|[-_ ])(deploy|publish|release|promote|rollout|ship)([-_ ]|$)", re.IGNORECASE
)

DEPLOY_ACTION_PREFIXES = [
    "actions/deploy-pages",
    "peaceiris/actions-gh-pages",
    "JamesIves/github-pages-deploy-action",
    "aws-actions/amazon-ecs-deploy-task-definition",
    "google-github-actions/deploy-cloudrun",
    "Azure/webapps-deploy",
    "superfly/flyctl-actions",
]

JOB_KEY_RE = re.compile(r"^(\s*)([A-Za-z0-9_.-]+):\s*(?:#.*)?$")
KEYVAL_RE = re.compile(r"^\s*([A-Za-z0-9_.-]+):\s*(.*?)\s*$")
USES_RE = re.compile(r"^\s*(?:-\s*)?uses:\s*(\S+)")
A_SHA_RE = re.compile(r"^[0-9a-f]{7,40}$", re.IGNORECASE)


def strip_comment(value: str) -> str:
    """Drop a trailing comment, but never a `#` inside quotes -- that is data."""
    quote = None
    for i, c in enumerate(value):
        if quote:
            if c == quote:
                quote = None
        elif c in ('"', "'"):
            quote = c
        elif c == "#" and (i == 0 or value[i - 1].isspace()):
            return value[:i]
    return value


def strip_quotes(value: str) -> str:
    v = value.strip()
    if len(v) >= 2 and v[0] == v[-1] and v[0] in ('"', "'"):
        return v[1:-1]
    return v


def clean(value: str) -> str:
    return strip_quotes(strip_comment(value).strip())


def indent_of(line: str) -> int:
    return len(line) - len(line.lstrip(" "))


def is_content(line: str) -> bool:
    t = line.strip()
    return bool(t) and not t.startswith("#")


def block_of(lines, start_index):
    """Lines belonging to the block headed at `start_index`, 1-based numbers."""
    base = indent_of(lines[start_index])
    out = []
    for i in range(start_index + 1, len(lines)):
        if not is_content(lines[i]):
            out.append((i + 1, lines[i]))
            continue
        if indent_of(lines[i]) <= base:
            break
        out.append((i + 1, lines[i]))
    return out


def read_concurrency(lines, index):
    raw = strip_comment(lines[index])
    inline = re.sub(r"^\s*concurrency:\s*", "", raw).strip()
    if inline and not inline.startswith("#"):
        return {
            "group": strip_quotes(inline),
            "group_line": index + 1,
            "cancel": None,
            "cancel_line": None,
            "line": index + 1,
        }
    group = group_line = cancel = cancel_line = None
    for line, text in block_of(lines, index):
        if not is_content(text):
            continue
        m = KEYVAL_RE.match(strip_comment(text))
        if not m:
            continue
        if m.group(1) == "group":
            group = strip_quotes(m.group(2))
            group_line = line
        elif m.group(1) == "cancel-in-progress":
            cancel = clean(m.group(2)).lower()
            cancel_line = line
    return {
        "group": group,
        "group_line": group_line,
        "cancel": cancel,
        "cancel_line": cancel_line,
        "line": index + 1,
    }


def read_jobs(lines):
    jobs_header = None
    for i, line in enumerate(lines):
        if is_content(line) and indent_of(line) == 0 and re.match(r"^jobs:\s*(?:#.*)?$", strip_comment(line)):
            jobs_header = i
            break
    if jobs_header is None:
        return []

    body = [(n, t) for n, t in block_of(lines, jobs_header) if is_content(t)]
    if not body:
        return []
    job_indent = min(indent_of(t) for _, t in body)

    headers = []
    for line, text in body:
        if indent_of(text) != job_indent:
            continue
        m = JOB_KEY_RE.match(strip_comment(text))
        if not m:
            continue
        headers.append({"id": m.group(2), "header_line": line, "header_index": line - 1})

    jobs = []
    for job in headers:
        inner = block_of(lines, job["header_index"])
        content = [(n, t) for n, t in inner if is_content(t)]
        if not content:
            jobs.append({**job, "name": None, "environment": None, "concurrency": None,
                         "uses": [], "checkout_refs": []})
            continue
        job_body_indent = min(indent_of(t) for _, t in content)

        name = environment = concurrency = None
        uses = []
        checkout_refs = []

        for k, (line, text) in enumerate(inner):
            if not is_content(text):
                continue
            stripped = strip_comment(text)
            kv = KEYVAL_RE.match(stripped)
            depth = indent_of(text)

            if kv and depth == job_body_indent:
                key, value = kv.group(1), kv.group(2)
                if key == "name":
                    name = clean(value)
                elif key == "concurrency":
                    concurrency = read_concurrency(lines, line - 1)
                elif key == "environment":
                    v = clean(value)
                    if v:
                        environment = v
                    else:
                        for sub_line, sub_text in block_of(lines, line - 1):
                            sm = KEYVAL_RE.match(strip_comment(sub_text))
                            if sm and sm.group(1) == "name":
                                environment = clean(sm.group(2))
                                break

            um = USES_RE.match(stripped)
            if um:
                value = strip_quotes(um.group(1))
                uses.append({"line": line, "value": value})
                if re.match(r"^actions/checkout(@|$)", value):
                    step_indent = indent_of(text)
                    for j in range(k + 1, len(inner)):
                        next_line, next_text = inner[j]
                        if not is_content(next_text):
                            continue
                        if indent_of(next_text) <= step_indent and re.match(r"^\s*-\s", next_text):
                            break
                        if indent_of(next_text) < step_indent:
                            break
                        rm = KEYVAL_RE.match(strip_comment(next_text))
                        if rm and rm.group(1) == "ref":
                            checkout_refs.append({"line": next_line, "value": clean(rm.group(2))})
                            break

        jobs.append({**job, "name": name, "environment": environment,
                     "concurrency": concurrency, "uses": uses, "checkout_refs": checkout_refs})
    return jobs


def read_workflow_concurrency(lines):
    for i, line in enumerate(lines):
        if not is_content(line) or indent_of(line) != 0:
            continue
        if re.match(r"^concurrency:", strip_comment(line)):
            return read_concurrency(lines, i)
    return None


def read_workflow_name(lines):
    for line in lines:
        if not is_content(line) or indent_of(line) != 0:
            continue
        m = KEYVAL_RE.match(strip_comment(line))
        if m and m.group(1) == "name":
            return clean(m.group(2))
    return None


def deploy_signal(job):
    if job["environment"]:
        return "declares `environment: %s`" % job["environment"]
    for u in job["uses"]:
        for prefix in DEPLOY_ACTION_PREFIXES:
            if u["value"].lower().startswith(prefix.lower()):
                return "runs `%s`" % u["value"]
    if DEPLOY_WORD_RE.search(job["id"]):
        return "is named as a deployment by its job id"
    if job["name"] and DEPLOY_WORD_RE.search(job["name"]):
        return 'is named as a deployment by its job name ("%s")' % job["name"]
    return None


def per_run_contexts_in(expression):
    if not expression:
        return []
    lowered = expression.lower()
    return [ctx for ctx in PER_RUN_CONTEXTS if ctx.lower() in lowered]


def classify_workflow(text, file="workflow.yml"):
    lines = re.split(r"\r?\n", text)
    workflow = read_workflow_name(lines)
    workflow_concurrency = read_workflow_concurrency(lines)
    jobs = read_jobs(lines)

    deploy_jobs = []
    for job in jobs:
        signal = deploy_signal(job)
        if signal:
            deploy_jobs.append({**job, "signal": signal})

    findings = []

    def add(**f):
        findings.append({"file": file, "workflow": workflow, **f})

    for job in deploy_jobs:
        effective = job["concurrency"] or workflow_concurrency
        scope = "job" if job["concurrency"] else ("workflow" if workflow_concurrency else None)
        target = job["environment"] or "production"

        if not effective:
            add(
                id=NO_CONCURRENCY,
                risk=RISK_HIGH,
                job=job["id"],
                line=job["header_line"],
                title="Deploying job with no concurrency group",
                detail=(
                    "`%s` %s, and neither it nor the workflow declares `concurrency:`. "
                    "Two pushes in quick succession run at the same time, and the "
                    "deployment that lands is whichever finishes last -- not necessarily "
                    "the newer commit. A slow run started at an older commit can "
                    "overwrite a newer deployment minutes after it went live."
                    % (job["id"], job["signal"])
                ),
                fix=(
                    "Add a concurrency group keyed on the deployment target, and queue "
                    "rather than cancel:\n\nconcurrency:\n  group: deploy-%s\n"
                    "  cancel-in-progress: false" % target
                ),
            )
        else:
            per_run = per_run_contexts_in(effective["group"])
            if effective["group"] and per_run:
                add(
                    id=PER_RUN_GROUP,
                    risk=RISK_HIGH,
                    job=job["id"],
                    line=effective["group_line"] or effective["line"],
                    title="Concurrency group changes every run, so it serializes nothing",
                    detail=(
                        "The %s-level group is `%s`, which contains `%s`. That value is "
                        "different on every run, so every run gets a group of its own and "
                        "no run ever waits for another. This is the same race as having no "
                        "`concurrency:` block at all, except that the block is there and "
                        "reads as protection -- which is why it survives review."
                        % (scope, effective["group"], "`, `".join(per_run))
                    ),
                    fix=(
                        "Key the group on what is being deployed to, not on which run is "
                        "doing it:\n\nconcurrency:\n  group: deploy-%s\n"
                        "  cancel-in-progress: false" % target
                    ),
                )

            if effective["cancel"] == "true":
                add(
                    id=CANCEL_IN_PROGRESS,
                    risk=RISK_MEDIUM,
                    job=job["id"],
                    line=effective["cancel_line"] or effective["line"],
                    title="cancel-in-progress on a deploying job",
                    detail=(
                        "`%s` %s and its %s-level concurrency sets `cancel-in-progress: "
                        "true`. That is the right setting for a test run, where the only "
                        "cost of cancelling is time. A deploy cancelled halfway through has "
                        "already written part of its change -- half a copied artifact, some "
                        "of a batch of uploaded files, a migration that ran without the code "
                        "that expects it -- and nothing re-runs to finish the job."
                        % (job["id"], job["signal"], scope)
                    ),
                    fix=(
                        "For a deploy, queue instead of cancelling:\n\n"
                        "  cancel-in-progress: false\n\nThe newer run then waits and applies "
                        "last, which is the order you want."
                    ),
                )

        for ref in job["checkout_refs"]:
            value = ref["value"]
            if not value or A_SHA_RE.match(value) or "${{" in value:
                continue
            add(
                id=MUTABLE_REF,
                risk=RISK_MEDIUM,
                job=job["id"],
                line=ref["line"],
                title="Deploying job checks out a moving branch, not the commit that triggered it",
                detail=(
                    "`%s` %s and checks out `ref: %s`. A branch name resolves when the step "
                    "runs, not when the run was queued, so a job that waits in a queue -- or "
                    "is re-run later -- deploys whatever that branch points at by then. The "
                    "commit that was reviewed and the commit that ships are then two "
                    "different trees, and nothing in the run's own logs says so."
                    % (job["id"], job["signal"], value)
                ),
                fix=(
                    "Check out the triggering commit so a queued or re-run job ships what it "
                    "was queued for:\n\n  with:\n    ref: ${{ github.sha }}"
                ),
            )

    by_environment = {}
    for job in deploy_jobs:
        if not job["environment"]:
            continue
        by_environment.setdefault(job["environment"], []).append(job)

    for environment, group in by_environment.items():
        if len(group) < 2:
            continue
        expressions = []
        for job in group:
            effective = job["concurrency"] or workflow_concurrency
            expressions.append(effective["group"] if effective and effective["group"] else "(none)")
        unique = list(dict.fromkeys(expressions))
        if len(unique) > 1:
            ids = "`, `".join(j["id"] for j in group)
            add(
                id=SPLIT_GROUP,
                risk=RISK_HIGH,
                job=", ".join(j["id"] for j in group),
                line=group[0]["header_line"],
                title="Jobs deploying to `%s` are in different concurrency groups" % environment,
                detail=(
                    "`%s` all deploy to `%s`, but they resolve to %d different concurrency "
                    "groups (%s). A group only serializes runs that share it, so these jobs "
                    "can reach the same target at the same time and the last writer wins."
                    % (ids, environment, len(unique), ", ".join("`%s`" % e for e in unique))
                ),
                fix=(
                    "Give every job that writes to `%s` the same group:\n\nconcurrency:\n"
                    "  group: deploy-%s\n  cancel-in-progress: false" % (environment, environment)
                ),
            )

    findings.sort(key=lambda f: (f["line"] or 0, f["id"]))
    return {
        "file": file,
        "workflow": workflow,
        "deploy_jobs": [
            {
                "id": j["id"],
                "name": j["name"],
                "environment": j["environment"],
                "line": j["header_line"],
                "signal": j["signal"],
            }
            for j in deploy_jobs
        ],
        "findings": findings,
    }


def classify_all(files):
    """Scan several workflows, adding the race a single-file scan cannot see."""
    reports = [classify_workflow(text, name) for name, text in files]
    texts = dict(files)

    by_environment = {}
    for report in reports:
        for job in report["deploy_jobs"]:
            if not job["environment"]:
                continue
            by_environment.setdefault(job["environment"], []).append((report, job))

    for environment, entries in by_environment.items():
        file_names = list(dict.fromkeys(e[0]["file"] for e in entries))
        if len(file_names) < 2:
            continue
        groups = {}
        for report, job in entries:
            lines = re.split(r"\r?\n", texts[report["file"]])
            wf = read_workflow_concurrency(lines)
            own = next((j for j in read_jobs(lines) if j["id"] == job["id"]), None)
            effective = (own and own["concurrency"]) or wf
            groups[report["file"]] = effective["group"] if effective and effective["group"] else "(none)"
        unique = list(dict.fromkeys(groups.values()))
        if len(unique) > 1:
            # Attach it to the first file that actually deploys to this
            # environment. Hanging a cross-file finding off reports[0] put it
            # under an unrelated workflow, which is how a true finding gets
            # read as noise.
            host = next((r for r in reports if r["file"] == file_names[0]), reports[0])
            host["findings"].append(
                {
                    "file": ", ".join(file_names),
                    "workflow": None,
                    "id": SPLIT_GROUP,
                    "risk": RISK_HIGH,
                    "job": ", ".join(job["id"] for _, job in entries),
                    "line": None,
                    "title": "Two workflows deploy to `%s` under different concurrency groups"
                    % environment,
                    "detail": (
                        "%s both deploy to `%s`, resolving to %s. Each file is internally "
                        "consistent, which is why this survives review of either one on its "
                        "own -- but a group only serializes runs that share it, so a manual "
                        "deploy and a push-triggered deploy can apply to the same target at "
                        "once."
                        % (
                            " and ".join("`%s`" % f for f in file_names),
                            environment,
                            " and ".join("`%s`" % g for g in unique),
                        )
                    ),
                    "fix": (
                        "Use one group name for the target in every workflow that writes to "
                        "it:\n\nconcurrency:\n  group: deploy-%s\n  cancel-in-progress: false"
                        % environment
                    ),
                }
            )

    return reports


def worst_risk(findings):
    if any(f["risk"] == RISK_HIGH for f in findings):
        return RISK_HIGH
    if any(f["risk"] == RISK_MEDIUM for f in findings):
        return RISK_MEDIUM
    return None


def collect(paths):
    """Expand directories to the workflow files inside them."""
    out = []
    for path in paths:
        if os.path.isdir(path):
            for entry in sorted(os.listdir(path)):
                if entry.endswith((".yml", ".yaml")):
                    out.append(os.path.join(path, entry))
        else:
            out.append(path)
    return out


def render(reports, show_clean):
    lines = []
    total = 0
    for report in reports:
        findings = report["findings"]
        total += len(findings)
        if not findings:
            if show_clean:
                jobs = report["deploy_jobs"]
                if jobs:
                    lines.append("%s: %d deploying job(s), nothing to report."
                                 % (report["file"], len(jobs)))
                else:
                    lines.append("%s: no deploying job found." % report["file"])
            continue
        lines.append("")
        lines.append("%s" % report["file"])
        for f in findings:
            where = ":%s" % f["line"] if f["line"] else ""
            lines.append("  [%s] %s%s  %s" % (f["risk"].upper(), f["id"], where, f["title"]))
            lines.append("      %s" % f["detail"])
            for fix_line in f["fix"].split("\n"):
                lines.append("      %s" % fix_line if fix_line else "")
    if total == 0:
        lines.append("")
        lines.append("No deployment race found in %d file(s)." % len(reports))
    else:
        lines.append("")
        lines.append(
            "%d finding(s) across %d file(s). Each one is a way an older revision "
            "can end up live." % (total, len(reports))
        )
    return "\n".join(lines).rstrip() + "\n"


def main(argv=None):
    parser = argparse.ArgumentParser(
        description="Find the ways a GitHub Actions deploy workflow can apply an older revision.",
    )
    parser.add_argument("paths", nargs="+", help="workflow files, or a directory of them")
    parser.add_argument("--json", action="store_true", help="machine-readable output")
    parser.add_argument(
        "--fail-on-risk",
        action="store_true",
        help="exit 1 if any high-risk finding is made (for use in CI)",
    )
    parser.add_argument(
        "--quiet", action="store_true", help="do not list files that had nothing to report"
    )
    args = parser.parse_args(argv)

    paths = collect(args.paths)
    if not paths:
        print("nothing to scan", file=sys.stderr)
        return 2

    files = []
    for path in paths:
        try:
            with open(path, encoding="utf-8") as handle:
                files.append((path, handle.read()))
        except OSError as exc:
            print("cannot read %s: %s" % (path, exc), file=sys.stderr)
            return 2

    reports = classify_all(files)

    if args.json:
        # One file in, one object out -- so `check.py x.yml --json | jq` reads
        # naturally. Several files in, a list, because a caller passing many
        # needs to know which findings came from where.
        payload = reports[0] if len(reports) == 1 else reports
        print(json.dumps(payload, indent=2, sort_keys=True))
    else:
        sys.stdout.write(render(reports, show_clean=not args.quiet))

    if args.fail_on_risk:
        all_findings = [f for r in reports for f in r["findings"]]
        if worst_risk(all_findings) == RISK_HIGH:
            return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
