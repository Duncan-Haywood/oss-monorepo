"""Decide, from the lockfile graph alone, which packages only run at build time.

``lockfile.py`` answers *where is this package installed and is that location on
the production graph*. This module answers the question that sits immediately
behind it: **what pulls it there, and does that thing ever execute after the
build finishes?**

The distinction matters because a package can sit on the production dependency
path and still never run in production. The worked example is the one that
motivated this module. In every Next.js product in this portfolio,
``package-lock.json`` carries ``postcss`` twice:

``node_modules/postcss``
    ``dev: true`` — the project's own devDependency, for Tailwind.
``node_modules/next/node_modules/postcss``
    ``dev: false`` — vendored inside ``next``.

The ``dependency-path`` rule needs *every* location to be dev-only, so the
second location keeps four PostCSS advisories reported as shipped on all seven
Next.js products here. Those advisories describe ``postcss.process()`` reading
an attacker-controlled ``sourceMappingURL``. Next.js invokes PostCSS during
``next build``; neither ``next start`` nor a static export invokes it at all.
The finding is real about the build machine and false about the deployed
artifact, and nothing in the *text* of the advisory says so — the signal is in
the graph.

## The rule this module implements

A production install location is **build-only** when every production dependent
of that location is itself build-only, bottoming out at a named edge in
:data:`BUILD_ONLY_EDGES`. Three properties keep that from over-reaching:

1. **Edges are named pairs, not package allowlists.** ``("next", "postcss")``
   asserts something specific and falsifiable — *Next.js invokes PostCSS during
   the build and never afterwards* — and a reviewer can disagree with that one
   claim. A bare ``postcss`` allowlist would also fire when a runtime CSS-in-JS
   library pulls PostCSS into the request path, which is exactly the case this
   must not suppress.
2. **The root project is a dependent like any other, and is never build-only.**
   A package in the root ``dependencies`` therefore never qualifies, however it
   is also reached. That is the structural half of "do not fire when the
   project uses the package itself".
3. **Anything unproven is not build-only.** No production dependents, an
   unresolvable edge, or a dependency cycle all return ``False``. The recursion
   treats an in-progress node as unproven rather than assuming the best, so a
   cycle cannot bootstrap itself into a suppression.

Transitivity is not an extra flourish; it is where most of the answer is.
``nanoid``'s only production dependent in these lockfiles is the vendored
``postcss`` above — not ``next`` — so ``nanoid`` is reachable in production
*solely* through a build-time toolchain, and its two infinite-loop advisories
are build-only for the same reason PostCSS's are. This probe's own README had
recorded those two as un-suppressible "without call-graph analysis". They are
suppressible without it; the dependency graph was enough.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

#: The root project's own entry in a lockfile ``packages`` map.
ROOT = ""

#: Dependency-manifest fields that put a package on the production graph.
#: ``devDependencies`` is deliberately absent: npm already records that as the
#: per-location ``dev`` flag, which the ``dependency-path`` rule consumes.
PRODUCTION_DEPENDENCY_FIELDS = (
    "dependencies",
    "optionalDependencies",
    "peerDependencies",
)

#: Named ``(dependent, package)`` edges where the dependent invokes the package
#: only while building, and the built artifact contains no call into it.
#:
#: Every entry is a specific claim about one framework's behaviour, stated so it
#: can be checked and argued with. Add an edge only with a reason of this kind;
#: "it feels like a build tool" is not one.
BUILD_ONLY_EDGES: dict[tuple[str, str], str] = {
    ("next", "postcss"): (
        "Next.js invokes PostCSS while compiling CSS during `next build`. "
        "Neither `next start` nor a statically exported build calls into it"
    ),
    ("next", "autoprefixer"): (
        "Autoprefixer is a PostCSS plugin Next.js applies at build time; the "
        "emitted CSS is plain text with no runtime dependency on it"
    ),
    ("postcss", "nanoid"): (
        "PostCSS uses nanoid to name source-map entries while transforming "
        "CSS, so it runs only when PostCSS itself runs"
    ),
    ("postcss", "picocolors"): (
        "picocolors formats PostCSS's own diagnostics, which are emitted by "
        "the build process and never by the deployed artifact"
    ),
    ("postcss", "source-map-js"): (
        "source-map-js builds the source maps PostCSS emits during the build"
    ),
}


@dataclass(frozen=True)
class DependencyGraph:
    """Production dependency edges recovered from a v2/v3 ``package-lock.json``.

    ``locations`` is every ``packages`` key in the lockfile, which is what npm's
    resolution algorithm searches. ``dependents`` maps an install-location path
    to the paths that depend on it *on the production graph*; the root project
    appears as :data:`ROOT`.
    """

    locations: frozenset[str]
    dependents: dict[str, frozenset[str]] = field(default_factory=dict)
    dev_locations: frozenset[str] = frozenset()

    def name_of(self, path: str) -> str:
        """The package name an install-location path denotes.

        The root project has no package name; it is reported as ``<root>`` so a
        reason string can name it without pretending it is a dependency.
        """
        if path == ROOT:
            return "<root>"
        marker = "node_modules/"
        index = path.rfind(marker)
        return path[index + len(marker) :] if index != -1 else path


def resolve(dependent_path: str, name: str, locations: frozenset[str]) -> str | None:
    """Resolve ``name`` from ``dependent_path`` the way Node does.

    Node walks up the ``node_modules`` chain and takes the first match, so a
    nested copy shadows a hoisted one. Reimplementing that is what makes an edge
    point at the *location* that is actually loaded rather than at every
    same-named install in the tree.
    """
    prefix = dependent_path
    while True:
        candidate = f"{prefix}/node_modules/{name}" if prefix else f"node_modules/{name}"
        if candidate in locations:
            return candidate
        if not prefix:
            return None
        index = prefix.rfind("/node_modules/")
        prefix = "" if index == -1 else prefix[:index]


def build_from_lockfile_data(raw: dict) -> DependencyGraph:
    """Recover the production dependency graph from decoded lockfile JSON."""
    packages = raw.get("packages")
    if not isinstance(packages, dict):
        return DependencyGraph(frozenset())

    locations = frozenset(packages)
    dependents: dict[str, set[str]] = {}
    dev_locations = {
        path
        for path, entry in packages.items()
        if isinstance(entry, dict) and entry.get("dev", False)
    }

    for path, entry in packages.items():
        if not isinstance(entry, dict) or path in dev_locations:
            # A dev-only location cannot put anything on the production graph.
            continue
        for field_name in PRODUCTION_DEPENDENCY_FIELDS:
            declared = entry.get(field_name)
            if not isinstance(declared, dict):
                continue
            for name in declared:
                target = resolve(path, name, locations)
                if target is not None:
                    dependents.setdefault(target, set()).add(path)

    return DependencyGraph(
        locations=locations,
        dependents={path: frozenset(value) for path, value in dependents.items()},
        dev_locations=frozenset(dev_locations),
    )


def build_from_lockfile(path: str | Path) -> DependencyGraph:
    """Read ``path`` and recover its production dependency graph."""
    return build_from_lockfile_data(
        json.loads(Path(path).read_text(encoding="utf-8"))
    )


def _is_build_only(
    graph: DependencyGraph, location: str, in_progress: frozenset[str]
) -> tuple[bool, list[str]]:
    """Whether ``location`` is reachable in production only through build tools.

    Returns the verdict and, when true, the named edge reasons that justify it.
    """
    if location == ROOT or location in in_progress:
        # The root project is the application itself, and a cycle proves
        # nothing. Both are unproven, which means not suppressible.
        return False, []
    if location in graph.dev_locations:
        # Not on the production graph at all; the dependency-path rule owns it.
        return False, []

    dependents = graph.dependents.get(location)
    if not dependents:
        # Nothing production-side pulls it in, so there is no edge to justify a
        # build-only claim. Fail towards reporting.
        return False, []

    package = graph.name_of(location)
    reasons: list[str] = []
    nested = in_progress | {location}

    for dependent in sorted(dependents):
        edge = (graph.name_of(dependent), package)
        explanation = BUILD_ONLY_EDGES.get(edge)
        if explanation is not None:
            reasons.append(f"`{edge[0]}` → `{edge[1]}`: {explanation}")
            continue
        # No named edge. The dependent may still be build-only itself, in which
        # case nothing it pulls in runs after the build either.
        upstream_ok, upstream_reasons = _is_build_only(graph, dependent, nested)
        if not upstream_ok:
            return False, []
        reasons.append(
            f"`{edge[0]}` → `{edge[1]}`: reached only through a build-only "
            f"dependent ({graph.name_of(dependent)})"
        )
        reasons.extend(upstream_reasons)

    # De-duplicate while preserving order, so a diamond does not repeat itself.
    seen: set[str] = set()
    unique = [r for r in reasons if not (r in seen or seen.add(r))]
    return True, unique


def build_only_reasons(graph: DependencyGraph, location: str) -> list[str] | None:
    """Named reasons ``location`` runs only at build time, or ``None``.

    ``None`` means *not proven*, never *proven safe to report*: every caller
    treats it as "report this finding".
    """
    ok, reasons = _is_build_only(graph, location, frozenset())
    return reasons if ok else None
