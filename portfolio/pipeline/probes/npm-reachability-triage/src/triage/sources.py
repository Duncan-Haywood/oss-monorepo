"""Find which npm packages the scanned project imports in its own source.

This is the second, independent guard on the build-surface rule in
``graph.py``. The graph already refuses to call a package build-only when the
root project declares it in ``dependencies``, which catches the declared case.
This module catches the undeclared one: a project that imports a package it
never declared, relying on npm's flat ``node_modules`` to resolve it anyway.

That happens often enough to matter, and it is precisely the case where a
graph-only answer would be confidently wrong — the edges would all say
"reached through a build tool" while the application's own code calls into the
package at runtime.

The scan is deliberately crude in one direction only. It over-matches (a
commented-out import counts, so does one inside a string) because a spurious
*import* can only ever block a suppression, and blocking a suppression is the
safe failure. It never under-matches on the shapes it claims to cover, and it
states the shapes it does not: dynamic ``require(someVariable)`` is
unresolvable without evaluating the program, so a project that loads packages
by computed name gets no protection from this scan and must rely on the
declaration guard instead.
"""

from __future__ import annotations

import re
from pathlib import Path

#: Extensions worth reading. Config files (``next.config.mjs``,
#: ``tailwind.config.js``) are included on purpose: they are project source and
#: they import build plugins.
SOURCE_SUFFIXES = frozenset(
    {".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".mts", ".cts"}
)

#: Directories that are not the project's own source. ``node_modules`` is the
#: dependencies themselves; the rest are build outputs, which contain bundled
#: copies of dependency code and would match nearly everything.
SKIP_DIRECTORIES = frozenset(
    {
        "node_modules",
        ".git",
        ".next",
        ".turbo",
        ".vercel",
        "dist",
        "build",
        "out",
        "coverage",
        "storybook-static",
    }
)

#: Guard rails so a scan cannot become the slow part of a run, or read a
#: generated megabyte-sized bundle that slipped past SKIP_DIRECTORIES.
MAX_FILES = 4000
MAX_FILE_BYTES = 512 * 1024

#: `from "pkg"`, `require("pkg")`, `import("pkg")` and bare `import "pkg"`,
#: each allowing a subpath (`pkg/sub`) and either quote style. The specifier is
#: captured whole and reduced to a package name afterwards, which keeps the
#: scoped-package rule (`@scope/name`) in one place.
_SPECIFIER_RE = re.compile(
    r"""(?:\bfrom\s*|\brequire\s*\(\s*|\bimport\s*\(\s*|\bimport\s*)"""
    r"""(?P<quote>['"])(?P<spec>[^'"\n]+)(?P=quote)"""
)


def package_name_from_specifier(specifier: str) -> str | None:
    """Reduce an import specifier to the npm package it names.

    Relative and absolute paths, URLs, and TypeScript path aliases are not npm
    packages and return ``None``.
    """
    specifier = specifier.strip()
    if not specifier or specifier[0] in "./~#" or "://" in specifier:
        return None
    parts = specifier.split("/")
    if specifier.startswith("@"):
        if len(parts) < 2 or not parts[1]:
            return None
        return f"{parts[0]}/{parts[1]}"
    return parts[0] or None


def imports_in_text(text: str) -> set[str]:
    """Every npm package name imported by one source file's text."""
    found: set[str] = set()
    for match in _SPECIFIER_RE.finditer(text):
        name = package_name_from_specifier(match.group("spec"))
        if name is not None:
            found.add(name)
    return found


def _iter_source_files(project_dir: Path):
    stack = [project_dir]
    seen = 0
    while stack:
        directory = stack.pop()
        try:
            entries = sorted(directory.iterdir())
        except OSError:
            continue
        for entry in entries:
            if entry.is_symlink():
                continue
            if entry.is_dir():
                if entry.name not in SKIP_DIRECTORIES:
                    stack.append(entry)
            elif entry.suffix in SOURCE_SUFFIXES:
                seen += 1
                if seen > MAX_FILES:
                    return
                yield entry


def scan_project_imports(project_dir: str | Path) -> frozenset[str]:
    """Every npm package name the project's own source imports.

    An unreadable file is skipped rather than failing the run: this scan can
    only ever *prevent* a suppression, so a partial answer degrades towards
    reporting more findings, not fewer.
    """
    root = Path(project_dir)
    found: set[str] = set()
    for path in _iter_source_files(root):
        try:
            if path.stat().st_size > MAX_FILE_BYTES:
                continue
            text = path.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        found |= imports_in_text(text)
    return frozenset(found)


def declared_production_dependencies(project_dir: str | Path) -> frozenset[str]:
    """Packages the project's own ``package.json`` puts on the production graph.

    ``devDependencies`` is excluded deliberately — npm already encodes that per
    install location, and treating a devDependency as a runtime use would block
    the suppression this whole rule exists to make.
    """
    manifest = Path(project_dir) / "package.json"
    if not manifest.is_file():
        return frozenset()
    try:
        import json

        raw = json.loads(manifest.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return frozenset()
    names: set[str] = set()
    for field_name in ("dependencies", "optionalDependencies", "peerDependencies"):
        declared = raw.get(field_name)
        if isinstance(declared, dict):
            names |= set(declared)
    return frozenset(names)
