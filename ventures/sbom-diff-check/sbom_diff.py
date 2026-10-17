#!/usr/bin/env python3
"""Diff two SBOM (Software Bill of Materials) documents and report exactly
which packages were added, removed, or changed version between two builds.

    python3 sbom_diff.py old.json new.json                  # human-readable
    python3 sbom_diff.py old.json new.json --format json     # machine-readable
    python3 sbom_diff.py old.json new.json --fail-on-change  # exit 2 if anything differs

## The problem this solves

Tools like `syft`, `docker sbom`, `trivy`, and `cdxgen` can emit a CycloneDX
or SPDX JSON document describing every package that went into a container
image or application build. The natural next question after your second
build is "what changed since last time" -- and today the honest answer is
"write a script" or "paste both files into an online JSON-diff tool", which
means uploading your dependency tree (a real information disclosure for a
proprietary build) to a third party just to answer a yes/no question.

A raw `diff` between two SBOM files is close to useless for this: both
documents carry a `serialNumber`, a generation timestamp, and tool metadata
that differ on every single run even when the package list is byte-identical,
so the noise buries the one line that matters. This tool ignores all of that
and compares only the package list: name, version, and (for CycloneDX)
package URL.

## What this tool actually does, and does not do

It is a static, read-only comparison of two already-generated SBOM
documents. It makes **no network calls of any kind** -- it never fetches a
package, never queries a vulnerability database, and never resolves a
version range. It does not tell you whether a package is vulnerable,
malicious, or appropriately licensed; it tells you only that it is new,
gone, or at a different version than the SBOM you are comparing against.

## Formats understood

  - **CycloneDX** (`"bomFormat": "CycloneDX"`, or a top-level `components`
    array) -- reads each component's `name`, `version`, and `purl`.
  - **SPDX** (a `spdxVersion` field, or a top-level `packages` array) --
    reads each package's `name` and `versionInfo` (`NOASSERTION` is treated
    as no known version, matching SPDX's own convention for "not stated").

Two documents in different formats can be compared against each other --
only the package name and version are compared, and both formats expose
both fields.

## Identity and multi-version packages

Packages are matched by name. A build can legitimately carry two versions
of the same package name at once (a monorepo pulling it in via two
different paths); this tool handles that by comparing the *set* of versions
recorded under each name rather than assuming exactly one, so a genuine
multi-version case is reported as a version change (a version gained, a
version lost) rather than crashing or silently picking one.

Exit status: 0 normally (even with differences found, unless
--fail-on-change), 2 if --fail-on-change was given and the two documents
differ in any way.
"""

import argparse
import json
import sys
from pathlib import Path


def _version_or_none(value):
    if value is None:
        return None
    if value == "NOASSERTION":
        return None
    return value


def extract_cyclonedx(doc):
    """Return a list of {name, version, purl} dicts from a CycloneDX document.

    Walks nested `components` (cdxgen and Maven/Gradle plugins nest them), and
    prefixes the optional `group` so `@types` + `node` is `@types/node`, not
    a bare `node` that collides with an unrelated package.
    """
    components = []
    stack = list(reversed(doc.get("components") or []))
    while stack:
        c = stack.pop()
        if not isinstance(c, dict):
            continue
        stack.extend(reversed(c.get("components") or []))
        name = c.get("name")
        if not name:
            continue
        if c.get("group"):
            name = f"{c['group']}/{name}"
        components.append({"name": name, "version": c.get("version") or None, "purl": c.get("purl") or None})
    return components


def extract_spdx(doc):
    """Return a list of {name, version, purl} dicts from an SPDX document."""
    components = []
    for p in doc.get("packages") or []:
        if not isinstance(p, dict):
            continue
        name = p.get("name")
        if not name:
            continue
        components.append({"name": name, "version": _version_or_none(p.get("versionInfo")), "purl": None})
    return components


def detect_format(doc):
    if not isinstance(doc, dict):
        return None
    if doc.get("bomFormat") == "CycloneDX" or isinstance(doc.get("components"), list):
        return "CycloneDX"
    if "spdxVersion" in doc or isinstance(doc.get("packages"), list):
        return "SPDX"
    return None


