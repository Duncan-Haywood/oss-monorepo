"""Article 14 notification draft — the candidate's first-experiment step 2.

``cra-evidence-desk`` sells a pre-drafted 24-hour incident report the customer
sends. Its first experiment step 2 is: generate one draft from a real historical
exploited-vulnerability case and read it for plausibility against the required
fields.

This module is that draft. It is not a filing, not a portal client, and not a
conformity assessment. Every pre-filled value is copied from a CISA KEV catalog
entry the caller supplied; every field the catalog does not carry is left
``unknown`` for the customer to complete. We never hold ENISA credentials and
we never transmit on anyone's behalf.

The field list is a secondary reconstruction of the clocks and contents
commonly cited for CRA Article 14 (24-hour early warning, 72-hour update,
14-day final report). ``eur-lex.europa.eu`` is egress-denied from this
environment, so the list is **not** checked against the regulation text. Each
field is therefore a checklist item, not an official form identifier.
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Mapping

SCHEMA = "cra-article14-draft/v1"

NOT_A_FILING = (
    "This is a DRAFT for the manufacturer to review and, if they choose, to "
    "submit. It is not a filing, not a transmission, not an attestation, and "
    "not a conformity assessment. We do not hold the reporting-portal "
    "credentials and we do not send this anywhere."
)

FIELD_SOURCE_NOTE = (
    "The field list below is a secondary reconstruction of contents commonly "
    "cited for a CRA Article 14 notification. It has not been checked against "
    "the regulation on EUR-Lex from this environment. Treat every row as a "
    "checklist item the manufacturer completes, not as an official form id."
)

KEV_IS_NOT_EUVD = (
    "The exploitation signal is CISA's Known Exploited Vulnerabilities catalog, "
    "reached via its git mirror. That is a US federal catalog. It is not the "
    "EU Vulnerability Database, and a KEV listing is not by itself a CRA "
    "determination that a vulnerability is 'actively exploited' in the "
    "manufacturer's product. The manufacturer decides whether this case is "
    "theirs to report."
)

CLOCKS: tuple[tuple[str, str], ...] = (
    ("early_warning_24h", "Early warning — commonly cited as within 24 hours of awareness"),
    ("update_72h", "Update — commonly cited as within 72 hours of awareness"),
    ("final_14d", "Final report — commonly cited as within 14 days of a corrective or mitigating measure"),
)

# (field_id, clock, label, how we fill it)
# source is one of: kev:<catalog field>, customer, not_in_catalog
FIELD_SPEC: tuple[tuple[str, str, str, str], ...] = (
    ("notification_kind", "early_warning_24h", "Notification kind", "derived"),
    ("manufacturer_name", "early_warning_24h", "Manufacturer name", "customer"),
    ("manufacturer_contact", "early_warning_24h", "Manufacturer contact", "customer"),
    ("product_name", "early_warning_24h", "Product name", "kev:product"),
    ("vendor_project", "early_warning_24h", "Vendor / project named by the catalog", "kev:vendorProject"),
    ("product_version", "early_warning_24h", "Product version(s) the manufacturer shipped", "customer"),
    ("product_identifiers", "early_warning_24h", "Unique product identifiers", "customer"),
    ("vulnerability_identifier", "early_warning_24h", "Vulnerability identifier", "kev:cveID"),
    ("vulnerability_name", "early_warning_24h", "Vulnerability name", "kev:vulnerabilityName"),
    ("short_description", "early_warning_24h", "Short description from the catalog", "kev:shortDescription"),
    ("date_added_to_kev", "early_warning_24h", "Date the catalog listed this entry", "kev:dateAdded"),
    ("date_manufacturer_became_aware", "early_warning_24h", "Date the manufacturer became aware", "customer"),
    ("catalog_required_action", "early_warning_24h", "Corrective or mitigating text in the catalog", "kev:requiredAction"),
    ("known_ransomware_campaign_use", "early_warning_24h", "Catalog ransomware-campaign flag", "kev:knownRansomwareCampaignUse"),
    ("catalog_notes", "early_warning_24h", "Catalog notes / source link", "kev:notes"),
    ("cwes", "early_warning_24h", "CWE identifiers in the catalog", "kev:cwes"),
    ("severity", "update_72h", "Severity as the manufacturer assesses it", "customer"),
    ("potential_impact", "update_72h", "Potential impact on the shipped product", "customer"),
    ("exploitative_circumstances", "update_72h", "Known exploitative circumstances", "customer"),
    ("how_became_aware", "update_72h", "How the manufacturer became aware", "customer"),
    ("corrective_measures_taken", "final_14d", "Corrective or mitigating measures taken", "customer"),
    ("residual_risk", "final_14d", "Residual risk the manufacturer accepts", "customer"),
)

FORBIDDEN_CLAIM_WORDS = ("compliant", "compliance")


@dataclass(frozen=True)
class KevEntry:
    """One CISA KEV vulnerability row, plus the catalog it came from."""

    cve_id: str
    vendor_project: str
    product: str
    vulnerability_name: str
    date_added: str
    short_description: str
    required_action: str
    due_date: str
    known_ransomware_campaign_use: str
    notes: str
    cwes: tuple[str, ...]
    catalog_version: str
    catalog_released: str
    catalog_source: str


@dataclass(frozen=True)
class CustomerContext:
    """Facts only the manufacturer can supply. All optional; missing stays unknown."""

    manufacturer_name: str | None = None
    manufacturer_contact: str | None = None
    product_version: str | None = None
    product_identifiers: str | None = None
    date_became_aware: str | None = None
    severity: str | None = None
    potential_impact: str | None = None
    exploitative_circumstances: str | None = None
    how_became_aware: str | None = None
    corrective_measures_taken: str | None = None
    residual_risk: str | None = None


@dataclass(frozen=True)
class DraftField:
    field_id: str
    clock: str
    label: str
    value: str
    source: str
    status: str  # populated | unknown


@dataclass(frozen=True)
class Article14Draft:
    generated_at: str
    entry: KevEntry
    fields: tuple[DraftField, ...]
    customer: CustomerContext

    def populated_count(self) -> int:
        return sum(1 for field in self.fields if field.status == "populated")

    def unknown_count(self) -> int:
        return sum(1 for field in self.fields if field.status == "unknown")


class KevCatalogError(ValueError):
    """The file is not a KEV catalog this module can read."""


def load_kev_catalog(path: Path) -> tuple[str, str, str, tuple[KevEntry, ...]]:
    """Read a CISA KEV JSON document (full catalog or a one-entry slice)."""

    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        raise KevCatalogError(f"{path} is not JSON: {error}") from error
    if not isinstance(payload, dict):
        raise KevCatalogError(f"{path} is not a KEV object")

    catalog_version = _require_str(payload, "catalogVersion", path)
    catalog_released = _require_str(payload, "dateReleased", path)
    catalog_source = str(payload.get("source") or path)
    raw_entries = payload.get("vulnerabilities")
    if not isinstance(raw_entries, list) or not raw_entries:
        raise KevCatalogError(f"{path} has no vulnerabilities")

    entries: list[KevEntry] = []
    for raw in raw_entries:
        if not isinstance(raw, dict):
            raise KevCatalogError(f"{path} contains a non-object vulnerability")
        entries.append(
            KevEntry(
                cve_id=_require_str(raw, "cveID", path),
                vendor_project=_require_str(raw, "vendorProject", path),
                product=_require_str(raw, "product", path),
                vulnerability_name=_require_str(raw, "vulnerabilityName", path),
                date_added=_require_str(raw, "dateAdded", path),
                short_description=_require_str(raw, "shortDescription", path),
                required_action=_require_str(raw, "requiredAction", path),
                due_date=str(raw.get("dueDate") or ""),
                known_ransomware_campaign_use=str(
                    raw.get("knownRansomwareCampaignUse") or ""
                ),
                notes=str(raw.get("notes") or ""),
                cwes=_cwes(raw.get("cwes")),
                catalog_version=catalog_version,
                catalog_released=catalog_released,
                catalog_source=catalog_source,
            )
        )
    return catalog_version, catalog_released, catalog_source, tuple(entries)


def entry_by_cve(entries: tuple[KevEntry, ...], cve_id: str) -> KevEntry:
    wanted = cve_id.strip().upper()
    for entry in entries:
        if entry.cve_id.upper() == wanted:
            return entry
    available = ", ".join(entry.cve_id for entry in entries)
    raise KevCatalogError(f"{cve_id} is not in this catalog slice ({available})")


def draft_from_entry(
    entry: KevEntry,
    customer: CustomerContext | None = None,
    generated_at: str | None = None,
) -> Article14Draft:
    context = customer or CustomerContext()
    when = generated_at or datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    kev_values: dict[str, str] = {
        "cveID": entry.cve_id,
        "vendorProject": entry.vendor_project,
        "product": entry.product,
        "vulnerabilityName": entry.vulnerability_name,
        "dateAdded": entry.date_added,
        "shortDescription": entry.short_description,
        "requiredAction": entry.required_action,
        "knownRansomwareCampaignUse": entry.known_ransomware_campaign_use,
        "notes": entry.notes,
        "cwes": ", ".join(entry.cwes),
    }
    customer_values: dict[str, str | None] = {
        "manufacturer_name": context.manufacturer_name,
        "manufacturer_contact": context.manufacturer_contact,
        "product_version": context.product_version,
        "product_identifiers": context.product_identifiers,
        "date_manufacturer_became_aware": context.date_became_aware,
        "severity": context.severity,
        "potential_impact": context.potential_impact,
        "exploitative_circumstances": context.exploitative_circumstances,
        "how_became_aware": context.how_became_aware,
        "corrective_measures_taken": context.corrective_measures_taken,
        "residual_risk": context.residual_risk,
    }

    fields: list[DraftField] = []
    for field_id, clock, label, source in FIELD_SPEC:
        if source == "derived" and field_id == "notification_kind":
            fields.append(
                DraftField(
                    field_id=field_id,
                    clock=clock,
                    label=label,
                    value="actively exploited vulnerability (catalog listing; manufacturer confirms)",
                    source="derived:kev-listing",
                    status="populated",
                )
            )
            continue
        if source.startswith("kev:"):
            catalog_field = source.split(":", 1)[1]
            raw = kev_values.get(catalog_field, "")
            fields.append(
                DraftField(
                    field_id=field_id,
                    clock=clock,
                    label=label,
                    value=raw if raw else "unknown — not in this catalog entry",
                    source=source,
                    status="populated" if raw else "unknown",
                )
            )
            continue
        supplied = customer_values.get(field_id)
        fields.append(
            DraftField(
                field_id=field_id,
                clock=clock,
                label=label,
                value=supplied
                if supplied
                else "unknown — manufacturer completes",
                source="customer",
                status="populated" if supplied else "unknown",
            )
        )
    return Article14Draft(
        generated_at=when,
        entry=entry,
        fields=tuple(fields),
        customer=context,
    )


def to_json(draft: Article14Draft) -> str:
    payload = {
        "schema": SCHEMA,
        "generated_at": draft.generated_at,
        "not_a_filing": NOT_A_FILING,
        "field_source_note": FIELD_SOURCE_NOTE,
        "kev_is_not_euvd": KEV_IS_NOT_EUVD,
        "catalog": {
            "version": draft.entry.catalog_version,
            "released": draft.entry.catalog_released,
            "source": draft.entry.catalog_source,
            "cve_id": draft.entry.cve_id,
        },
        "clocks": [{"id": clock_id, "label": label} for clock_id, label in CLOCKS],
        "fields": [
            {
                "id": field.field_id,
                "clock": field.clock,
                "label": field.label,
                "value": field.value,
                "source": field.source,
                "status": field.status,
            }
            for field in draft.fields
        ],
        "counts": {
            "fields": len(draft.fields),
            "populated": draft.populated_count(),
            "unknown": draft.unknown_count(),
        },
    }
    return json.dumps(payload, indent=2, sort_keys=False) + "\n"


def to_markdown(draft: Article14Draft) -> str:
    entry = draft.entry
    lines = [
        f"# Article 14 notification draft — {entry.cve_id}",
        "",
        f"> {NOT_A_FILING}",
        "",
        f"> {FIELD_SOURCE_NOTE}",
        "",
        f"> {KEV_IS_NOT_EUVD}",
        "",
        "## Catalog case",
        "",
        f"- CVE: `{entry.cve_id}`",
        f"- Catalog product: {entry.vendor_project} / {entry.product}",
        f"- Catalog name: {entry.vulnerability_name}",
        f"- Date added: {entry.date_added}",
        f"- Catalog version: {entry.catalog_version} (released {entry.catalog_released})",
        f"- Catalog source: {entry.catalog_source}",
        f"- Draft generated: {draft.generated_at}",
        "",
        "## Clocks (secondary; unverified against EUR-Lex)",
        "",
    ]
    for _clock_id, label in CLOCKS:
        lines.append(f"- {label}")
    lines.extend(
        [
            "",
            "## Fields",
            "",
            "| Clock | Field | Value | Source | Status |",
            "|---|---|---|---|---|",
        ]
    )
    for field in draft.fields:
        lines.append(
            "| "
            + " | ".join(
                (
                    _cell(field.clock),
                    _cell(field.label),
                    _cell(field.value),
                    _cell(field.source),
                    _cell(field.status),
                )
            )
            + " |"
        )
    lines.extend(
        [
            "",
            f"{draft.populated_count()} of {len(draft.fields)} fields populated "
            f"from the catalog or the manufacturer; "
            f"{draft.unknown_count()} remain for the manufacturer.",
            "",
            "## Catalog required-action text (quoted, not advice)",
            "",
            "The next paragraph is CISA catalog text written for US federal "
            "agencies. It is not CRA advice and it is not an instruction from "
            "this tool.",
            "",
            f"> {entry.required_action}",
            "",
            "## What this draft does not do",
            "",
            "- It does not file, transmit, or notify ENISA or any CSIRT.",
            "- It does not assert that the manufacturer's product is in scope.",
            "- It does not match this CVE against a customer SBOM; that is a "
            "separate step the manufacturer performs.",
            "- It does not replace the EU Vulnerability Database. That feed is "
            "egress-denied from the environment that built this tool.",
            "",
        ]
    )
    rendered = "\n".join(lines)
    lowered = rendered.lower()
    for word in FORBIDDEN_CLAIM_WORDS:
        if word in lowered:
            raise AssertionError(
                f"draft contained forbidden claim word {word!r}"
            )
    return rendered


def run(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Render a CRA Article 14 notification draft from a KEV entry."
    )
    parser.add_argument(
        "--kev",
        required=True,
        help="Path to a CISA KEV JSON catalog or a one-entry slice",
    )
    parser.add_argument(
        "--cve",
        default=None,
        help="CVE id to draft. Defaults to the only entry when the slice has one.",
    )
    parser.add_argument("--manufacturer", default=None)
    parser.add_argument("--contact", default=None)
    parser.add_argument("--product-version", default=None)
    parser.add_argument("--output-dir", default=None)
    args = parser.parse_args(argv)

    path = Path(args.kev)
    if not path.is_file():
        print(f"error: no KEV catalog at {path}", file=sys.stderr)
        return 2
    try:
        _version, _released, _source, entries = load_kev_catalog(path)
        entry = entry_by_cve(entries, args.cve) if args.cve else _single_entry(entries)
    except KevCatalogError as error:
        print(f"error: {error}", file=sys.stderr)
        return 2

    draft = draft_from_entry(
        entry,
        CustomerContext(
            manufacturer_name=args.manufacturer,
            manufacturer_contact=args.contact,
            product_version=args.product_version,
        ),
    )
    markdown = to_markdown(draft)
    if args.output_dir:
        output = Path(args.output_dir)
        output.mkdir(parents=True, exist_ok=True)
        (output / "article14-draft.json").write_text(to_json(draft), encoding="utf-8")
        (output / "article14-draft.md").write_text(markdown, encoding="utf-8")
    print(markdown)
    return 0


def _single_entry(entries: tuple[KevEntry, ...]) -> KevEntry:
    if len(entries) != 1:
        raise KevCatalogError(
            "catalog has "
            f"{len(entries)} entries; pass --cve to choose one"
        )
    return entries[0]


def _require_str(payload: Mapping[str, object], key: str, path: Path) -> str:
    value = payload.get(key)
    if not isinstance(value, str) or not value.strip():
        raise KevCatalogError(f"{path} is missing {key}")
    return value


def _cwes(raw: object) -> tuple[str, ...]:
    if not isinstance(raw, list):
        return ()
    return tuple(item for item in raw if isinstance(item, str) and item)


def _cell(value: str) -> str:
    return value.replace("|", "\\|").replace("\n", " ")


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(run())
