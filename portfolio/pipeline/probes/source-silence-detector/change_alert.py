"""The alert a subscriber is sent when a public register changes.

``subscriber_record.py`` is the standing disclosure: how often this watch
misses dormancy, and that silence from us is not evidence a register is
active. It is not the product the candidate sells. The first experiment's
step 2 asks for the other surface — *the alert as it would be sent, with
the source document attached*.

This module is that surface. It quotes a register change. It does not
decide what the change means about anyone, does not invent a field the
register left blank, and does not transmit anything.

The historical case is a CISA KEV catalog addition (CVE-2021-44228,
added 2021-12-10). That is the cheap-to-prototype software-security
vertical ``register-change-rate`` could actually reach. It is **not**
the licensing-and-disciplinary vertical the first experiment named;
those boards have no git mirror from here and their portals are
egress-denied. The alert format is what step 2 asked for. The buyer
test (show it to ten staffing people; ask three to pre-pay) is still
the human half, and it is still unrun.

``generated_at`` is supplied by the caller. No clock is read.
"""

from __future__ import annotations

import json
from typing import Any

TOOL_NAME = "source-silence-detector"
TOOL_VERSION = "0.1.0"

# The register this sample can actually quote. Not a stand-in for a
# licensing board: the write-up ranked those first, and this environment
# cannot read them.
REGISTER = {
    "id": "cisagov/kev-data",
    "name": "CISA Known Exploited Vulnerabilities catalog",
    "vertical": "software-security",
    "source_document_url": (
        "https://www.cisa.gov/known-exploited-vulnerabilities-catalog"
    ),
    "feed_url": (
        "https://www.cisa.gov/sites/default/files/feeds/"
        "known_exploited_vulnerabilities.json"
    ),
}

# Fields the catalog publishes on an entry. Order is the order they
# appear in the alert. A missing value is left unknown — never filled.
CATALOG_FIELDS = (
    "cveID",
    "vendorProject",
    "product",
    "vulnerabilityName",
    "dateAdded",
    "shortDescription",
    "requiredAction",
    "dueDate",
    "knownRansomwareCampaignUse",
    "notes",
    "cwes",
)

UNKNOWN = "unknown — register did not publish"

COVERAGE_STATEMENT = (
    "This alert reports that a public register published a change, and "
    "quotes the fields that register published. It does not read any "
    "other register, does not know whether the change matters to you, "
    "and does not know whether your products, customers, or staff are "
    "named in it. The source document is linked so you can read the "
    "register yourself."
)

VERTICAL_NOTE = (
    "This sample is a software-security catalog addition. The first "
    "experiment named professional licensing and disciplinary actions "
    "as the vertical; those boards have no usable git mirror from this "
    "environment and their portals are egress-denied. Buyers of this "
    "particular feed already receive it free from npm audit, "
    "Dependabot, and the catalog's own mailing list. The format is "
    "what step 2 asked for. The vertical is the one step 1 could "
    "actually reach."
)

WHAT_THIS_IS_NOT = (
    "A determination that your product, network, or customers are affected.",
    "Advice about what you should do. requiredAction and dueDate are "
    "what CISA published for US federal agencies, quoted as catalog "
    "text, not instructions to you.",
    "A score or ranking of any person, vendor, or product.",
    "A filing, notification, or transmission on your behalf. You read "
    "the register; we do not submit anything.",
    "Evidence that this is the only change, or that the register is "
    "complete. We quote one addition we were handed.",
)

WILL_NOT_INVENT = (
    "whether your inventory contains the named product",
    "what you should do about the change",
    "a score or ranking of anyone the record names",
    "a licensing-board action — this sample is not from that vertical",
    "a filing or notification sent on your behalf",
)

# Change-detection accuracy is a different number from the silence
# detector's 0.35 recall. Quoting that figure here would describe the
# wrong surface.
ACCURACY_NOTE = (
    "Change-detection accuracy is not measured. The 6-of-17 (0.35) "
    "held-out figure printed on the subscriber record is for the "
    "silence detector — a different surface, answering whether a "
    "mirror went quiet, not whether a catalog added an entry. This "
    "alert quotes one historical addition that was already in the "
    "catalog. It does not claim it would have caught that addition "
    "on the day it landed, or that it would catch the next one."
)

INCENTIVE_NOTE = (
    "A change alert is the thing we sell, so more alerts look like "
    "more product. Over-notifying — sending you a change that was "
    "not a real addition, or dressing catalog text up as a finding "
    "about you — is the error that would pay us. That is why every "
    "quoted field is labelled as a register quote or as unknown, and "
    "why this page will not say the change affects you."
)


def load_catalog(path: str) -> dict[str, Any]:
    """Read a KEV-shaped catalog document from disk."""
    with open(path, encoding="utf-8") as handle:
        payload = json.load(handle)
    if not isinstance(payload, dict):
        raise ValueError("catalog must be a JSON object")
    return payload


def find_entry(catalog: dict[str, Any], cve_id: str) -> dict[str, Any]:
    """Return the catalog row for ``cve_id``, or raise.

    An unknown identifier is a hard miss, not a row of invented fields.
    """
    for row in catalog.get("vulnerabilities") or []:
        if isinstance(row, dict) and row.get("cveID") == cve_id:
            return row
    raise ValueError(f"{cve_id} is not in this catalog slice")


