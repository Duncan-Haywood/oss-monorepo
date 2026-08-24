"""Article 14 draft — first-experiment step 2 for cra-evidence-desk.

The draft has to be usable as a checklist and unusable as a filing or a
warranty. These tests pin that, plus the historical Log4j case the write-up
asked for.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from triage.article14 import (
    CLOCKS,
    FIELD_SPEC,
    FORBIDDEN_CLAIM_WORDS,
    KEV_IS_NOT_EUVD,
    NOT_A_FILING,
    SCHEMA,
    CustomerContext,
    KevCatalogError,
    draft_from_entry,
    entry_by_cve,
    load_kev_catalog,
    run,
    to_json,
    to_markdown,
)

PROBE = Path(__file__).resolve().parent.parent
FIXTURE = PROBE / "fixtures" / "kev-historical-log4j.json"
SAMPLE = PROBE / "sample-article14-draft-2026-08-24.md"
HISTORICAL_CVE = "CVE-2021-44228"
GENERATED_AT = "2026-08-24T11:49:00Z"


def _historical_draft(customer: CustomerContext | None = None):
    _version, _released, _source, entries = load_kev_catalog(FIXTURE)
    return draft_from_entry(
        entry_by_cve(entries, HISTORICAL_CVE),
        customer,
        generated_at=GENERATED_AT,
    )


class TestCatalog:
    def test_loads_the_historical_log4j_slice(self):
        version, released, source, entries = load_kev_catalog(FIXTURE)
        assert version == "2026.08.21"
        assert released.startswith("2026-08-21")
        assert "cisagov/kev-data" in source
        assert len(entries) == 1
        assert entries[0].cve_id == HISTORICAL_CVE
        assert entries[0].product == "Log4j2"
        assert entries[0].cwes == ("CWE-20", "CWE-400", "CWE-502")

    def test_rejects_unknown_cve(self):
        _version, _released, _source, entries = load_kev_catalog(FIXTURE)
        with pytest.raises(KevCatalogError, match="CVE-1999-0001"):
            entry_by_cve(entries, "CVE-1999-0001")

    def test_rejects_empty_catalog(self, tmp_path: Path):
        empty = tmp_path / "empty.json"
        empty.write_text('{"catalogVersion": "x", "dateReleased": "y", "vulnerabilities": []}', encoding="utf-8")
        with pytest.raises(KevCatalogError, match="no vulnerabilities"):
            load_kev_catalog(empty)


class TestDraftFields:
    def test_every_specified_field_is_present(self):
        draft = _historical_draft()
        ids = [field.field_id for field in draft.fields]
        assert ids == [spec[0] for spec in FIELD_SPEC]

    def test_every_clock_has_at_least_one_field(self):
        draft = _historical_draft()
        clocks = {field.clock for field in draft.fields}
        assert clocks == {clock_id for clock_id, _label in CLOCKS}

    def test_catalog_fields_are_populated_and_customer_fields_are_not(self):
        draft = _historical_draft()
        by_id = {field.field_id: field for field in draft.fields}
        assert by_id["vulnerability_identifier"].value == HISTORICAL_CVE
        assert by_id["vulnerability_identifier"].status == "populated"
        assert by_id["product_name"].value == "Log4j2"
        assert by_id["manufacturer_name"].status == "unknown"
        assert by_id["product_version"].status == "unknown"
        assert by_id["date_manufacturer_became_aware"].status == "unknown"
        assert draft.unknown_count() >= 8
        assert draft.populated_count() >= 8

    def test_manufacturer_name_fills_only_that_field(self):
        draft = _historical_draft(CustomerContext(manufacturer_name="Example GmbH"))
        by_id = {field.field_id: field for field in draft.fields}
        assert by_id["manufacturer_name"].value == "Example GmbH"
        assert by_id["manufacturer_name"].status == "populated"
        assert by_id["manufacturer_contact"].status == "unknown"

    def test_notification_kind_does_not_decide_the_case_is_theirs(self):
        draft = _historical_draft()
        kind = next(field for field in draft.fields if field.field_id == "notification_kind")
        assert "manufacturer confirms" in kind.value


class TestHonesty:
    def test_markdown_is_a_draft_not_a_filing(self):
        rendered = to_markdown(_historical_draft()).lower()
        assert "draft" in rendered
        assert "not a filing" in rendered
        assert "do not send this anywhere" in rendered
        assert "customer" in rendered or "manufacturer" in rendered

    def test_never_claims_compliance(self):
        rendered = to_markdown(_historical_draft()).lower()
        for word in FORBIDDEN_CLAIM_WORDS:
            assert word not in rendered

    def test_quotes_catalog_action_as_catalog_text_not_advice(self):
        rendered = to_markdown(_historical_draft())
        assert "quoted, not advice" in rendered.lower() or "Quoted, not advice" in rendered
        assert "not CRA advice" in rendered
        assert "Apply updates" in rendered

    def test_names_the_euvd_gap(self):
        rendered = to_markdown(_historical_draft())
        assert KEV_IS_NOT_EUVD.split(".")[0] in rendered
        assert "EU Vulnerability Database" in rendered

    def test_json_carries_the_same_limits(self):
        payload = json.loads(to_json(_historical_draft()))
        assert payload["schema"] == SCHEMA
        assert payload["not_a_filing"] == NOT_A_FILING
        assert payload["catalog"]["cve_id"] == HISTORICAL_CVE
        assert payload["counts"]["fields"] == len(FIELD_SPEC)
        assert "compliant" not in json.dumps(payload).lower()
        assert "compliance" not in json.dumps(payload).lower()

    def test_escapes_pipes_in_table_cells(self):
        draft = _historical_draft(CustomerContext(manufacturer_name="A | B"))
        row = next(
            line
            for line in to_markdown(draft).splitlines()
            if "Manufacturer name" in line
        )
        assert "A \\| B" in row


class TestCli:
    def test_writes_both_artifacts(self, tmp_path: Path):
        code = run(
            [
                "--kev",
                str(FIXTURE),
                "--cve",
                HISTORICAL_CVE,
                "--output-dir",
                str(tmp_path),
            ]
        )
        assert code == 0
        markdown = (tmp_path / "article14-draft.md").read_text(encoding="utf-8")
        payload = json.loads((tmp_path / "article14-draft.json").read_text(encoding="utf-8"))
        assert HISTORICAL_CVE in markdown
        assert payload["catalog"]["cve_id"] == HISTORICAL_CVE

    def test_missing_catalog_is_a_usage_error(self, tmp_path: Path):
        assert run(["--kev", str(tmp_path / "gone.json")]) == 2


class TestCommittedSample:
    def test_sample_matches_the_renderer(self):
        expected = to_markdown(_historical_draft())
        assert SAMPLE.is_file(), "generate the sample with render_article14_sample.py"
        assert SAMPLE.read_text(encoding="utf-8") == expected
