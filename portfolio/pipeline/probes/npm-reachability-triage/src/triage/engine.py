"""Combine lockfile, deployment and advisory signals into per-finding verdicts.

The ordering of the checks below is the whole design. Each one can only ever
move a finding from "shipped" to "not shipped" on a positive, named piece of
evidence; the fallthrough is always :data:`SHIPPED`. There is no path through
this module that suppresses a finding because something could not be determined.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from . import deployment as deployment_mod
from . import graph as graph_mod
from . import semver, surfaces
from .advisories import Advisory
from .lockfile import InstalledPackage

#: The vulnerable code is present in what the project deploys.
SHIPPED = "shipped"
#: Every install location is reachable only through devDependencies.
DEV_ONLY = "dev-only"
#: The advisory describes a server surface the project does not deploy.
NOT_DEPLOYED = "not-deployed"

#: Verdicts that mean "this finding does not describe deployed code".
SUPPRESSED_VERDICTS = frozenset({DEV_ONLY, NOT_DEPLOYED})


@dataclass(frozen=True)
class ProjectContext:
    """What is known about the scanned project beyond its install locations.

    Every field defaults to "nothing known", and every rule that consumes this
    is written so that "nothing known" means *do not suppress*. A caller that
    passes no context therefore gets exactly the behaviour this tool had before
    the build-surface rule existed, rather than a silently weaker analysis.
    """

    #: Production dependency edges, for the build-surface rule.
    dependency_graph: graph_mod.DependencyGraph | None = None
    #: Packages the project's own package.json puts on the production graph.
    declared_dependencies: frozenset[str] = frozenset()
    #: Packages the project's own source imports.
    source_imports: frozenset[str] = frozenset()

    def uses_directly(self, package: str) -> bool:
        """Whether the project itself appears to use ``package`` at runtime."""
        return package in self.declared_dependencies or package in self.source_imports


#: Used when a caller supplies no context. Suppresses nothing on its own.
NO_CONTEXT = ProjectContext()


@dataclass(frozen=True)
class Finding:
    """One advisory matched against one package's install locations."""

    advisory_id: str
    package: str
    summary: str
    severity: str | None
    verdict: str
    reason: str
    locations: tuple[InstalledPackage, ...] = ()
    rule: str | None = None
    caveats: tuple[str, ...] = field(default_factory=tuple)

    @property
    def suppressed(self) -> bool:
        return self.verdict in SUPPRESSED_VERDICTS

    @property
    def versions(self) -> tuple[str, ...]:
        return tuple(sorted({location.version for location in self.locations}))


def _matches_range(version: str, entry) -> tuple[bool, str | None]:
    """Return whether ``version`` is in ``entry``'s range, plus any caveat.

    An unparseable version or range returns ``True`` with a caveat rather than
    ``False``: a range this module cannot read is not evidence of safety.
    """
    try:
        if entry.events:
            return semver.in_osv_range(version, list(entry.events)), None
        if entry.range_text is not None:
            return semver.satisfies(version, entry.range_text), None
    except semver.UnparseableRange as error:
        return True, f"version/range not parseable ({error}); assumed affected"
    return False, None


def _match_locations(
    advisory: Advisory, installed_by_name: dict[str, list[InstalledPackage]]
) -> dict[str, tuple[list[InstalledPackage], list[str]]]:
    """Find, per package, which install locations the advisory covers."""
    matched: dict[str, tuple[list[InstalledPackage], list[str]]] = {}

    for entry in advisory.affected:
        candidates = installed_by_name.get(entry.package)
        if not candidates:
            continue
        locations, caveats = matched.setdefault(entry.package, ([], []))
        for candidate in candidates:
            if candidate in locations:
                continue
            hit, caveat = _matches_range(candidate.version, entry)
            if hit:
                locations.append(candidate)
                if caveat and caveat not in caveats:
                    caveats.append(caveat)

    return {name: value for name, value in matched.items() if value[0]}


def triage(
    installed: list[InstalledPackage],
    advisories: list[Advisory],
    profile: deployment_mod.DeploymentProfile,
    context: ProjectContext | None = None,
) -> list[Finding]:
    """Produce a verdict for every advisory that matches an installed package."""
    context = context or NO_CONTEXT
    installed_by_name: dict[str, list[InstalledPackage]] = {}
    for package in installed:
        installed_by_name.setdefault(package.name, []).append(package)

    findings: list[Finding] = []
    for advisory in advisories:
        for package_name, (locations, caveats) in _match_locations(
            advisory, installed_by_name
        ).items():
            findings.append(
                _classify(
                    advisory,
                    package_name,
                    tuple(locations),
                    tuple(caveats),
                    profile,
                    context,
                )
            )

    findings.sort(key=lambda finding: (finding.verdict != SHIPPED, finding.package, finding.advisory_id))
    return findings


