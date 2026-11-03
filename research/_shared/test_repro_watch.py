import datetime as dt
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import repro_watch as rw  # noqa: E402


def test_week_seed_rotates():
    assert rw.week_seed(dt.date(2026, 11, 3)) == 202645
    assert rw.week_seed(dt.date(2026, 11, 10)) == 202646


def test_pick_puts_recent_first_and_dedupes(monkeypatch):
    monkeypatch.setattr(rw, "candidates", lambda d: ["a", "b", "c", "d", "e"])
    monkeypatch.setattr(rw, "changed_projects", lambda days, pool: ["c", "zz"][:1])
    recent, rest = rw.pick(3, 1, 7, 8)
    assert recent == ["c"] and "c" not in rest and len(rest) == 3
    recent, rest = rw.pick(3, 1, 0, 8)
    assert recent == []


def test_render_and_exit_code(monkeypatch, tmp_path, capsys):
    monkeypatch.setattr(rw, "pick", lambda n, seed, d, m: (["p1"], ["p2", "p3"]))
    status = {"p1": "identical", "p2": "differs", "p3": "tool-missing"}
    monkeypatch.setattr(rw, "run_project", lambda r, s, t: {"slug": s, "track": "x", "status": status[s],
                                                            "diff_lines": 2 * (s == "p2"), "seconds": 1.0,
                                                            "error": "no yosys" if s == "p3" else ""})
    monkeypatch.setattr(rw, "readme_traceability", lambda r, s: None)
    assert rw.main(["--seed", "5", "--out", str(tmp_path)]) == 1
    md = (tmp_path / "repro-watch.md").read_text()
    assert md.index("p2") < md.index("p1")  # failures listed first
    assert "| p1 | identical | 0 | 1.0 | changed |" in md
    status["p2"] = "crashed"
    assert rw.main(["--seed", "5"]) == 0
    assert rw.main(["--seed", "5", "--strict"]) == 1
