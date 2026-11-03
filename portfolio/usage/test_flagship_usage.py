import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import flagship_usage as fu  # noqa: E402

VISITS = {"days": {
    "2026-10-01": {"old-tool": 50},
    "2026-11-01": {"flag-a": 2, "shed": 3, "about": 9, "botpage:flag-b": 1, "geo:US": 5, "noise": 1},
    "2026-11-02": {"shed": 4, "dev:desktop": 4},
}}


def test_summary_window_and_split():
    s = fu.summarise(VISITS, ["flag-a", "flag-b"], {"flag-a", "flag-b", "shed", "noise", "old-tool"},
                     days=14, today="2026-11-02")
    assert s["window"] == ["2026-10-20", "2026-11-02"]
    a, b = s["flagships"]
    assert (a["loads"], a["days_seen"], a["crawled"]) == (2, 1, False)
    assert (b["loads"], b["crawled"]) == (0, True)
    assert [o["venture"] for o in s["top_non_flagship_tools"]] == ["shed", "noise"]  # site pages, prefixes, old days excluded
    assert s["tool_loads"] == 10 and s["flagship_loads"] == 2
    text = fu.render(s, "test")
    assert "Pulling more loads than every flagship: shed." in text  # 'noise' (1 load, 1 day) is not called out


def test_flagships_parses_file(tmp_path):
    f = tmp_path / "f.yaml"
    f.write_text("flagships:\n  # c\n  - venture: one\n    why: x\n  - venture: two-b\n")
    assert fu.flagships(f) == ["one", "two-b"]
    assert fu.flagships()[0]  # the real file still parses
