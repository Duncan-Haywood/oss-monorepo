"""Bring real-world SBOM and advisory exports into the one shape `core.match` reads.

Until this module existed the matcher accepted exactly one input shape --
`{"components": [{"ecosystem", "name", "version"}]}` -- which nothing in the
world actually emits. A vendor running `npm sbom`, `syft`, `cdxgen` or
`trivy` gets CycloneDX; a vendor whose customer sent them an SBOM under a
procurement clause usually gets SPDX; an advisory export pulled from osv.dev
is OSV. Every one of them had to be hand-converted before the tool would look
at it, which is a conversion step with its own transcription risk in front of
a tool whose entire value is *not* transcribing things by hand.

The coverage boundary in `README.md` is unchanged and this module is written
to keep it that way: nothing here infers an affected range, an alias, or a
reachability verdict. It only reads coordinates that the input states
outright. The one place that discipline is load-bearing is OSV, where
`affected[].versions` is an enumerated list of exact versions and
`affected[].ranges` is a range expression -- so the enumerated list is read
and the ranges are ignored. An advisory that carries only ranges therefore
contributes no match, which is the honest answer for an exact-match tool and
is why `unmatchable_advisories` reports it rather than dropping it silently.
"""

from __future__ import annotations

import re
from typing import Any
from urllib.parse import unquote

# A purl type and an OSV ecosystem name for the same registry are frequently
# different strings ("golang" vs "Go", "cargo" vs "crates.io"), and matching is
# exact, so a CycloneDX SBOM and an OSV advisory naming the same package would
# never meet without this table. Keys are lowercased on lookup; the value is
# this tool's canonical spelling, which is the purl type wherever the two
# disagree -- purl is the identifier the SBOM formats themselves carry.
ECOSYSTEM_ALIASES = {
    "crates.io": "cargo",
    "go": "golang",
    "packagist": "composer",
    "rubygems": "gem",
    "pypi": "pypi",
    "npm": "npm",
    "maven": "maven",
    "nuget": "nuget",
    "hex": "hex",
    "pub": "pub",
    "cran": "cran",
    "hackage": "hackage",
    "swifturl": "swift",
}

# Maven coordinates are conventionally written `group:artifact` (that is what
# OSV uses), while a purl splits them into namespace and name. Every other
# ecosystem in the table above joins with `/` -- an npm scope reads
# `@scope/name`, a Go module path reads `github.com/owner/repo`.
_COLON_JOINED_ECOSYSTEMS = {"maven"}

_PURL = re.compile(r"^pkg:(?P<type>[^/]+)/(?P<rest>.+)$", re.IGNORECASE)


def canonical_ecosystem(value: Any) -> str:
    """Fold a purl type or an OSV ecosystem name onto one spelling."""
    text = str(value or "").strip().lower()
    if not text:
        return ""
    # OSV qualifies some ecosystems with a distribution, e.g. "Alpine:v3.19".
    # The qualifier narrows which advisories apply, not which package is named,
    # and carrying it would stop an SBOM's plain "alpine" from ever matching.
    text = text.split(":", 1)[0]
    return ECOSYSTEM_ALIASES.get(text, text)


def _join_name(ecosystem: str, namespace: str, name: str) -> str:
    if not namespace:
        return name
    separator = ":" if ecosystem in _COLON_JOINED_ECOSYSTEMS else "/"
    return f"{namespace}{separator}{name}"


def parse_purl(purl: Any) -> dict[str, str] | None:
    """Split a package URL into the coordinates this tool matches on.

    Returns `None` rather than raising for anything that is not a purl, because
    an SBOM carrying one malformed entry among two thousand good ones should
    still be usable -- the entry is skipped, and the caller's own
    `name`/`version` fields are tried instead.
    """
    match = _PURL.match(str(purl or "").strip())
    if not match:
        return None
    ecosystem = canonical_ecosystem(match.group("type"))
    # Qualifiers and subpath are scoping information (`?arch=x86_64`,
    # `#subdir`), never part of the identity being matched.
    rest = match.group("rest").split("#", 1)[0].split("?", 1)[0]
    version = ""
    if "@" in rest:
        rest, _, version = rest.rpartition("@")
    segments = [unquote(segment) for segment in rest.split("/") if segment]
    if not segments:
        return None
    name = segments[-1]
    namespace = "/".join(segments[:-1])
    return {
        "ecosystem": ecosystem,
        "name": _join_name(ecosystem, namespace, name),
        "version": unquote(version),
    }


def _coordinate(ecosystem: Any, name: Any, version: Any) -> dict[str, str] | None:
    name_text = str(name or "").strip()
    version_text = str(version or "").strip()
    if not name_text or not version_text:
        return None
    return {
        "ecosystem": canonical_ecosystem(ecosystem),
        "name": name_text,
        "version": version_text,
    }


def _from_purl_or_fields(purl: Any, ecosystem: Any, name: Any, version: Any) -> dict[str, str] | None:
    """Prefer the purl, fall back to the loose fields, and let each fill the other's gaps.

    Real exports are ragged: CycloneDX usually has both a purl and
    `name`/`version`, SPDX often has a purl only inside `externalRefs`, and
    some tools emit a purl with no version because the version lives in
    `versionInfo` beside it. Taking the purl as the base and filling blanks
    from the sibling fields covers all three without ever preferring a guess
    over something the file stated.
    """
    parsed = parse_purl(purl)
    if parsed:
        return _coordinate(
            parsed["ecosystem"] or ecosystem,
            parsed["name"] or name,
            parsed["version"] or version,
        )
    return _coordinate(ecosystem, name, version)


