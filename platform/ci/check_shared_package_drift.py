#!/usr/bin/env python3
"""Fail when two ventures' copies of the same shared package drift apart unseen.

Several paid products carry their own copy of a shared package
(`ventures/<slug>/packages/{billing,admin-metrics,qbo-sync}`), because each was
moved out of private-monorepo as a self-contained workspace. A fix made in one
copy does not reach the others. On 2026-11-28 a red-team run fixed
`amountToCents` (1.005 rounded to 100 cents, and -0.125 to -12 while 0.125 went
to 13) in `ventures/payapps/packages/qbo-sync/src/money.ts`; the same file in
`ventures/jobshop-quote` kept the bug until the next red-team run read both.

So every `src/` file that two or more copies share must be byte-identical,
unless KNOWN_DIVERGENT names it with a reason. Fix a shared bug in every copy;
when a copy diverges on purpose (a product-only feature, the package name in a
header), add the file here with why, in the same PR.

A copy pasted back from an older source (the private-monorepo snapshots are
retired) also turns this red, which is the point: fix every copy here.

    python3 platform/ci/check_shared_package_drift.py
"""
import hashlib
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

# "<package>/<path under the package>": why the copies may differ.
KNOWN_DIVERGENT = {
    "billing/src/index.ts": "header names each product's package; payapps also re-exports paddle-webhook.ts",
    "admin-metrics/src/contract.ts": "signup-source rows (SignupSources) exist only in the products that record a source",
}


def shared_files(root: Path = ROOT) -> dict:
    """{"<pkg>/<rel>": {venture: sha256}} for src files under ventures/*/packages/<pkg>."""
    out: dict = defaultdict(dict)
    for pkg_dir in sorted(root.glob("ventures/*/packages/*")):
        if not pkg_dir.is_dir():
            continue
        venture, pkg = pkg_dir.parts[-3], pkg_dir.name
        for f in sorted((pkg_dir / "src").rglob("*")):
            if f.is_file() and "node_modules" not in f.parts:
                rel = f.relative_to(pkg_dir).as_posix()
                out[f"{pkg}/{rel}"][venture] = hashlib.sha256(f.read_bytes()).hexdigest()
    return out


def drift(root: Path = ROOT, known: dict = KNOWN_DIVERGENT) -> list[str]:
    problems = []
    for key, copies in sorted(shared_files(root).items()):
        if len(copies) < 2 or len(set(copies.values())) == 1 or key in known:
            continue
        groups: dict = defaultdict(list)
        for venture, digest in sorted(copies.items()):
            groups[digest].append(venture)
        versions = "; ".join(", ".join(v) for v in groups.values())
        pkg, rel = key.split("/", 1)
        problems.append(
            f"{key}: {len(groups)} versions across ventures/*/packages/{pkg} ({versions}). "
            f"Port the change to every copy, or add '{key}' to KNOWN_DIVERGENT "
            f"in platform/ci/check_shared_package_drift.py with the reason."
        )
    for key in sorted(known):
        copies = shared_files(root).get(key, {})
        if len(copies) >= 2 and len(set(copies.values())) == 1:
            problems.append(f"{key}: listed in KNOWN_DIVERGENT but every copy is identical now; remove the entry.")
    return problems


def main() -> int:
    problems = drift()
    for p in problems:
        print(f"shared-package drift: {p}")
    if problems:
        return 1
    print("shared packages: every shared src file identical across ventures (or listed with a reason)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
