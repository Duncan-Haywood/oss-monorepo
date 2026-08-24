import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parents[1] / "src"))
from mcp_watch import compare, load


def test_fixture_reports_removed_and_instruction_changes():
    before = load(str(Path(__file__).parents[1] / "examples/before.json"))
    after = load(str(Path(__file__).parents[1] / "examples/after.json"))
    report = compare(before, after)
    assert [item["kind"] for item in report["changes"]] == ["description_changed", "tool_added"]
    assert report["changes"][0]["bucket"] == "instruction-bearing"


def test_duplicate_names_are_rejected(tmp_path):
    path = tmp_path / "duplicate.json"
    path.write_text(json.dumps({"tools": [{"name": "x"}, {"name": "x"}]}))
    try:
        load(str(path))
    except ValueError as error:
        assert "duplicate" in str(error)
    else:
        raise AssertionError("duplicate names should fail")
