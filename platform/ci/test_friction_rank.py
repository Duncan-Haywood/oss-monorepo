import datetime as dt
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import friction_rank as fr  # noqa: E402


def write(tmp, name, date, items):
    (tmp / name).write_text(json.dumps({"date": date, "session": name, "doc_friction": items}))


def test_norm_file():
    assert fr.norm_file("prompts/polish/reports (2026-10-30-x)") == "prompts/polish/reports"
    assert fr.norm_file("a/README.md and b/README.md") == "a/README.md"
    assert fr.norm_file("`prompt.md:12`") == "prompt.md"
    assert fr.norm_file("") == "(unknown)"


def test_same_problem_clusters_and_counts_sessions(tmp_path):
    write(tmp_path, "r1.json", "2026-11-01", [{"file": "prompt.md", "issue": "step 0 fetch origin security-alerts branch does not exist"}])
    write(tmp_path, "r2.json", "2026-11-02", [{"file": "prompt.md", "issue": "security-alerts branch does not exist so the fetch fails"}])
    write(tmp_path, "r3.json", "2026-11-02", [{"file": "prompt.md", "issue": "router picked review though a review PR is open"},
                                             {"file": "other.md", "issue": "security-alerts branch does not exist"}])
    out = fr.rank(fr.load(tmp_path), min_sessions=1)
    top = out[0]
    assert top["file"] == "prompt.md" and top["sessions"] == 2
    assert (top["first"], top["last"]) == ("2026-11-01", "2026-11-02")
    assert len(out) == 3  # other file never merges in


def test_window_none_entries_and_bad_records(tmp_path):
    write(tmp_path, "old.json", "2026-09-01", [{"file": "a.md", "issue": "old thing broke here"}])
    write(tmp_path, "new.json", "2026-11-02", [{"file": "a.md", "issue": "none significant"}])
    (tmp_path / "bad.json").write_text("{not json")
    (tmp_path / "list.json").write_text("[]")
    assert fr.rank(fr.load(tmp_path), days=7, today=dt.date(2026, 11, 3), min_sessions=1) == []
    assert len(fr.rank(fr.load(tmp_path), min_sessions=1)) == 1


def test_main_json(tmp_path, capsys):
    write(tmp_path, "r1.json", "2026-11-01", [{"file": "x.md", "issue": "flag is easy to skip"}])
    write(tmp_path, "r2.json", "2026-11-01", [{"file": "x.md", "issue": "the flag is easy to skip again"}])
    assert fr.main(["--runs", str(tmp_path), "--days", "0", "--json"]) == 0
    assert json.loads(capsys.readouterr().out)[0]["sessions"] == 2