def _build_only_reasons(
    package: str,
    locations: tuple[InstalledPackage, ...],
    context: ProjectContext,
) -> list[str] | None:
    """Named reasons every production location of ``package`` runs only at build time.

    Returns ``None`` unless *every* production install location is proven
    build-only and the project shows no sign of using the package itself. One
    unproven location is enough to report the finding, because the deployed
    artifact only has to load the package once for the advisory to apply.
    """
    graph = context.dependency_graph
    if graph is None or context.uses_directly(package):
        return None

    production = [location for location in locations if location.is_production]
    if not production:
        # Every location is dev-only, which is rule 1's job, not this one.
        return None

    reasons: list[str] = []
    for location in production:
        proven = graph_mod.build_only_reasons(graph, location.path)
        if proven is None:
            return None
        reasons.extend(proven)

    seen: set[str] = set()
    return [reason for reason in reasons if not (reason in seen or seen.add(reason))]


def _classify(
    advisory: Advisory,
    package: str,
    locations: tuple[InstalledPackage, ...],
    caveats: tuple[str, ...],
    profile: deployment_mod.DeploymentProfile,
    context: ProjectContext = NO_CONTEXT,
) -> Finding:
    """Apply the suppression rules to one matched advisory/package pair."""

    def finding(verdict: str, reason: str, rule: str | None = None) -> Finding:
        return Finding(
            advisory_id=advisory.id,
            package=package,
            summary=advisory.summary,
            severity=advisory.severity,
            verdict=verdict,
            reason=reason,
            locations=locations,
            rule=rule,
            caveats=caveats,
        )

    # A caveat means some version or range could not be read. Never suppress on
    # top of an unreliable match, whatever the other signals say.
    if caveats:
        return finding(
            SHIPPED,
            "Treated as shipped because the version match could not be made "
            "reliably; suppression rules are not applied to uncertain matches.",
        )

    # Rule 1 — dependency path. npm computes `dev` per install location, so this
    # is a structural fact about the lockfile, not an inference.
    if all(location.dev for location in locations):
        paths = ", ".join(location.path for location in locations[:3])
        return finding(
            DEV_ONLY,
            f"Every install location is reachable only through devDependencies "
            f"({paths}), so the vulnerable code is not in the published artifact.",
            rule="dependency-path",
        )

    # Rule 2 — development-server surface. `next dev` is not what `next build`
    # emits, so this holds for static and server deployments alike, which is why
    # it is checked before the deployment-mode rule rather than inside it.
    if surfaces.is_dev_server_only(advisory.text):
        return finding(
            DEV_ONLY,
            "The advisory is scoped to the development server, which is not part "
            "of a production build.",
            rule="dev-server-surface",
        )

    # Rule 3 — build surface. Like rule 2, this holds for static and server
    # deployments alike: a package the build toolchain calls and the deployed
    # artifact never loads is absent from both. The evidence is structural — the
    # lockfile's own production dependency edges — so no advisory text is read
    # here, and a package the project declares or imports itself is excluded
    # before the graph is consulted at all.
    build_reasons = _build_only_reasons(package, locations, context)
    if build_reasons is not None:
        return finding(
            NOT_DEPLOYED,
            f"Every production install location is reached only through the "
            f"build toolchain, so the deployed artifact never loads this "
            f"package ({'; '.join(build_reasons)}). The advisory may still "
            f"describe a real risk to the machine that runs the build.",
            rule="build-surface",
        )

    # Rule 4 — deployment surface. Requires the project to definitely not ship a
    # server *and* the advisory to definitely describe a server-only surface.
    if profile.mode == deployment_mod.STATIC_EXPORT and profile.confidence == "high":
        verdict = surfaces.classify(advisory.text)
        if verdict.server_only:
            return finding(
                NOT_DEPLOYED,
                f"{verdict.explanation}, and this project builds a static export "
                f"({'; '.join(profile.evidence)}).",
                rule=f"server-surface:{verdict.matched_rule}",
            )

    return finding(
        SHIPPED,
        "Present on a production dependency path with no evidence that the "
        "affected surface is absent from the deployed artifact.",
    )
