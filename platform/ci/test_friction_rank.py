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


def test_named_keeps_code_only():
    names = fr.named("CLAUDE.md", ["`pyenv.py` and platform/ci/wait_for.py, not LOG.md or flagships.yaml"])
    assert names == {"pyenv.py", "platform/ci/wait_for.py"}
    assert fr.named("platform/ci/run_venture_tests.py", ["slow"]) == {"platform/ci/run_venture_tests.py"}


def test_load_keeps_record_end_time(tmp_path):
    (tmp_path / "r.json").write_text(json.dumps({"date": "2026-11-13", "ended": "2026-11-13T10:00:00Z",
                                                 "doc_friction": [{"file": "a.py", "issue": "slow thing"}]}))
    assert list(fr.load(tmp_path))[0][4] == "2026-11-13T10:00:00Z"


def test_changes_drops_shallow_boundary(tmp_path):
    (tmp_path / ".git").mkdir()
    (tmp_path / ".git" / "shallow").write_text("b" * 40 + "\n")

    class Done:
        def __init__(self, out):
            self.stdout, self.returncode = out, 0

    def run(cmd, **_):
        if "log" in cmd:
            return Done("@@2026-11-13T12:00:00+00:00\t" + "a" * 40 + "\tfix pyenv\n\nplatform/ci/pyenv.py\n"
                        "@@2026-11-09T00:00:00+00:00\t" + "b" * 40 + "\tboundary\n\nplatform/ci/pyenv.py\nx.py\n")
        return Done("2026-11-09T00:00:00+00:00\n")
    commits, edge = fr.changes("2026-11-10", root=tmp_path, run=run)
    assert commits == [("2026-11-13T12:00:00+00:00", "a" * 9, "fix pyenv", ["platform/ci/pyenv.py"])]
    assert edge == "2026-11-09T00:00:00+00:00"


def test_annotate_marks_only_later_unambiguous_touches():
    commits = [("2026-11-13T12:00:00+00:00", "abc", "fix pyenv", ["platform/ci/pyenv.py"]),
               ("2026-11-13T11:00:00+00:00", "def", "figure", ["research/x/figure.py"])]
    before = {"last_at": "2026-11-13T10:00:00Z", "names": ["pyenv.py"]}
    after = {"last_at": "2026-11-13T13:00:00Z", "names": ["pyenv.py"]}
    ambiguous = {"last_at": "2026-11-13T10:00:00Z", "names": ["figure.py"]}
    fr.annotate([before, after, ambiguous], commits, counts={"pyenv.py": 1, "figure.py": 40})
    assert before["touched"][1] == "abc" and after["touched"] is None and ambiguous["touched"] is None
    assert fr.utc("2026-11-13T05:00:00-07:00") == "2026-11-13T12:00:00Z"