def _quote_field(row: dict[str, Any], key: str) -> dict[str, Any]:
    value = row.get(key)
    if value in (None, "", []):
        return {"value": None, "state": UNKNOWN}
    return {"value": value, "state": "from register"}


def _entry_url(row: dict[str, Any]) -> str | None:
    """A second link only when the register itself published one.

    ``notes`` on KEV rows often carries the NVD URL. We do not construct
    an NVD URL from the CVE id — that would be inventing a source.
    """
    notes = row.get("notes")
    if not isinstance(notes, str):
        return None
    for token in notes.split():
        if token.startswith("https://"):
            return token.rstrip(";,")
    return None


def build_alert(
    catalog: dict[str, Any],
    cve_id: str,
    generated_at: str,
    register: dict[str, str] | None = None,
) -> dict[str, Any]:
    """Build a subscriber change alert from a catalog addition.

    ``generated_at`` is an ISO-8601 timestamp supplied by the caller.
    """
    if not generated_at or not str(generated_at).strip():
        raise ValueError("generated_at is required; this module does not read a clock")
    meta = dict(register or REGISTER)
    if not meta.get("source_document_url"):
        raise ValueError("source_document_url is mandatory on every alert")
    row = find_entry(catalog, cve_id)
    quoted = {key: _quote_field(row, key) for key in CATALOG_FIELDS}
    published = quoted["dateAdded"]["value"]
    return {
        "kind": "register-change-alert",
        "tool": {"name": TOOL_NAME, "version": TOOL_VERSION},
        "generated_at": generated_at,
        "register": {
            "id": meta["id"],
            "name": meta["name"],
            "vertical": meta["vertical"],
            "source_document_url": meta["source_document_url"],
            "feed_url": meta.get("feed_url"),
        },
        "catalog": {
            "version": catalog.get("catalogVersion"),
            "date_released": catalog.get("dateReleased"),
            "slice_count": catalog.get("count"),
        },
        "change": {
            "type": "entry_added",
            "identifier": cve_id,
            "published": published,
        },
        "source_document_url": meta["source_document_url"],
        "source_entry_url": _entry_url(row),
        "quoted": quoted,
        "coverage_statement": COVERAGE_STATEMENT,
        "vertical_note": VERTICAL_NOTE,
        "what_this_is_not": list(WHAT_THIS_IS_NOT),
        "will_not_invent": list(WILL_NOT_INVENT),
        "accuracy_note": ACCURACY_NOTE,
        "incentive_note": INCENTIVE_NOTE,
    }


def to_markdown(alert: dict[str, Any]) -> str:
    change = alert["change"]
    register = alert["register"]
    catalog = alert["catalog"]
    published = change["published"] or UNKNOWN
    lines = [
        "# Register change — subscriber alert",
        "",
        "This is a change the register published. It is not a finding "
        "about you.",
        "",
        f"**Tool:** `{alert['tool']['name']}` v{alert['tool']['version']}  ",
        f"**Generated:** {alert['generated_at']}  ",
        f"**Register:** {register['name']} (`{register['id']}`)  ",
        f"**Vertical:** {register['vertical']}  ",
        f"**Change:** {change['type']} `{change['identifier']}`  ",
        f"**When the register published it:** {published}  ",
        f"**Source document:** {alert['source_document_url']}",
    ]
    if alert.get("source_entry_url"):
        lines.append(f"**Register-published entry link:** {alert['source_entry_url']}")
    if catalog.get("version"):
        lines.append(
            f"**Catalog slice:** version {catalog['version']}, "
            f"released {catalog.get('date_released') or UNKNOWN} "
            f"(this file carries {catalog.get('slice_count')} "
            f"{'entry' if catalog.get('slice_count') == 1 else 'entries'})"
        )
    lines += [
        "",
        "## What this alert covers",
        "",
        alert["coverage_statement"],
        "",
        f"> **{alert['vertical_note']}**",
        "",
        "## Quoted from the register",
        "",
        "Every row is a field the catalog published, or an explicit "
        "unknown. Nothing in this table is inferred.",
        "",
        "| Field | State | Value |",
        "|---|---|---|",
    ]
    for key, cell in alert["quoted"].items():
        value = cell["value"]
        if value is None:
            rendered = "—"
        elif isinstance(value, list):
            rendered = ", ".join(str(item) for item in value)
        else:
            rendered = str(value).replace("\n", " ")
        lines.append(f"| `{key}` | {cell['state']} | {rendered} |")
    lines += [
        "",
        "CISA `requiredAction` and `dueDate` are US-federal catalog "
        "text aimed at federal civilian executive branch agencies. "
        "They are quoted because the register published them. They "
        "are not instructions to the subscriber.",
        "",
        "## What this alert is not",
        "",
    ]
    lines += [f"- {item}" for item in alert["what_this_is_not"]]
    lines += [
        "",
        "## Fields this page will not invent",
        "",
    ]
    lines += [f"- {item}" for item in alert["will_not_invent"]]
    lines += [
        "",
        "## How this can be wrong",
        "",
        alert["accuracy_note"],
        "",
        alert["incentive_note"],
        "",
    ]
    return "\n".join(lines)


def to_json(alert: dict[str, Any]) -> str:
    return json.dumps(alert, indent=2, sort_keys=True)


def render_from_path(catalog_path: str, cve_id: str, generated_at: str) -> str:
    """Load a catalog file and return the markdown alert."""
    catalog = load_catalog(catalog_path)
    return to_markdown(build_alert(catalog, cve_id, generated_at))
