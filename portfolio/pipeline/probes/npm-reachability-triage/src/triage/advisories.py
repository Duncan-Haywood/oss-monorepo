"""Normalised advisory records, and loaders for the feeds that publish them.

Two feeds are supported because they are the two that are reachable without a
credential:

* **OSV** — ``storage.googleapis.com/osv-vulnerabilities/npm/all.zip``. Bulk,
  daily, structured version ranges. Preferred.
* **npm bulk advisories** — ``registry.npmjs.org/-/npm/v1/security/advisories/bulk``,
  the endpoint ``npm audit`` itself uses. String ranges.

Network access lives here and nowhere else, so the triage logic can be tested
against fixtures with no network at all.
"""

from __future__ import annotations

import io
import json
import zipfile
from dataclasses import dataclass, field
from typing import Iterable

OSV_NPM_BULK_URL = "https://storage.googleapis.com/osv-vulnerabilities/npm/all.zip"
NPM_BULK_ADVISORY_URL = (
    "https://registry.npmjs.org/-/npm/v1/security/advisories/bulk"
)


@dataclass(frozen=True)
class AffectedRange:
    """One package's affected version range, in whichever dialect it arrived."""

    package: str
    #: OSV structured events, when the source provided them.
    events: tuple[dict, ...] = ()
    #: An npm range string, when the source provided that instead.
    range_text: str | None = None


@dataclass(frozen=True)
class Advisory:
    """A vulnerability record, normalised across feeds."""

    id: str
    summary: str = ""
    details: str = ""
    severity: str | None = None
    aliases: tuple[str, ...] = ()
    affected: tuple[AffectedRange, ...] = field(default_factory=tuple)

    @property
    def text(self) -> str:
        """Summary and details joined, for surface classification."""
        return f"{self.summary}\n{self.details}".strip()

    @property
    def packages(self) -> set[str]:
        return {entry.package for entry in self.affected}


def advisory_from_osv(record: dict) -> Advisory:
    """Build an :class:`Advisory` from one OSV JSON record."""
    affected: list[AffectedRange] = []
    for entry in record.get("affected", []) or []:
        package = (entry.get("package") or {}).get("name")
        if not package:
            continue
        for range_entry in entry.get("ranges", []) or []:
            # ECOSYSTEM and SEMVER both carry semver events for npm; GIT ranges
            # carry commit hashes and are not usable for version matching.
            if range_entry.get("type") not in ("ECOSYSTEM", "SEMVER"):
                continue
            events = tuple(range_entry.get("events", []) or ())
            if events:
                affected.append(AffectedRange(package, events=events))

    severity = None
    for item in record.get("severity", []) or []:
        if item.get("type", "").startswith("CVSS"):
            severity = item.get("score")
            break
    if severity is None:
        severity = (record.get("database_specific") or {}).get("severity")

    return Advisory(
        id=record.get("id", "<unknown>"),
        summary=record.get("summary", "") or "",
        details=record.get("details", "") or "",
        severity=severity,
        aliases=tuple(record.get("aliases", []) or ()),
        affected=tuple(affected),
    )


def load_osv_zip(data: bytes, packages: Iterable[str] | None = None) -> list[Advisory]:
    """Parse an OSV bulk zip, optionally keeping only advisories for ``packages``.

    Filtering during the walk rather than afterwards matters: the npm slice runs
    to hundreds of thousands of records and holding them all is unnecessary when
    a lockfile names a few thousand packages.
    """
    wanted = set(packages) if packages is not None else None
    advisories: list[Advisory] = []

    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        for info in archive.infolist():
            if info.is_dir() or not info.filename.endswith(".json"):
                continue
            try:
                record = json.loads(archive.read(info))
            except (json.JSONDecodeError, UnicodeDecodeError):
                continue
            advisory = advisory_from_osv(record)
            if not advisory.affected:
                continue
            if wanted is not None and not (advisory.packages & wanted):
                continue
            advisories.append(advisory)

    return advisories


def load_osv_records(records: Iterable[dict]) -> list[Advisory]:
    """Build advisories from already-decoded OSV records. Used by the tests."""
    return [
        advisory
        for advisory in (advisory_from_osv(record) for record in records)
        if advisory.affected
    ]


def advisories_from_npm_bulk(payload: dict) -> list[Advisory]:
    """Build advisories from an ``npm audit`` bulk-endpoint response.

    The payload maps package name to a list of advisory objects carrying
    ``vulnerable_versions`` range strings rather than OSV events.
    """
    advisories: list[Advisory] = []
    for package, entries in (payload or {}).items():
        for entry in entries or []:
            identifier = (
                entry.get("github_advisory_id")
                or entry.get("url")
                or f"npm-{entry.get('id', 'unknown')}"
            )
            advisories.append(
                Advisory(
                    id=str(identifier),
                    summary=entry.get("title", "") or "",
                    details=entry.get("overview", "") or "",
                    severity=entry.get("severity"),
                    aliases=tuple(entry.get("cves", []) or ()),
                    affected=(
                        AffectedRange(
                            package,
                            range_text=entry.get("vulnerable_versions", "*"),
                        ),
                    ),
                )
            )
    return advisories


def fetch_osv_bulk(packages: Iterable[str] | None = None, timeout: int = 120):
    """Download and parse the OSV npm bulk archive.

    Imported lazily so that the rest of the module — and therefore the whole
    test suite — has no dependency on network availability.
    """
    from urllib.request import urlopen

    with urlopen(OSV_NPM_BULK_URL, timeout=timeout) as response:  # noqa: S310
        data = response.read()
    return load_osv_zip(data, packages)
