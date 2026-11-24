#!/usr/bin/env python3
"""Keep unprivileged workflows unprivileged: read-only and secret-free.

Why this exists
---------------
Agents may edit CI without the owner's approval, except where an edit could
hand an agent a secret, a write token or a weaker merge gate
(docs/security/agent-hardening.md, "Two tiers of CI"). Workflows that need any
of those are named `.github/workflows/priv-*.yml` and are owned in
`.github/CODEOWNERS`. Every other workflow merges without review, so this
check (a required status check, `ci-policy`) refuses one that is not
read-only and secret-free, and refuses the known ways around that:

  * a missing `permissions` block (the job would get the repository default),
    `write-all`, any `: write`, `id-token`;
  * any expression that names `secrets` other than `secrets.GITHUB_TOKEN`
    (which the read-only permissions make harmless), `secrets: inherit`, a
    job-level `secrets:` map, `environment:` (environment secrets);
  * `pull_request_target` and `workflow_run` triggers (base-repo context);
  * a reusable-workflow call to a `priv-` workflow, or to any remote one that
    is not pinned and allowlisted;
  * a step action that is not pinned to a full commit SHA on the allowlist in
    `.github/ci-policy.yaml`;
  * a runner that is not GitHub-hosted (or the owner-set `vars.CI_RUNNER`
    switch, matched as an exact expression);
  * `actions/checkout` without `persist-credentials: false`;
  * a workflow `name:` copied from a `priv-` workflow (`workflow_run`
    triggers match on it) or a job named like a required status check in
    `.github/rulesets/main.json` (a same-named passing check can satisfy the
    requirement);
  * YAML anchors, aliases, merge keys, explicit tags and duplicate keys, where
    this parser and GitHub's could read the same file differently.

For `priv-` workflows (reviewed by the owner anyway) it checks what the owner
could easily miss in review: that every repo file a secret- or write-holding
job runs is itself owner-owned (or listed, with a reason, under
`privileged_code_accepted`), that such jobs restore no cache an unprivileged
workflow could have written, download no other run's artifacts, call no
unprivileged reusable workflow, and that `workflow_run` names only `priv-`
workflows.

Run it isolated (`python3 -I`), as the workflow does, so a stray module next
to it cannot shadow `yaml`. Needs PyYAML.

    python3 -I platform/ci/ci_policy_check.py
    python3 -I platform/ci/ci_policy_check.py --entrypoints   # what priv jobs run
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path

import yaml

REPO_ROOT = Path(__file__).resolve().parents[2]
POLICY_FILE = REPO_ROOT / ".github" / "ci-policy.yaml"
RULESET_FILE = REPO_ROOT / ".github" / "rulesets" / "main.json"
PRIV_PREFIX = "priv-"

# Loaded by path, not `import`: under `python3 -I` this directory is not on
# sys.path, and the guard is owner-owned like this file.
_spec = importlib.util.spec_from_file_location(
    "control_plane_guard", Path(__file__).resolve().parent / "control_plane_guard.py"
)
guard = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(guard)


class PolicyError(Exception):
    pass


# ---------------------------------------------------------------- YAML ----


class StrictLoader(yaml.SafeLoader):
    """SafeLoader that refuses what GitHub and PyYAML might read differently."""

    def compose_node(self, parent, index):
        event = self.peek_event()
        if isinstance(event, yaml.AliasEvent):
            raise PolicyError(f"YAML alias *{event.anchor} (line {event.start_mark.line + 1}): anchors and aliases are not allowed")
        if getattr(event, "anchor", None):
            raise PolicyError(f"YAML anchor &{event.anchor} (line {event.start_mark.line + 1}): anchors and aliases are not allowed")
        tag = getattr(event, "tag", None)
        if tag not in (None, "!"):
            raise PolicyError(f"explicit YAML tag {tag} (line {event.start_mark.line + 1}) is not allowed")
        return super().compose_node(parent, index)

    def construct_mapping(self, node, deep=False):
        seen = set()
        for key_node, _ in node.value:
            if key_node.tag == "tag:yaml.org,2002:merge":
                raise PolicyError(f"YAML merge key << (line {key_node.start_mark.line + 1}) is not allowed")
            key = self.construct_object(key_node, deep=True)
            if key in seen:
                raise PolicyError(f"duplicate key {key!r} (line {key_node.start_mark.line + 1})")
            seen.add(key)
        return super().construct_mapping(node, deep)


def load_yaml(text: str):
    try:
        return yaml.load(text, Loader=StrictLoader)  # noqa: S506 - SafeLoader subclass
    except yaml.YAMLError as exc:
        raise PolicyError(f"YAML does not parse: {exc}") from exc


def triggers(doc: dict) -> list[str]:
    on = doc.get("on", doc.get(True))  # YAML 1.1 reads a bare `on` as True
    if isinstance(on, str):
        return [on]
    if isinstance(on, list):
        return [str(x) for x in on]
    if isinstance(on, dict):
        return [str(k) for k in on]
    return []


# --------------------------------------------------------- expressions ----

EXPR = re.compile(r"\$\{\{(.*?)\}\}", re.S)
SECRETS_WORD = re.compile(r"\bsecrets\b", re.I)
GITHUB_TOKEN_TAIL = re.compile(r"\s*\.\s*github_token\b", re.I)


def walk(node, path=""):
    """Yield (path, key_or_None, string) for every string key and value."""
    if isinstance(node, dict):
        for k, v in node.items():
            sub = f"{path}.{k}" if path else str(k)
            if isinstance(k, str):
                yield sub, None, k
            if isinstance(v, str):
                yield sub, k, v
            else:
                yield from walk(v, sub)
    elif isinstance(node, list):
        for i, v in enumerate(node):
            sub = f"{path}[{i}]"
            if isinstance(v, str):
                yield sub, None, v
            else:
                yield from walk(v, sub)


def expressions(key, value: str) -> list[str]:
    found = [m.group(1) for m in EXPR.finditer(value)]
    if key == "if" and "${{" not in value:
        found.append(value)  # `if:` is an expression without the braces
    return found


def secret_refs(expr: str) -> list[str]:
    """Each use of the `secrets` context other than `secrets.GITHUB_TOKEN`."""
    bad = []
    for m in SECRETS_WORD.finditer(expr):
        if not GITHUB_TOKEN_TAIL.match(expr, m.end()):
            bad.append(expr[m.start() : m.start() + 40].strip())
    return bad


def mentions_secrets(node) -> bool:
    """True if anything in `node` reaches a secret other than GITHUB_TOKEN."""
    for _, key, value in walk(node):
        if any(secret_refs(e) for e in expressions(key, value)):
            return True
    return False


# --------------------------------------------------------- permissions ----


def permission_problems(perms) -> list[str]:
    if perms is None:
        return ["no `permissions` block, so it gets the repository's default token (may be read-write)"]
    if isinstance(perms, str):
        return [] if perms == "read-all" else [f"`permissions: {perms}` is not read-only"]
    if not isinstance(perms, dict):
        return [f"`permissions: {perms!r}` is not a mapping"]
    out = []
    for scope, level in perms.items():
        if scope == "id-token" and level != "none":
            out.append(f"`id-token: {level}` mints OIDC tokens that cloud providers trust")
        elif level not in ("read", "none"):
            out.append(f"`{scope}: {level}` is not read-only")
    return out


def effective_permissions(doc: dict, job: dict):
    return job["permissions"] if "permissions" in job else doc.get("permissions")


def is_write(perms) -> bool:
    if perms is None:
        return True  # repository default: assume the worst
    if isinstance(perms, str):
        return perms != "read-all"
    if isinstance(perms, dict):
        return any(v not in ("read", "none") for v in perms.values())
    return True


# ------------------------------------------------------------- policy ----


@dataclass
class Policy:
    actions: dict[str, set[str]]
    runner_labels: set[str]
    runner_expressions: set[str]
    accepted: list[dict] = field(default_factory=list)
    required_checks: set[str] = field(default_factory=set)

    @classmethod
    def load(cls, policy_file: Path = POLICY_FILE, ruleset_file: Path = RULESET_FILE) -> "Policy":
        raw = load_yaml(policy_file.read_text(encoding="utf-8"))
        checks: set[str] = set()
        if ruleset_file.exists():
            for rule in json.loads(ruleset_file.read_text(encoding="utf-8")).get("rules", []):
                if rule.get("type") == "required_status_checks":
                    checks |= {c["context"] for c in rule["parameters"]["required_status_checks"]}
        return cls(
            actions={k: {str(s) for s in v} for k, v in (raw.get("actions") or {}).items()},
            runner_labels=set(raw["runners"]["labels"]),
            runner_expressions={norm_ws(e) for e in raw["runners"].get("expressions", [])},
            accepted=raw.get("privileged_code_accepted") or [],
            required_checks=checks,
        )


def norm_ws(s: str) -> str:
    return " ".join(str(s).split())


SHA = re.compile(r"^[0-9a-f]{40}$")


def action_problem(uses: str, policy: Policy) -> str | None:
    uses = uses.strip()
    if uses.startswith("./"):
        return None
    if "${{" in uses:
        return f"`uses: {uses}` is computed by an expression"
    if uses.startswith("docker://"):
        name = uses
        return None if name in policy.actions else f"`uses: {uses}` is a container image not on the allowlist (.github/ci-policy.yaml)"
    name, _, ref = uses.partition("@")
    if not SHA.match(ref):
        return f"`uses: {uses}` is not pinned to a full commit SHA"
    # An allowlist key is `owner/repo` (any path in it) or `owner/repo/path`.
    keys = {name, "/".join(name.split("/")[:2])}
    if not any(ref in policy.actions.get(k, ()) for k in keys):
        return f"`uses: {uses}` (that name at that SHA) is not on the allowlist (.github/ci-policy.yaml)"
    return None


def runner_labels(runs_on, job: dict) -> list[str] | None:
    """The literal labels a job may land on, or None if unknown."""
    if isinstance(runs_on, str):
        m = re.fullmatch(r"\$\{\{\s*matrix\.([\w-]+)\s*\}\}", runs_on.strip())
        if m:
            vals = matrix_values(job, m.group(1))
            return vals if vals and all(isinstance(v, str) and "${{" not in v for v in vals) else None
        return [runs_on]
    if isinstance(runs_on, list):
        out = []
        for item in runs_on:
            got = runner_labels(item, job)
            if got is None:
                return None
            out += got
        return out
    return None  # `group:`/`labels:` mappings are runner groups (self-hosted or larger runners)


def matrix_values(job: dict, key: str) -> list:
    matrix = (job.get("strategy") or {}).get("matrix")
    if not isinstance(matrix, dict):
        return []
    vals = matrix.get(key)
    vals = list(vals) if isinstance(vals, list) else []
    for inc in matrix.get("include") or []:
        if isinstance(inc, dict) and key in inc:
            vals.append(inc[key])
    return vals


def runner_problem(job: dict, policy: Policy) -> str | None:
    runs_on = job.get("runs-on")
    if runs_on is None:
        return None  # reusable-workflow call; the callee is checked on its own
    if isinstance(runs_on, str) and norm_ws(runs_on) in policy.runner_expressions:
        return None
    labels = runner_labels(runs_on, job)
    if labels is None:
        return f"`runs-on: {runs_on}` cannot be resolved to GitHub-hosted runner labels"
    bad = [lab for lab in labels if lab not in policy.runner_labels]
    if bad:
        return f"`runs-on` label(s) {bad} are not GitHub-hosted runners on the allowlist (self-hosted runners keep state between jobs)"
    return None


def could_report_as(job_id: str, job: dict, check: str) -> bool:
    """Could this job's check run be named `check`? A job's check run is its
    `name:` (expressions evaluated) or, without one, its id. An expression is
    treated as matching anything, so a name built from `${{ matrix.x }}` or
    `${{ inputs.x }}` cannot slip a required check's name past this."""
    name = job.get("name")
    if name is None:
        return job_id == check
    parts = EXPR.split(str(name))  # literal, expr, literal, expr, ...
    pattern = "".join(re.escape(p) if i % 2 == 0 else ".*" for i, p in enumerate(parts))
    return re.fullmatch(pattern, check, re.S) is not None


