import json
from pathlib import Path

import pytest

from vendor_watch.diff import build_report, load_snapshot

FIXTURES = Path(__file__).parent / "fixtures"


def snapshot(name: str) -> dict:
    return load_snapshot(FIXTURES / name)


def test_substantive_changes_are_flagged_despite_reorder_and_whitespace():
    report = build_report(snapshot("substantive-before.json"), snapshot("substantive-after.json"))
    assert report["status"] == "observed"
    changed = {c["heading"]: c for c in report["changes"]}
    assert set(changed) == {"Subprocessor list", "Notification"}
    assert changed["Subprocessor list"]["change"] == "changed"
    assert "OpenAI" in changed["Subprocessor list"]["after"]
    assert changed["Notification"]["change"] == "changed"
    assert "Introduction" not in changed
    assert report["source_url"] == "https://acmesaas.test/legal/subprocessors"


def test_reorder_and_whitespace_only_is_not_flagged():
    report = build_report(snapshot("reorder-only-before.json"), snapshot("reorder-only-after.json"))
    assert report["status"] == "observed"
    assert report["changes"] == []


def test_added_and_removed_sections_are_flagged():
    before = snapshot("substantive-before.json")
    after = json.loads(json.dumps(before))  # deep copy
    after["sections"] = after["sections"][1:] + [{"heading": "New clause", "text": "Something new."}]
    report = build_report(before, after)
    by_change = {c["change"] for c in report["changes"]}
    assert "removed" in by_change
    assert "added" in by_change


def test_fetch_failure_is_inconclusive_not_unchanged():
    report = build_report(snapshot("fetch-failed-before.json"), snapshot("fetch-failed-after.json"))
    assert report["status"] == "inconclusive"
    assert "rate_limited" in report["reason"]
    assert "changes" not in report


def test_context_mismatch_is_unknown_not_no_change():
    before = snapshot("substantive-before.json")
    after = snapshot("context-mismatch-after.json")
    report = build_report(before, after)
    assert report["status"] == "unknown"
    assert report["reason"] == "snapshot contexts differ"


def test_report_carries_not_legal_advice_boundary():
    report = build_report(snapshot("substantive-before.json"), snapshot("substantive-after.json"))
    assert any("not legal advice" in limitation for limitation in report["limitations"])
    assert any("proof the page never changed" in limitation for limitation in report["limitations"])


def test_loader_rejects_incomplete_snapshot(tmp_path):
    path = tmp_path / "bad.json"
    path.write_text(json.dumps({"vendor": "AcmeSaaS"}), encoding="utf-8")
    with pytest.raises(ValueError, match="snapshot missing fields"):
        load_snapshot(path)
