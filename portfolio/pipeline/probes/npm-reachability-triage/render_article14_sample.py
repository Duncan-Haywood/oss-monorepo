"""Write the committed Article 14 sample from the historical Log4j slice.

The sample is the artifact a later session can read without running the
module. ``tests/test_article14.py`` regenerates the same draft and fails if
this file drifts.
"""

from __future__ import annotations

from pathlib import Path

from triage.article14 import draft_from_entry, entry_by_cve, load_kev_catalog, to_markdown

PROBE = Path(__file__).resolve().parent
FIXTURE = PROBE / "fixtures" / "kev-historical-log4j.json"
SAMPLE = PROBE / "sample-article14-draft-2026-08-24.md"
CVE = "CVE-2021-44228"
GENERATED_AT = "2026-08-24T11:49:00Z"


def main() -> None:
    _version, _released, _source, entries = load_kev_catalog(FIXTURE)
    draft = draft_from_entry(
        entry_by_cve(entries, CVE),
        generated_at=GENERATED_AT,
    )
    SAMPLE.write_text(to_markdown(draft), encoding="utf-8")


if __name__ == "__main__":
    main()