# --------------------------------------------------- unprivileged rules ----


def check_unprivileged(doc: dict, policy: Policy, priv_names: set[str]) -> list[str]:
    errs: list[str] = []
    for trig in triggers(doc):
        if trig in ("pull_request_target", "workflow_run"):
            errs.append(f"trigger `{trig}` runs with the base repository's context; use a priv- workflow")

    wf_name = doc.get("name")
    if isinstance(wf_name, str) and wf_name.strip().lower() in priv_names:
        errs.append(f"workflow name {wf_name!r} copies a priv- workflow's name (workflow_run triggers match on it)")

    for path, key, value in walk(doc):
        for e in expressions(key, value):
            for ref in secret_refs(e):
                errs.append(f"{path}: expression reaches secrets ({ref!r}); only secrets.GITHUB_TOKEN is allowed")

    jobs = doc.get("jobs")
    if not isinstance(jobs, dict) or not jobs:
        errs.append("no jobs")
        return errs
    for job_id, job in jobs.items():
        if not isinstance(job, dict):
            errs.append(f"jobs.{job_id} is not a mapping")
            continue
        where = f"jobs.{job_id}"
        for p in permission_problems(effective_permissions(doc, job)):
            errs.append(f"{where}: {p}")
        if "environment" in job:
            errs.append(f"{where}: `environment:` exposes environment secrets; use a priv- workflow")
        if "secrets" in job:
            errs.append(f"{where}: `secrets:` passes secrets to a reusable workflow")
        if "uses" in job:
            target = str(job["uses"]).strip()
            if target.startswith("./"):
                if Path(target).name.startswith(PRIV_PREFIX):
                    errs.append(f"{where}: calls privileged workflow {target}")
            else:
                prob = action_problem(target, policy)
                if prob:
                    errs.append(f"{where}: {prob}")
        prob = runner_problem(job, policy)
        if prob:
            errs.append(f"{where}: {prob}")

        for check in sorted(policy.required_checks):
            if could_report_as(job_id, job, check):
                errs.append(f"{where}: could report as required status check {check!r}; a passing copy could satisfy it")

        for i, step in enumerate(job.get("steps") or []):
            if not isinstance(step, dict) or "uses" not in step:
                continue
            uses = str(step["uses"])
            prob = action_problem(uses, policy)
            if prob:
                errs.append(f"{where}.steps[{i}]: {prob}")
            if uses.split("@")[0] == "actions/checkout":
                persist = (step.get("with") or {}).get("persist-credentials", True)
                if persist not in (False, "false"):
                    errs.append(f"{where}.steps[{i}]: actions/checkout without `persist-credentials: false` leaves the token in .git/config for every later step")
    return errs


