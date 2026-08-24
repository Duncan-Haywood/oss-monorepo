import json
from pathlib import Path

import pytest

from consent_diff import build_report, load_observation


FIXTURES = Path(__file__).parent / "fixtures"


def observation(name: str) -> dict:
    return load_observation(FIXTURES / name)


def test_report_preserves_added_request_and_storage_key():
    report = build_report(observation("honest-before.json"), observation("honest-after.json"))
    assert report["status"] == "observed"
    assert {(item["category"], item["change"]) for item in report["changes"]} == {("requests", "added"), ("storage", "added")}
    assert "Not observed is not proof" in report["limitations"][1]
    assert "compliance grade" in report["limitations"][2]


def test_unchanged_early_request_has_no_false_positive():
    report = build_report(observation("early-analytics-before.json"), observation("early-analytics-after.json"))
    assert report["status"] == "observed"
    assert report["changes"] == []


def test_context_mismatch_is_unknown_not_absence():
    before = observation("honest-before.json")
    after = observation("honest-after.json")
    after["region"] = "US"
    report = build_report(before, after)
    assert report["status"] == "unknown"
    assert report["reason"] == "observation contexts differ"


def test_sequence_is_retained_without_blocking_comparison():
    report = build_report(observation("honest-before.json"), observation("honest-after.json"))
    assert report["context"]["sequence"] == "visit-after-consent"


def test_loader_rejects_incomplete_observation(tmp_path):
    path = tmp_path / "bad.json"
    path.write_text(json.dumps({"site": "missing"}), encoding="utf-8")
    with pytest.raises(ValueError, match="observation missing fields"):
        load_observation(path)
