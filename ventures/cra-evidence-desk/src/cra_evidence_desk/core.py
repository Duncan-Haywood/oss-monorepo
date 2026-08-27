from __future__ import annotations

from typing import Any


def _components(sbom: dict[str, Any]) -> list[dict[str, str]]:
    return [c for c in sbom.get("components", []) if isinstance(c, dict) and c.get("name") and c.get("version")]


def match(sbom: dict[str, Any], advisories: list[dict[str, Any]]) -> list[dict[str, str]]:
    """Match exact component coordinates; never infer affected ranges."""
    indexed = {(str(a.get("ecosystem", "")).lower(), str(a.get("name", "")).lower(), str(a.get("version", ""))): a for a in advisories}
    findings = []
    for component in _components(sbom):
        ecosystem = str(component.get("ecosystem", "")).lower()
        key = (ecosystem, str(component["name"]).lower(), str(component["version"]))
        advisory = indexed.get(key)
        if advisory:
            findings.append({
                "component": f"{component['name']}@{component['version']}",
                "ecosystem": ecosystem or "unspecified",
                "advisory": str(advisory.get("id", "unidentified")),
                "summary": str(advisory.get("summary", "No advisory summary supplied.")),
                "source": str(advisory.get("source", "customer-supplied export")),
            })
    return findings


def report(sbom: dict[str, Any], advisories: list[dict[str, Any]], product: str, version: str) -> dict[str, Any]:
    findings = match(sbom, advisories)
    return {
        "product": product,
        "version": version,
        "component_count": len(_components(sbom)),
        "advisory_count": len(advisories),
        "matched_findings": findings,
        "coverage": "Exact name, ecosystem, and version matches only; no range or reachability analysis.",
        "next_step": "Review each finding against the authoritative advisory and decide whether a report is required.",
    }


def article14_draft(result: dict[str, Any]) -> str:
    lines = ["CUSTOMER REVIEW DRAFT: CRA ARTICLE 14 INCIDENT NOTIFICATION", "", f"Product: {result['product']}", f"Affected version under review: {result['version']}", "", "Observed evidence:"]
    if result["matched_findings"]:
        lines.extend(f"- {f['component']} matched {f['advisory']}: {f['summary']} (source: {f['source']})" for f in result["matched_findings"])
    else:
        lines.append("- No exact matches in the supplied advisory export.")
    lines += ["", "Customer action required: verify applicability, impact, mitigation, and reporting deadline with a qualified professional and the authoritative authority.", "This draft is not a filing, legal advice, or a conclusion that a report is required."]
    return "\n".join(lines) + "\n"