# ----------------------------------------------------- privileged rules ----


def privileged_jobs(doc: dict) -> dict[str, dict]:
    """Jobs that hold a secret, a write token or an environment."""
    out = {}
    for job_id, job in (doc.get("jobs") or {}).items():
        if not isinstance(job, dict):
            continue
        if (
            is_write(effective_permissions(doc, job))
            or mentions_secrets(job)
            or "environment" in job
            or "secrets" in job
            or mentions_secrets(doc.get("env") or {})
        ):
            out[job_id] = job
    return out


CODE_PATH = re.compile(r"(?<![\w@:/.$-])((?:\.{1,2}/)?(?:[\w.-]+/)*[\w-][\w.-]*\.(?:py|mjs|cjs|js|ts|sh|json|txt))(?![\w/-])")
BUILD_CMD = re.compile(
    r"\b(?:npm\s+(?:ci|install(?!\s+(?:-g|--global))|i(?=\s|$)|run|test|exec|publish|pack)|npx|pnpm|yarn|make)\b"
)
WORKDIR_KEY = re.compile(r"^working[-_]?dir(ectory)?$", re.I)
JS_IMPORT = re.compile(r"""(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*)['"](\.{1,2}/[^'"]+)['"]""")
PY_IMPORT = re.compile(r"^\s*(?:from\s+([\w.]+)\s+import|import\s+([\w., ]+))", re.M)