def _spdx_purl(package: dict[str, Any]) -> str:
    for ref in package.get("externalRefs") or []:
        if not isinstance(ref, dict):
            continue
        if str(ref.get("referenceType", "")).lower() == "purl":
            return str(ref.get("referenceLocator", ""))
    return ""


def normalize_sbom(document: Any) -> list[dict[str, str]]:
    """Every component in a CycloneDX, SPDX, or native SBOM, as exact coordinates.

    Components without both a name and a version are dropped, matching the
    original `core._components` rule: a coordinate missing half of itself
    cannot participate in an exact match, and keeping it would only inflate
    the `component_count` a reviewer uses to sanity-check their own file.
    """
    if not isinstance(document, dict):
        return []

    components: list[dict[str, str]] = []

    # SPDX. Checked before `components` because an SPDX document never carries
    # that key, so the order is only about being explicit.
    for package in document.get("packages") or []:
        if not isinstance(package, dict):
            continue
        coordinate = _from_purl_or_fields(
            _spdx_purl(package),
            package.get("ecosystem"),
            package.get("name"),
            package.get("versionInfo") or package.get("version"),
        )
        if coordinate:
            components.append(coordinate)

    # CycloneDX and the native shape share the `components` key. CycloneDX adds
    # a purl and nests sub-components; the native shape is the flat subset, so
    # one walk reads both.
    def walk(entries: Any) -> None:
        for entry in entries or []:
            if not isinstance(entry, dict):
                continue
            coordinate = _from_purl_or_fields(
                entry.get("purl"),
                entry.get("ecosystem"),
                entry.get("name"),
                entry.get("version"),
            )
            if coordinate:
                components.append(coordinate)
            walk(entry.get("components"))

    walk(document.get("components"))
    return components


def _osv_advisory_entries(vuln: dict[str, Any]) -> list[dict[str, str]]:
    """One entry per exact version an OSV record states outright.

    `affected[].ranges` is deliberately not read. A range says "everything
    below 1.4.2", which is precisely the inference this tool's coverage
    boundary refuses to make on the customer's behalf.
    """
    identifier = str(vuln.get("id", "unidentified"))
    summary = str(vuln.get("summary") or vuln.get("details") or "No advisory summary supplied.")
    references = vuln.get("references") or []
    source = "customer-supplied export"
    if isinstance(references, list):
        for reference in references:
            if isinstance(reference, dict) and reference.get("url"):
                source = str(reference["url"])
                break

    entries: list[dict[str, str]] = []
    for affected in vuln.get("affected") or []:
        if not isinstance(affected, dict):
            continue
        package = affected.get("package")
        if not isinstance(package, dict):
            continue
        for version in affected.get("versions") or []:
            coordinate = _from_purl_or_fields(
                package.get("purl"),
                package.get("ecosystem"),
                package.get("name"),
                version,
            )
            if coordinate:
                entries.append({**coordinate, "id": identifier, "summary": summary, "source": source})
    return entries


def _looks_like_osv(entry: dict[str, Any]) -> bool:
    return "affected" in entry or "modified" in entry


def normalize_advisories(document: Any) -> list[dict[str, str]]:
    """Advisories from an OSV export or the native list, as exact coordinates."""
    entries = document
    if isinstance(document, dict):
        # osv.dev batch exports wrap the list; both spellings are in the wild.
        entries = document.get("vulns") or document.get("advisories") or []
    if not isinstance(entries, list):
        return []

    advisories: list[dict[str, str]] = []
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        if _looks_like_osv(entry):
            advisories.extend(_osv_advisory_entries(entry))
            continue
        coordinate = _from_purl_or_fields(
            entry.get("purl"),
            entry.get("ecosystem"),
            entry.get("name"),
            entry.get("version"),
        )
        if coordinate:
            advisories.append({
                **coordinate,
                "id": str(entry.get("id", "unidentified")),
                "summary": str(entry.get("summary", "No advisory summary supplied.")),
                "source": str(entry.get("source", "customer-supplied export")),
            })
    return advisories


def unmatchable_advisories(document: Any) -> list[dict[str, str]]:
    """OSV records that state only version *ranges*, and so can never match here.

    Surfaced to the reviewer rather than dropped. "No findings" means something
    very different when a third of the advisory export was expressed in a form
    this tool declines to interpret, and a reviewer who is not told that would
    reasonably read a clean report as coverage it does not have.
    """
    entries = document
    if isinstance(document, dict):
        entries = document.get("vulns") or document.get("advisories") or []
    if not isinstance(entries, list):
        return []

    skipped: list[dict[str, str]] = []
    for entry in entries:
        if not isinstance(entry, dict) or not _looks_like_osv(entry):
            continue
        has_exact = False
        has_ranges = False
        for affected in entry.get("affected") or []:
            if not isinstance(affected, dict):
                continue
            if affected.get("versions"):
                has_exact = True
            if affected.get("ranges"):
                has_ranges = True
        if has_ranges and not has_exact:
            skipped.append({
                "advisory": str(entry.get("id", "unidentified")),
                "reason": "states affected versions as a range only; this tool matches exact versions and does not resolve ranges",
            })
    return skipped
