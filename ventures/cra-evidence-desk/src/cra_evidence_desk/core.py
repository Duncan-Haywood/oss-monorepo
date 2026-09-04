from __future__ import annotations

from typing import Any

from .normalize import normalize_advisories, normalize_sbom, unmatchable_advisories


def _components(sbom: dict[str, Any]) -> list[dict[str, str]]:
    """Components as exact coordinates, from CycloneDX, SPDX, or the native shape.

    This used to read `sbom["components"]` directly and require the caller to
    have already produced `{ecosystem, name, version}` triples. `normalize_sbom`
    accepts that same shape unchanged and additionally reads the two formats
    real tooling emits -- see `normalize.py` for why that is a coverage fix
    rather than a convenience.
    """
    return normalize_sbom(sbom)


def match(sbom: dict[str, Any], advisories: list[dict[str, Any]]) -> list[dict[str, str]]:
    """Match exact component coordinates; never infer affected ranges."""
    indexed = {(a["ecosystem"], a["name"].lower(), a["version"]): a for a in normalize_advisories(advisories)}
    findings = []
    for component in _components(sbom):
        key = (component["ecosystem"], component["name"].lower(), component["version"])
        advisory = indexed.get(key)
        if advisory:
            findings.append({
                "component": f"{component['name']}@{component['version']}",
                "ecosystem": component["ecosystem"] or "unspecified",
                "advisory": advisory["id"],
                "summary": advisory["summary"],
                "source": advisory["source"],
            })
    return findings


def report(sbom: dict[str, Any], advisories: list[dict[str, Any]], product: str, version: str) -> dict[str, Any]:
    findings = match(sbom, advisories)
    skipped = unmatchable_advisories(advisories)
    result = {
        "product": product,
        "version": version,
        "component_count": len(_components(sbom)),
        "advisory_count": len(normalize_advisories(advisories)),
        "matched_findings": findings,
        "coverage": "Exact name, ecosystem, and version matches only; no range or reachability analysis.",
        "next_step": "Review each finding against the authoritative advisory and decide whether a report is required.",
    }
    # Only present when there is something to say. A reviewer reading a clean
    # report needs to know that part of their advisory export was expressed in
    # a form this tool declines to interpret; a reviewer whose export had no
    # such records should not be handed an empty list to puzzle over.
    if skipped:
        result["advisories_not_evaluated"] = skipped
    return result


def article14_draft(result: dict[str, Any]) -> str:
    lines = ["CUSTOMER REVIEW DRAFT: CRA ARTICLE 14 INCIDENT NOTIFICATION", "", f"Product: {result['product']}", f"Affected version under review: {result['version']}", "", "Observed evidence:"]
    if result["matched_findings"]:
        lines.extend(f"- {f['component']} matched {f['advisory']}: {f['summary']} (source: {f['source']})" for f in result["matched_findings"])
    else:
        lines.append("- No exact matches in the supplied advisory export.")
    if result.get("advisories_not_evaluated"):
        lines += ["", "Not evaluated by this tool (review these separately):"]
        lines.extend(f"- {s['advisory']}: {s['reason']}" for s in result["advisories_not_evaluated"])
    lines += ["", "Customer action required: verify applicability, impact, mitigation, and reporting deadline with a qualified professional and the authoritative authority.", "This draft is not a filing, legal advice, or a conclusion that a report is required."]
    return "\n".join(lines) + "\n"