def parse_sbom(text, label="<sbom>"):
    """Parse SBOM JSON text. Returns (format_name, components). Raises
    ValueError with a message naming `label` if the document is not
    recognizable JSON or not a recognized SBOM shape."""
    try:
        doc = json.loads(text)
    except json.JSONDecodeError as exc:
        raise ValueError(f"{label}: not valid JSON ({exc})") from exc

    fmt = detect_format(doc)
    if fmt == "CycloneDX":
        return fmt, extract_cyclonedx(doc)
    if fmt == "SPDX":
        return fmt, extract_spdx(doc)
    raise ValueError(
        f'{label}: not a recognized CycloneDX or SPDX document (expected "bomFormat": "CycloneDX", '
        f'"spdxVersion", a top-level "components" array, or a top-level "packages" array)'
    )


def _group_by_name(components):
    grouped = {}
    for c in components:
        grouped.setdefault(c["name"], set()).add(c["version"])
    return grouped


def diff_components(old_components, new_components):
    """Compare two component lists. Returns a dict with `added`, `removed`,
    and `version_changed` lists, each sorted by package name."""
    old_by_name = _group_by_name(old_components)
    new_by_name = _group_by_name(new_components)

    added = []
    removed = []
    version_changed = []

    for name in sorted(set(old_by_name) | set(new_by_name)):
        old_versions = old_by_name.get(name)
        new_versions = new_by_name.get(name)

        if old_versions is None:
            for v in sorted(new_versions, key=lambda x: (x is None, x)):
                added.append({"name": name, "version": v})
            continue
        if new_versions is None:
            for v in sorted(old_versions, key=lambda x: (x is None, x)):
                removed.append({"name": name, "version": v})
            continue

        if old_versions != new_versions:
            gained = sorted(new_versions - old_versions, key=lambda x: (x is None, x))
            lost = sorted(old_versions - new_versions, key=lambda x: (x is None, x))
            version_changed.append({"name": name, "from": lost, "to": gained})

    return {"added": added, "removed": removed, "version_changed": version_changed}


def has_any_change(diff):
    return bool(diff["added"] or diff["removed"] or diff["version_changed"])


def render_text(diff, old_count, new_count):
    if not has_any_change(diff):
        return f"No package changes -- both SBOMs list the same {new_count} package(s) at the same versions."

    lines = []
    if diff["added"]:
        lines.append(f"Added ({len(diff['added'])}):")
        for a in diff["added"]:
            v = a["version"] or "(no version recorded)"
            lines.append(f"  + {a['name']} {v}")
        lines.append("")
    if diff["removed"]:
        lines.append(f"Removed ({len(diff['removed'])}):")
        for r in diff["removed"]:
            v = r["version"] or "(no version recorded)"
            lines.append(f"  - {r['name']} {v}")
        lines.append("")
    if diff["version_changed"]:
        lines.append(f"Version changed ({len(diff['version_changed'])}):")
        for vc in diff["version_changed"]:
            frm = ", ".join(v or "(none)" for v in vc["from"]) or "(none)"
            to = ", ".join(v or "(none)" for v in vc["to"]) or "(none)"
            lines.append(f"  ~ {vc['name']}: {frm} -> {to}")
        lines.append("")

    lines.append(
        f"{len(diff['added'])} added, {len(diff['removed'])} removed, "
        f"{len(diff['version_changed'])} version-changed, out of {old_count} -> {new_count} package(s) total."
    )
    return "\n".join(lines)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("old", help="path to the earlier SBOM (CycloneDX or SPDX JSON)")
    parser.add_argument("new", help="path to the later SBOM (CycloneDX or SPDX JSON)")
    parser.add_argument("--format", choices=("text", "json"), default="text", help="output format")
    parser.add_argument(
        "--fail-on-change",
        action="store_true",
        help="exit 2 if the two SBOMs differ in any way (added, removed, or version-changed package)",
    )
    args = parser.parse_args(argv)

    try:
        old_text = Path(args.old).read_text(encoding="utf-8")
        new_text = Path(args.new).read_text(encoding="utf-8")
    except OSError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1

    try:
        _, old_components = parse_sbom(old_text, label=args.old)
        _, new_components = parse_sbom(new_text, label=args.new)
    except ValueError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1

    diff = diff_components(old_components, new_components)

    if args.format == "json":
        print(json.dumps(diff, indent=2))
    else:
        print(render_text(diff, len(old_components), len(new_components)))

    if args.fail_on_change and has_any_change(diff):
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