def rel(p: Path, root: Path) -> str | None:
    try:
        return p.resolve().relative_to(root.resolve()).as_posix()
    except ValueError:
        return None


def resolve_ref(token: str, wd: str, root: Path) -> str | None:
    for base in ([wd] if wd else []) + [""]:
        cand = (root / base / token) if base else (root / token)
        if cand.is_file():
            return rel(cand, root)
    return None


def local_imports(path: str, root: Path) -> set[str]:
    """Repo files a script loads: relative JS imports, sibling Python modules,
    paths a shell script names."""
    f = root / path
    try:
        text = f.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return set()
    out: set[str] = set()
    if f.suffix in (".mjs", ".js", ".cjs", ".ts"):
        for spec in JS_IMPORT.findall(text):
            base = f.parent / spec
            for cand in (base, base.with_name(base.name + ".mjs"), base.with_name(base.name + ".js"), base / "index.mjs", base / "index.js"):
                if cand.is_file():
                    r = rel(cand, root)
                    if r:
                        out.add(r)
                    break
    elif f.suffix == ".py":
        for frm, imp in PY_IMPORT.findall(text):
            mods = [frm] if frm else [m.strip().split(" ")[0] for m in imp.split(",")]
            for mod in mods:
                parts = mod.strip(".").split(".")
                for base in (f.parent, root):
                    cand = base.joinpath(*parts)
                    for c in (cand.with_suffix(".py"), cand / "__init__.py"):
                        if c.is_file():
                            r = rel(c, root)
                            if r:
                                out.add(r)
    elif f.suffix == ".sh":
        for tok in CODE_PATH.findall(strip_comments(text)):
            r = resolve_ref(tok, rel(f.parent, root) or "", root)
            if r:
                out.add(r)
    return out


