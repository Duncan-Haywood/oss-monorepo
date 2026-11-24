"""Tests for transition.py: the licence track and paid model of each venture."""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import transition as t  # noqa: E402


def make(tmp_path, slug, files, desc="A tool."):
    v = tmp_path / slug
    v.mkdir()
    (v / "VENTURE.yaml").write_text(f"name: {slug}\ndescription: >-\n  {desc}\nstage: prototype\n")
    for name, body in files.items():
        p = v / name
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(body)
    return v


def code(n):
    return "x\n" * n


def test_small_tool_is_lead_magnet(tmp_path):
    v = make(tmp_path, "tip-calculator", {"engine.mjs": code(300)})
    assert t.classify("tip-calculator", v, [], [])["track"] == "mit-lead-magnet"


def test_deep_calculator_stays_lead_magnet(tmp_path):
    v = make(tmp_path, "fee-calculator", {"engine.mjs": code(t.DEPTH_PRODUCT + 10)})
    assert t.classify("fee-calculator", v, [], [])["track"] == "mit-lead-magnet"


def test_deep_product_goes_proprietary_one_off(tmp_path):
    v = make(tmp_path, "studio", {"engine.mjs": code(t.DEPTH_PRODUCT + 10)})
    r = t.classify("studio", v, [], [])
    assert r["track"] == "proprietary"
    assert r["model"] == "one-off"


def test_tests_and_fixtures_do_not_count_as_depth(tmp_path):
    v = make(
        tmp_path,
        "studio",
        {"engine.test.mjs": code(9000), "fixtures/big.mjs": code(9000), "engine.mjs": code(10)},
    )
    assert t.source_lines(v) == 10


def test_server_part_means_subscription(tmp_path):
    v = make(tmp_path, "hub", {"server.mjs": code(10), "engine.mjs": code(t.DEPTH_PRODUCT)})
    r = t.classify("hub", v, [], [])
    assert r["model"] == "subscription"


def test_browser_web_worker_is_not_a_server(tmp_path):
    v = make(tmp_path, "cad", {"gallery-worker.mjs": code(10), "engine.mjs": code(t.DEPTH_PRODUCT)})
    assert t.classify("cad", v, [], [])["model"] == "one-off"


def test_ai_description_means_subscription(tmp_path):
    v = make(tmp_path, "lens", {"engine.mjs": code(t.DEPTH_PRODUCT)}, desc="AI-first photo app.")
    assert t.classify("lens", v, [], [])["model"] == "subscription"


def test_flagship_is_proprietary_whatever_its_size(tmp_path):
    v = make(tmp_path, "tiny", {"engine.mjs": code(5)})
    r = t.classify("tiny", v, ["tiny"], [])
    assert r["track"] == "proprietary"
    assert "flagship #1" in r["why"]


def test_open_projects_stay_commons(tmp_path):
    v = make(tmp_path, "open-mower", {"engine.mjs": code(t.DEPTH_PRODUCT * 2)})
    assert t.classify("open-mower", v, ["open-mower"], [])["track"] == "mit-commons"


def test_override_wins(tmp_path):
    v = make(tmp_path, "sales-agent", {"engine.mjs": code(t.DEPTH_PRODUCT * 2)})
    assert t.classify("sales-agent", v, ["sales-agent"], [])["track"] == "mit-deployer-run"


def test_nested_licences_are_listed(tmp_path, monkeypatch):
    monkeypatch.setattr(t, "ROOT", tmp_path)
    v = make(tmp_path, "studio", {"LICENSE": "MIT", "vendor/lib/LICENSE-lib": "GPL", "a.mjs": "x"})
    assert t.nested_licences(v) == ["studio/vendor/lib/LICENSE-lib"]


def test_committed_json_is_current():
    data = t.build()
    assert json.loads(t.OUT.read_text()) == data, "run transition.py --write"
    assert data["counts"]["proprietary"] == len(data["proprietary"])
    assert [r["move_order"] for r in data["proprietary"]] == list(range(1, len(data["proprietary"]) + 1))


def test_licence_named_source_is_not_a_licence_file(tmp_path, monkeypatch):
    monkeypatch.setattr(t, "ROOT", tmp_path)
    v = make(tmp_path, "studio", {"lib/licence.mjs": "x", "lib/LICENSE": "MIT"})
    assert t.nested_licences(v) == ["studio/lib/LICENSE"]


def test_moved_products_are_marked():
    data = t.build()
    moved = {r["venture"]: r["moved"] for r in data["proprietary"] if r["moved"]}
    assert set(moved) == set(t.MOVED)
