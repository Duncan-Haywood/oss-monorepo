#!/usr/bin/env python3
"""Keep docs/security/secrets-inventory.yaml in step with the workflows.

Why this exists
---------------
The owner (2026-11-24) wants keys managed as code: every secret a workflow can
read is written down with its provider, what it can do, how it rotates and
what the owner still has to do about it, and nothing else. A list nobody
checks goes stale within a week, so this script fails when:

  * a workflow reads a secret the inventory does not list;
  * the inventory lists a secret no workflow reads (a key that could be
    deleted, or a typo);
  * an entry's `workflows` or `environments` no longer match where the secret
    is actually read (the inventory says where to store and revoke it, so a
    wrong answer there is worse than none);
  * a secret marked `retired` (replaced by OIDC or an app token, waiting for
    the owner to delete it) is read again;
  * an entry is missing a field, uses an unknown rotation class, or carries
    something that looks like a secret value. Values never belong in the file.

References are read from the parsed YAML, not the raw text, so comments are
ignored, and only inside `${{ }}` expressions (or a bare `if:` expression),
so a file name such as `worker-secrets.json` in a shell script is not mistaken
for one. `secrets: inherit` is reported, because it hands a called workflow
every secret without naming any.

    python3 platform/ci/secrets_inventory.py                 # check this repo
    python3 platform/ci/secrets_inventory.py --usage         # print where each secret is read
    python3 platform/ci/secrets_inventory.py --root ../other --inventory ../other/docs/security/secrets-inventory.yaml

Needs PyYAML (`pip install pyyaml`). Exit 0 clean, 1 on any finding.
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

import yaml

REPO_ROOT = Path(__file__).resolve().parents[2]
INVENTORY = Path("docs/security/secrets-inventory.yaml")
ROTATIONS = ("short-lived", "scheduled", "manual")
REQUIRED = ("name", "provider", "scope", "workflows", "environments", "rotation", "owner_action")
REPO_LEVEL = "repository"  # the `environments` value for a job that names no environment

EXPR_RE = re.compile(r"\$\{\{(.*?)\}\}", re.S)
REF_RE = re.compile(r"\bsecrets\s*(?:\.\s*([A-Za-z_][A-Za-z0-9_]*)|\[\s*['\"]([^'\"]+)['\"]\s*\])")
# Shapes of real credentials. A hit means a value was pasted where a
# description belongs; the file is public, so it must never merge.
VALUE_RES = [
    re.compile(p)
    for p in (
        r"-----BEGIN [A-Z ]*PRIVATE KEY-----",
        r"\bgh[pousr]_[A-Za-z0-9]{30,}",
        r"\bgithub_pat_[A-Za-z0-9_]{40,}",
        r"\bpypi-[A-Za-z0-9_-]{50,}",
        r"\bnpm_[A-Za-z0-9]{30,}",
        r"\bsk-ant-[A-Za-z0-9_-]{20,}",
        r"\bre_[A-Za-z0-9]{8,}_[A-Za-z0-9]{16,}",
        r"\bxox[abpr]-[A-Za-z0-9-]{10,}",
    )
]


def _refs_in_string(text: str, bare_expression: bool) -> set[str]:
    chunks = EXPR_RE.findall(text)
    if bare_expression and "${{" not in text:
        chunks = [text]
    out = set()
    for chunk in chunks:
        for m in REF_RE.finditer(chunk):
            out.add(m.group(1) or m.group(2))
    return out


def _walk(node, found: set[str], inherit: list[str], where: str, key=None) -> None:
    if isinstance(node, dict):
        for k, v in node.items():
            if k == "secrets" and v == "inherit":
                inherit.append(where)
            _walk(v, found, inherit, where, k)
    elif isinstance(node, list):
        for v in node:
            _walk(v, found, inherit, where, key)
    elif isinstance(node, str):
        found |= _refs_in_string(node, bare_expression=(key == "if"))


def _dispatch_options(data: dict) -> dict[str, list[str]]:
    """workflow_dispatch choice inputs -> their options (PyYAML reads `on:` as True)."""
    on = data.get("on", data.get(True))
    if not isinstance(on, dict):
        return {}
    inputs = (on.get("workflow_dispatch") or {}).get("inputs") or {}
    return {
        k: [str(o) for o in v.get("options", [])]
        for k, v in inputs.items()
        if isinstance(v, dict) and isinstance(v.get("options"), list)
    }


def _environment_names(job: dict, options: dict[str, list[str]]) -> set[str]:
    """The environments a job can run in. An expression such as
    `${{ inputs.environment || 'production' }}` resolves to the choice input's
    options plus the `||` fallback literals, which is where its secrets must live."""
    env = job.get("environment")
    if isinstance(env, dict):
        env = env.get("name")
    if not env:
        return {REPO_LEVEL}
    env = str(env)
    if "${{" not in env:
        return {env}
    # Only a literal after `||` is an environment name; others are
    # comparisons such as `github.event_name == 'workflow_dispatch'`.
    names = set(re.findall(r"\|\|\s*'([^']+)'", env))
    for inp in re.findall(r"\binputs\.([A-Za-z_][A-Za-z0-9_-]*)", env):
        names |= set(options.get(inp, []))
    return names or {env}


def usage(root: Path) -> tuple[dict[str, dict[str, set[str]]], list[str], list[str]]:
    """{secret: {"workflows": {...}, "environments": {...}}}, inherit sites, parse errors."""
    out: dict[str, dict[str, set[str]]] = {}
    inherit: list[str] = []
    errors: list[str] = []
    wf_dir = root / ".github" / "workflows"
    files = sorted(list(wf_dir.glob("*.yml")) + list(wf_dir.glob("*.yaml"))) if wf_dir.is_dir() else []

    def add(name: str, wf: str, env: str) -> None:
        slot = out.setdefault(name, {"workflows": set(), "environments": set()})
        slot["workflows"].add(wf)
        slot["environments"].add(env)

    for path in files:
        wf = path.name
        try:
            data = yaml.safe_load(path.read_text(encoding="utf-8"))
        except yaml.YAMLError as exc:
            errors.append(f"{wf}: does not parse ({exc.__class__.__name__})")
            continue
        if not isinstance(data, dict):
            continue
        options = _dispatch_options(data)
        jobs = data.get("jobs") if isinstance(data.get("jobs"), dict) else {}
        # Everything outside `jobs` (workflow-level env, workflow_call
        # declarations) runs with no environment.
        rest = {k: v for k, v in data.items() if k != "jobs"}
        found: set[str] = set()
        _walk(rest, found, inherit, wf)
        for name in found:
            add(name, wf, REPO_LEVEL)
        for job_id, job in jobs.items():
            if not isinstance(job, dict):
                continue
            found = set()
            _walk(job, found, inherit, f"{wf} job {job_id}")
            for name in found:
                for env in _environment_names(job, options):
                    add(name, wf, env)
    return out, inherit, errors


def load_inventory(path: Path) -> dict:
    data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    if not isinstance(data, dict):
        raise ValueError(f"{path}: top level must be a mapping")
    return data


def check(root: Path, inventory_path: Path) -> list[str]:
    problems: list[str] = []
    used, inherit, parse_errors = usage(root)
    problems += parse_errors
    for site in inherit:
        problems.append(f"{site}: `secrets: inherit` passes every secret without naming any; pass the ones it needs")

    raw = inventory_path.read_text(encoding="utf-8")
    for rx in VALUE_RES:
        if rx.search(raw):
            problems.append(f"{inventory_path.name}: something shaped like a secret value matches /{rx.pattern}/; values never go in the inventory")
    data = load_inventory(inventory_path)
    entries = data.get("secrets") or []
    retired = data.get("retired") or []
    if not isinstance(entries, list) or not isinstance(retired, list):
        return problems + [f"{inventory_path.name}: `secrets` and `retired` must be lists"]

    listed: dict[str, dict] = {}
    for i, e in enumerate(entries):
        if not isinstance(e, dict):
            problems.append(f"secrets[{i}]: not a mapping")
            continue
        name = e.get("name") or f"secrets[{i}]"
        missing = [f for f in REQUIRED if f not in e or e[f] in (None, "")]
        if missing:
            problems.append(f"{name}: missing {', '.join(missing)}")
        if e.get("rotation") not in ROTATIONS:
            problems.append(f"{name}: rotation must be one of {', '.join(ROTATIONS)}, not {e.get('rotation')!r}")
        if name in listed:
            problems.append(f"{name}: listed twice")
        listed[name] = e
        alias = e.get("alias_of")
        if alias is not None and alias not in {x.get("name") for x in entries if isinstance(x, dict)}:
            problems.append(f"{name}: alias_of names {alias!r}, which is not in the inventory")

    retired_names = set()
    for i, r in enumerate(retired):
        if not isinstance(r, dict) or not r.get("name") or not r.get("owner_action"):
            problems.append(f"retired[{i}]: needs `name` and `owner_action`")
            continue
        retired_names.add(r["name"])
        if r["name"] in listed:
            problems.append(f"{r['name']}: both listed and retired")

    for name in sorted(used):
        where = ", ".join(sorted(used[name]["workflows"]))
        if name in retired_names:
            problems.append(f"{name}: retired, but read again by {where}; use its replacement or move it back to `secrets`")
        elif name not in listed:
            problems.append(f"{name}: read by {where} but missing from {inventory_path.name}")

    for name, e in sorted(listed.items()):
        if name not in used:
            problems.append(f"{name}: listed in {inventory_path.name} but no workflow reads it (delete the entry, and the secret, or retire it)")
            continue
        for field in ("workflows", "environments"):
            want = sorted(used[name][field])
            have = e.get(field)
            have = sorted(have) if isinstance(have, list) else have
            if have != want:
                problems.append(f"{name}: `{field}` says {have}, workflows say {want}")
    return problems


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--root", type=Path, default=REPO_ROOT, help="repository root (default: this one)")
    ap.add_argument("--inventory", type=Path, help=f"inventory file (default: <root>/{INVENTORY})")
    ap.add_argument("--usage", action="store_true", help="print where each secret is read, as YAML, and exit")
    args = ap.parse_args(argv)
    root = args.root.resolve()
    inv = args.inventory or root / INVENTORY

    if args.usage:
        used, _, _ = usage(root)
        print(yaml.safe_dump(
            {n: {k: sorted(v) for k, v in s.items()} for n, s in sorted(used.items())},
            sort_keys=False, width=120,
        ), end="")
        return 0
    if not inv.is_file():
        print(f"no inventory at {inv}", file=sys.stderr)
        return 1
    problems = check(root, inv)
    if problems:
        print(f"secrets inventory: {len(problems)} problem(s)")
        for p in problems:
            print(f"  - {p}")
        return 1
    used, _, _ = usage(root)
    print(f"secrets inventory: {len(used)} secret(s) read by workflows, all listed and accounted for")
    return 0


if __name__ == "__main__":
    sys.exit(main())