def strip_comments(shell: str) -> str:
    """Drop whole-line shell comments, which name files they do not run."""
    return "\n".join(line for line in shell.splitlines() if not line.lstrip().startswith("#"))


def job_entrypoints(job: dict, root: Path, workflow_defaults: dict | None = None) -> set[str]:
    """Repo files (or, for builds, `dir/package.json`-style markers) a job runs."""
    found: set[str] = set()
    default_wd = (
        ((job.get("defaults") or {}).get("run") or {}).get("working-directory")
        or (((workflow_defaults or {}).get("run")) or {}).get("working-directory", "")
    )
    for step in job.get("steps") or []:
        if not isinstance(step, dict):
            continue
        wd = str(step.get("working-directory", default_wd) or "")
        uses = str(step.get("uses", ""))
        if uses.startswith("./"):
            d = uses[2:].rstrip("/")
            for name in ("action.yml", "action.yaml"):
                if (root / d / name).is_file():
                    found.add(f"{d}/{name}")
            found |= {r for r in (rel(p, root) for p in (root / d).rglob("*") if p.is_file()) if r}
        for key, value in (step.get("with") or {}).items():
            if WORKDIR_KEY.match(str(key)) and isinstance(value, str) and (root / value).is_dir():
                found.add(build_marker(value, root))
        run = step.get("run")
        if isinstance(run, str):
            run = strip_comments(run)
            for tok in CODE_PATH.findall(run):
                r = resolve_ref(tok, wd, root)
                if r:
                    found.add(r)
            if BUILD_CMD.search(run):
                found.add(build_marker(wd, root))
            for m in re.finditer(r"pip3?\s+install\s+(?:[^\n]*\s)?-r\s+(\S+)", run):
                r = resolve_ref(m.group(1), wd, root)
                if r:
                    found.add(r)
    # Follow local imports to a fixed point.
    todo = list(found)
    while todo:
        for dep in local_imports(todo.pop(), root):
            if dep not in found:
                found.add(dep)
                todo.append(dep)
    return found


def build_marker(wd: str, root: Path) -> str:
    wd = wd.strip("/") or "."
    for name in ("package.json", "pyproject.toml", "Makefile"):
        if (root / wd / name).is_file():
            return f"{wd}/{name}" if wd != "." else name
    return f"{wd}/" if wd != "." else "./"


def accepted(workflow: str, path: str, policy: Policy) -> bool:
    for entry in policy.accepted:
        if entry.get("workflow") in (workflow, "*") and (path == entry["path"] or path.startswith(entry["path"].rstrip("/") + "/")):
            return True
    return False


