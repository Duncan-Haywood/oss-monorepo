#!/usr/bin/env python3
"""Flag a lookup of user input in a plain object map without an own-key check.

    python3 platform/ci/inherited_keys.py                # every venture, new hits only
    python3 platform/ci/inherited_keys.py <slug> ...     # these ventures
    python3 platform/ci/inherited_keys.py --list         # every hit, baseline included
    python3 platform/ci/inherited_keys.py --write-baseline

## What this catches

A tool's engine keeps its choices in an object literal and looks the user's
choice up by name:

    const PROPERTY_TYPES = { "single-family": {...}, multifamily: {...} };
    const type = PROPERTY_TYPES[input.propertyType] || PROPERTY_TYPES.multifamily;

`input.propertyType` comes from a select box on the page, but also from a share
link, a saved file, the CLI, or any agent calling the engine with JSON through
`platform/agents/tools.mjs` (the MCP server). For the names every object
inherits -- "constructor", "toString", "__proto__", "hasOwnProperty" -- the
lookup finds `Object.prototype`, not `undefined`, so the fallback never runs.
Found by the red-team run of 2026-11-11: the cost segregation calculator
returned null figures, the duty calculator threw a TypeError instead of
"Choose a garment type.", the editor's quote accepted "constructor" as a level
of edit, and the league scheduler's carry-over search returned no rounds.

The fix is an own-key check, `Object.hasOwn(MAP, key) ? MAP[key] : fallback`
(or a `Map`, or `Object.create(null)`). A line that already calls
`Object.hasOwn(MAP` or `hasOwnProperty` is not flagged.

## The ratchet

The first scan found about sixty such lookups in forty files; many are labels
for the tool's own findings and only print the wrong word. They sit in
`inherited_keys_baseline.txt`, so CI fails on a *new* one, not on the old
ones. Fixing one means deleting its baseline line (the unit test fails on a
stale line), so the list only shrinks. `run_venture_tests.py` runs this over
the ventures a pull request touches, so it fails in `ventures-tests.yml`
without a workflow edit.

The match is a heuristic: `NAME[ident.key]` where NAME is an upper-case
`const` bound to an object literal in the same file. It misses lookups through
a local variable and lookups in inline page scripts.
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
VENTURES = ROOT / "ventures"
BASELINE = Path(__file__).with_name("inherited_keys_baseline.txt")

MAP_DECL = re.compile(r"^(?:export\s+)?const\s+([A-Z][A-Z0-9_]+)\s*=\s*(?:Object\.freeze\(\s*)?\{", re.M)
LOOKUP = re.compile(r"\b([A-Z][A-Z0-9_]+)\[([A-Za-z_$][\w$]*\.[A-Za-z_$][\w$]*)\]")


def scan_text(text: str) -> list[tuple[int, str]]:
    """(line, lookup) for each unguarded lookup of `ident.key` in a same-file object map."""
    maps = set(MAP_DECL.findall(text))
    if not maps:
        return []
    out = []
    lines = text.split("\n")
    for m in LOOKUP.finditer(text):
        name = m.group(1)
        if name not in maps:
            continue
        lineno = text.count("\n", 0, m.start()) + 1
        line = lines[lineno - 1]
        if f"Object.hasOwn({name}" in line or "hasOwnProperty" in line:
            continue
        out.append((lineno, m.group(0)))
    return out


def engine_files(slug: str, ventures: Path = VENTURES) -> list[Path]:
    base = ventures / slug
    if not base.is_dir():
        return []
    files = []
    for p in sorted(base.rglob("*")):
        if p.suffix not in {".mjs", ".js"} or not p.is_file():
            continue
        rel = p.relative_to(base).parts
        if "node_modules" in rel or "eval" in rel or ".test." in p.name or p.name.endswith(".min.js"):
            continue
        files.append(p)
    return files


def scan_slugs(slugs, ventures: Path = VENTURES) -> list[tuple[str, int, str]]:
    """(repo path, line, lookup) per hit; paths read `ventures/<slug>/...` whatever `ventures` is."""
    hits = []
    for slug in slugs:
        for p in engine_files(slug, ventures):
            try:
                text = p.read_text(encoding="utf-8")
            except (UnicodeDecodeError, OSError):
                continue
            rel = "ventures/" + p.relative_to(ventures).as_posix()
            hits.extend((rel, line, lookup) for line, lookup in scan_text(text))
    return hits


def read_baseline(path: Path = BASELINE) -> set[tuple[str, str]]:
    if not path.is_file():
        return set()
    out = set()
    for raw in path.read_text(encoding="utf-8").splitlines():
        if not raw.strip() or raw.startswith("#"):
            continue
        rel, _, lookup = raw.partition("\t")
        out.add((rel, lookup))
    return out


def new_hits(slugs, ventures: Path = VENTURES, baseline: set | None = None):
    base = read_baseline() if baseline is None else baseline
    return [h for h in scan_slugs(slugs, ventures) if (h[0], h[2]) not in base]


def report(hits) -> str:
    lines = [f"{rel}:{line}: {lookup} finds Object.prototype for \"constructor\" or \"toString\";"
             f" use Object.hasOwn({lookup.split('[')[0]}, key) ? ... : fallback" for rel, line, lookup in hits]
    return "\n".join(lines)


def all_slugs(ventures: Path = VENTURES) -> list[str]:
    return sorted(d.name for d in ventures.iterdir() if d.is_dir())


def main(argv) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("slugs", nargs="*")
    ap.add_argument("--list", action="store_true", help="every hit, baseline included")
    ap.add_argument("--write-baseline", action="store_true")
    args = ap.parse_args(argv)
    slugs = args.slugs or all_slugs()
    if args.write_baseline:
        hits = sorted({(rel, lookup) for rel, _, lookup in scan_slugs(all_slugs())})
        BASELINE.write_text("# Unguarded object-map lookups that predate inherited_keys.py: fix one, delete its line.\n"
                            + "".join(f"{rel}\t{lookup}\n" for rel, lookup in hits), encoding="utf-8")
        print(f"wrote {len(hits)} entries to {BASELINE.relative_to(ROOT)}")
        return 0
    hits = scan_slugs(slugs) if args.list else new_hits(slugs)
    if hits:
        print(report(hits))
    print(f"{len(hits)} {'' if args.list else 'new '}unguarded lookup(s) in {len(slugs)} venture(s)")
    return 1 if hits and not args.list else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