def check_privileged(name: str, doc: dict, policy: Policy, rules, priv_names: set[str], root: Path) -> list[str]:
    errs: list[str] = []
    jobs = doc.get("jobs") or {}
    on = doc.get("on", doc.get(True))
    if isinstance(on, dict) and isinstance(on.get("workflow_run"), dict):
        for w in on["workflow_run"].get("workflows") or []:
            if str(w).strip().lower() not in priv_names:
                errs.append(f"workflow_run follows {w!r}, which is not a priv- workflow (its runs are agent-controlled)")
    for job_id, job in jobs.items():
        if isinstance(job, dict) and str(job.get("uses", "")).startswith("./"):
            if not Path(str(job["uses"])).name.startswith(PRIV_PREFIX):
                errs.append(f"jobs.{job_id}: calls unprivileged workflow {job['uses']} (agents may edit it)")
        for i, step in enumerate((job or {}).get("steps") or []):
            if isinstance(step, dict) and "uses" in step:
                prob = action_problem(str(step["uses"]), policy)
                if prob:
                    errs.append(f"jobs.{job_id}.steps[{i}]: {prob}")

    gate_jobs = {
        jid: j
        for jid, j in jobs.items()
        if isinstance(j, dict) and any(could_report_as(jid, j, c) for c in policy.required_checks)
    }
    for job_id, job in {**privileged_jobs(doc), **gate_jobs}.items():
        where = f"jobs.{job_id}"
        for i, step in enumerate(job.get("steps") or []):
            if not isinstance(step, dict):
                continue
            uses = str(step.get("uses", "")).split("@")[0]
            with_ = step.get("with") or {}
            if uses.startswith("actions/cache"):
                errs.append(f"{where}.steps[{i}]: restores an Actions cache, which unprivileged workflows on main can write")
            if uses == "actions/setup-python" and with_.get("cache"):
                errs.append(f"{where}.steps[{i}]: setup-python `cache:` restores a pip cache unprivileged workflows can write")
            if uses == "actions/setup-node" and with_.get("cache") not in (None, "npm", "pnpm"):
                errs.append(f"{where}.steps[{i}]: setup-node `cache: {with_.get('cache')}` is not integrity-checked against a lockfile")
            if uses == "actions/download-artifact" and ("run-id" in with_ or "github-token" in with_):
                errs.append(f"{where}.steps[{i}]: downloads another run's artifacts, which an unprivileged workflow may have produced")
        for path in sorted(job_entrypoints(job, root, doc.get("defaults"))):
            if guard.owners_for(path, rules) or accepted(name, path, policy):
                continue
            errs.append(
                f"{where} holds secrets, write access or a required check and runs {path}, which has no code owner "
                f"(own it in .github/CODEOWNERS, or list it under privileged_code_accepted with a reason)"
            )
    return errs


# ---------------------------------------------------------------- main ----


def workflow_files(workflows_dir: Path) -> list[Path]:
    return sorted(p for p in workflows_dir.iterdir() if p.is_file() and p.suffix in (".yml", ".yaml"))


def check_all(workflows_dir: Path, policy: Policy, rules, root: Path) -> dict[str, list[str]]:
    docs: dict[str, dict] = {}
    results: dict[str, list[str]] = {}
    for f in workflow_files(workflows_dir):
        try:
            doc = load_yaml(f.read_text(encoding="utf-8"))
            if not isinstance(doc, dict):
                raise PolicyError("not a mapping")
            docs[f.name] = doc
        except PolicyError as exc:
            results[f.name] = [str(exc)]
    priv_names = {
        str(d.get("name", n)).strip().lower() for n, d in docs.items() if n.startswith(PRIV_PREFIX)
    }
    for n, doc in docs.items():
        if n.startswith(PRIV_PREFIX):
            results[n] = check_privileged(n, doc, policy, rules, priv_names, root)
        else:
            results[n] = check_unprivileged(doc, policy, priv_names)
    return results


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    ap.add_argument("--root", type=Path, default=REPO_ROOT)
    ap.add_argument("--entrypoints", action="store_true", help="list the repo files each privileged job runs, with owners")
    args = ap.parse_args(argv)
    root = args.root.resolve()
    policy = Policy.load(root / ".github" / "ci-policy.yaml", root / ".github" / "rulesets" / "main.json")
    rules = guard.parse_codeowners((root / ".github" / "CODEOWNERS").read_text(encoding="utf-8"))
    wf_dir = root / ".github" / "workflows"

    if args.entrypoints:
        for f in workflow_files(wf_dir):
            if not f.name.startswith(PRIV_PREFIX):
                continue
            doc = load_yaml(f.read_text(encoding="utf-8"))
            for job_id, job in privileged_jobs(doc).items():
                for p in sorted(job_entrypoints(job, root, doc.get("defaults"))):
                    state = "owned" if guard.owners_for(p, rules) else ("accepted" if accepted(f.name, p, policy) else "UNOWNED")
                    print(f"{f.name}\t{job_id}\t{state}\t{p}")
        return 0

    results = check_all(wf_dir, policy, rules, root)
    bad = 0
    for name, errs in sorted(results.items()):
        for e in errs:
            bad += 1
            print(f"::error file=.github/workflows/{name}::{e}")
    n_priv = sum(1 for n in results if n.startswith(PRIV_PREFIX))
    if not bad:
        print(f"ci-policy: {len(results) - n_priv} unprivileged workflow(s) read-only and secret-free; {n_priv} priv- workflow(s) checked")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
