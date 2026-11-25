import datetime as dt
import json
import sys
from pathlib import Path

import pytest

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


def test_main_json(tmp_path, capsys, monkeypatch):
    # The default path (git and the open-PR read on) with this checkout's git and
    # GitHub swapped out. Unstubbed, it ran `git fetch --shallow-since` on the real
    # clone and read api.github.com three times: 7 s alone, 78 s inside the
    # ventures-tests pool (docs/history/ci-perf-2026-11-20-unwired-orphans-and-fetch.md).
    monkeypatch.setattr(fr, "revs", lambda: ["HEAD"])
    monkeypatch.setattr(fr, "basename_counts", lambda: {})
    monkeypatch.setattr(fr, "changes", lambda since, rev: ([], None))
    monkeypatch.setattr(fr, "deepen", lambda since: pytest.fail("no edge, so no fetch"))
    monkeypatch.setattr(fr, "open_prs", lambda: [(1, "x.md: the flag")])
    write(tmp_path, "r1.json", "2026-11-01", [{"file": "x.md", "issue": "flag is easy to skip"}])
    write(tmp_path, "r2.json", "2026-11-01", [{"file": "x.md", "issue": "the flag is easy to skip again"}])
    assert fr.main(["--runs", str(tmp_path), "--days", "0", "--json"]) == 0
    row = json.loads(capsys.readouterr().out)[0]
    assert row["sessions"] == 2 and row["prs"] == []  # read (not None), "x" too short to claim


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


class _Done:
    def __init__(self, out="", code=0, err=""):
        self.stdout, self.returncode, self.stderr = out, code, err


def test_revs_adds_origin_main_only_when_it_exists():
    assert fr.revs(run=lambda cmd, **_: _Done()) == ["HEAD", "origin/main"]
    assert fr.revs(run=lambda cmd, **_: _Done(code=1)) == ["HEAD"]


def test_changes_reads_the_union_of_revs(tmp_path):
    seen = []

    def run(cmd, **_):
        seen.append(cmd)
        return _Done()
    fr.changes("2026-11-10", ["HEAD", "origin/main"], root=tmp_path, run=run)
    assert seen[0][3:6] == ["log", "HEAD", "origin/main"]


def test_deepen_fetches_a_day_before_the_report_capped(tmp_path):
    seen = []

    def run(cmd, **kw):
        seen.append(cmd)
        return _Done()
    today = dt.date(2026, 11, 15)
    assert fr.deepen("2026-11-10T08:00:00Z", root=tmp_path, run=run, today=today)
    assert "--shallow-since=2026-11-09" in seen[-1] and seen[-1][-2:] == ["origin", "main"]
    fr.deepen("2026-01-01", root=tmp_path, run=run, today=today)  # --days 0: never the full history
    assert f"--shallow-since={today - dt.timedelta(days=fr.DEEPEN_MAX_DAYS)}" in seen[-1]
    assert fr.deepen("2026-11-10", root=tmp_path, run=lambda *a, **k: _Done(code=128), today=today) is False

    def boom(*a, **k):
        raise fr.subprocess.TimeoutExpired("git", 1)
    assert fr.deepen("2026-11-10", root=tmp_path, run=boom, today=today) is False


def test_deepen_waits_for_a_parallel_fetchs_lock_and_says_why_it_failed(tmp_path, capsys):
    (tmp_path / ".git").mkdir()
    lock = tmp_path / ".git" / "shallow.lock"
    lock.write_text("")
    seen, t = [], [0.0]

    def sleep(s):
        t[0] += s
        if t[0] >= 10:
            lock.unlink()  # the other fetch finishes after 10 s

    def run(cmd, **kw):
        seen.append(t[0])
        return _Done()
    today = dt.date(2026, 11, 17)
    assert fr.deepen("2026-11-15", root=tmp_path, run=run, today=today, sleep=sleep, clock=lambda: t[0])
    assert seen == [10.0]  # fetched only once the lock was gone

    lost = iter([_Done(code=128, err="fatal: Unable to create '.git/shallow.lock': File exists."), _Done()])
    assert fr.deepen("2026-11-15", root=tmp_path, run=lambda *a, **k: next(lost), today=today,
                     sleep=sleep, clock=lambda: t[0])  # lost the race once, retried

    lock.write_text("")
    assert not fr.deepen("2026-11-15", root=tmp_path, run=run, today=today,
                         sleep=lambda s: t.__setitem__(0, t[0] + s), clock=lambda: t[0])
    assert "held .git/shallow.lock" in capsys.readouterr().err

    gone = iter([_Done(code=128, err="fatal: unable to access: Could not resolve host")])
    lock.unlink()
    assert not fr.deepen("2026-11-15", root=tmp_path, run=lambda *a, **k: next(gone), today=today)
    assert "fetch failed: fatal: unable to access" in capsys.readouterr().err


def test_main_deepens_only_when_reports_predate_the_edge(tmp_path, monkeypatch):
    write(tmp_path, "r1.json", "2026-11-01", [{"file": "x.py", "issue": "flag is easy to skip"}])
    write(tmp_path, "r2.json", "2026-11-01", [{"file": "x.py", "issue": "the flag is easy to skip again"}])
    calls = []
    edges = iter(["2026-11-05T00:00:00+00:00", "2026-10-30T00:00:00+00:00"])
    monkeypatch.setattr(fr, "revs", lambda: ["HEAD"])
    monkeypatch.setattr(fr, "basename_counts", lambda: {})
    monkeypatch.setattr(fr, "changes", lambda since, rev: ([], next(edges)))
    monkeypatch.setattr(fr, "deepen", lambda since: calls.append(since) or True)
    assert fr.main(["--runs", str(tmp_path), "--days", "0", "--no-prs", "--json"]) == 0
    assert calls == ["2026-11-01T00:00:00Z"]
    calls.clear()
    edges = iter(["2026-11-05T00:00:00+00:00"])
    assert fr.main(["--runs", str(tmp_path), "--days", "0", "--no-prs", "--json", "--no-fetch"]) == 0
    assert calls == []


def test_annotate_marks_only_later_unambiguous_touches():
    commits = [("2026-11-13T12:00:00+00:00", "abc", "fix pyenv", ["platform/ci/pyenv.py"]),
               ("2026-11-13T11:00:00+00:00", "def", "figure", ["research/x/figure.py"])]
    before = {"last_at": "2026-11-13T10:00:00Z", "names": ["pyenv.py"]}
    after = {"last_at": "2026-11-13T13:00:00Z", "names": ["pyenv.py"]}
    ambiguous = {"last_at": "2026-11-13T10:00:00Z", "names": ["figure.py"]}
    fr.annotate([before, after, ambiguous], commits, counts={"pyenv.py": 1, "figure.py": 40})
    assert before["touched"][1] == "abc" and after["touched"] is None and ambiguous["touched"] is None
    assert fr.utc("2026-11-13T05:00:00-07:00") == "2026-11-13T12:00:00Z"


def test_codeowners_gating(tmp_path):
    co = tmp_path / "CODEOWNERS"
    co.write_text("# comment\n/CLAUDE.md @o\n**/CLAUDE.md @o\n/prompts/ @o\n/.github/ @o\n"
                  "/platform/ci/control_plane_guard.py @o\n/prompts/runs/\n")
    rules = fr.codeowner_rules(co)
    assert fr.gated("CLAUDE.md", rules) and fr.gated("research/CLAUDE.md", rules)
    assert fr.gated("prompts/process/prompt-1.md", rules) and fr.gated("prompts/promptctl.py", rules)
    assert fr.gated(".github/prompts/cloud-session.md", rules)
    assert fr.gated("platform/ci/control_plane_guard.py", rules)
    assert not fr.gated("prompts/runs/x.json", rules)  # ownerless rule after: last match wins
    assert not fr.gated("platform/ci/wait_for.py", rules)
    assert not fr.gated("research/_shared/pick_track.py", rules)
    assert not fr.gated("prompt.md", rules)  # not listed in this sample


def test_real_codeowners_gates_the_control_plane():
    rules = fr.codeowner_rules()
    assert rules, "the repository's .github/CODEOWNERS should parse"
    # Since 2026-11-24 the Markdown instructions go through the risk review, not
    # CODEOWNERS; the executable prompt tooling stays owned.
    assert fr.gated("prompts/promptctl.py", rules) and fr.gated(".github/CODEOWNERS", rules)
    assert not fr.gated("prompts/redteam/prompt-0.md", rules)
    assert not fr.gated("platform/ci/friction_rank.py", rules)
    assert not fr.gated("portfolio/flagships.yaml", rules)


def test_open_pr_claims_match_tool_stems():
    ranked = [
        {"file": "platform/ci/run_workflow_locally.py", "names": ["platform/ci/run_workflow_locally.py", "redteam.py"]},
        {"file": "prompts/perf/prompt-0.md", "names": ["run_venture_tests.py"]},
        {"file": "prompt.md", "names": []},
    ]
    prs = [(1, "process: run_workflow_locally groups a failed step's errors"),
           (2, "perf: run_venture_tests --table per-suite timings"),
           (3, "process: prompt.md step 0 handles a missing branch"),
           (4, "run_workflow_locally_extra is another tool"),
           (5, "redteam: seed faults in calc.mjs")]
    fr.claims(ranked, prs, rules=[("/prompts/", True)])
    assert ranked[0]["prs"] == [1] and ranked[0]["gated"] is False
    assert ranked[1]["prs"] == [2] and ranked[1]["gated"] is True
    assert ranked[2]["prs"] == []  # generic stems never match
    fr.claims(ranked, None)
    assert ranked[0]["prs"] is None


def test_open_prs_skips_forks_pages_and_survives_errors():
    repo = "o/r"
    new, old = "2026-11-15T00:00:00Z", "2026-11-10T00:00:00Z"
    page1 = [{"number": i, "title": f"t{i}", "created_at": new, "head": {"repo": {"full_name": "o/r"}}}
             for i in range(100)]
    page2 = [{"number": 500, "title": "fork", "created_at": new, "head": {"repo": {"full_name": "x/r"}}},
             {"number": 501, "title": "deleted fork", "created_at": new, "head": {"repo": None}},
             {"number": 502, "title": "mine", "created_at": new, "head": {"repo": {"full_name": "O/R"}}},
             {"number": 503, "title": "stalled", "created_at": old, "head": {"repo": {"full_name": "o/r"}}}]
    pages = {1: page1, 2: page2}
    now = dt.datetime(2026, 11, 15, 12, tzinfo=dt.timezone.utc)
    rows = fr.open_prs(repo, fetch=lambda url: pages[int(url.rsplit("=", 1)[1])], now=now)
    assert len(rows) == 101 and rows[-1] == (502, "mine")  # fork and 5-day-old PR dropped

    def boom(url):
        raise OSError("403")
    assert fr.open_prs(repo, fetch=boom) is None


def _verdicts(tmp, items):
    p = tmp / "v.json"
    p.write_text(json.dumps({"verdicts": items}))
    return p


def test_verdict_hides_only_matching_clusters_reported_before_it(tmp_path):
    runs = tmp_path / "runs"
    runs.mkdir()
    write(runs, "r1.json", "2026-11-10", [{"file": "a.md", "issue": "the done list is very long to scan"}])
    write(runs, "r2.json", "2026-11-11", [{"file": "a.md", "issue": "done list very long, scan takes ages"}])
    write(runs, "r3.json", "2026-11-11", [{"file": "a.md", "issue": "proxy refused the archive host outright"}])
    write(runs, "r4.json", "2026-11-11", [{"file": "a.md", "issue": "the archive host proxy refused outright again"}])
    v = _verdicts(tmp_path, [{"file": "a.md", "match": "done list", "verdict": "fixed", "by": "#1",
                              "at": "2026-11-12T00:00:00Z", "note": "moved"}])
    ranked = fr.apply_verdicts(fr.rank(fr.load(runs)), fr.load_verdicts(v))
    by = {("done" in c["example"]): c for c in ranked}
    assert by[True]["verdict"]["by"] == "#1" and by[False]["verdict"] is None


def test_report_after_verdict_reopens(tmp_path):
    runs = tmp_path / "runs"
    runs.mkdir()
    write(runs, "r1.json", "2026-11-10", [{"file": "a.md", "issue": "the done list is very long"}])
    write(runs, "r2.json", "2026-11-14", [{"file": "a.md", "issue": "the done list is very long still"}])
    v = _verdicts(tmp_path, [{"file": "a.md", "match": "done list", "verdict": "fixed", "by": "#1",
                              "at": "2026-11-12"}])
    c = fr.apply_verdicts(fr.rank(fr.load(runs)), fr.load_verdicts(v))[0]
    assert c["verdict"] is None and c["reopened"]["by"] == "#1"


def test_live_hides_settled_and_json_drops_internals(tmp_path, capsys):
    runs = tmp_path / "runs"
    runs.mkdir()
    write(runs, "r1.json", "2026-11-10", [{"file": "a.md", "issue": "the done list is very long"}])
    write(runs, "r2.json", "2026-11-11", [{"file": "a.md", "issue": "the done list is very long still"}])
    v = _verdicts(tmp_path, [{"file": "a.md", "match": "done list", "verdict": "by-design", "by": "x",
                              "at": "2026-11-12"}])
    base = ["--runs", str(runs), "--days", "0", "--no-git", "--no-prs", "--verdicts", str(v)]
    assert fr.main(base + ["--json", "--live"]) == 0
    assert json.loads(capsys.readouterr().out) == []
    assert fr.main(base + ["--json"]) == 0
    c = json.loads(capsys.readouterr().out)[0]
    assert c["verdict"]["by"] == "x" and "re" not in c["verdict"] and "issues" not in c
    assert fr.main(base + ["--live"]) == 0
    assert "settled in v.json" in capsys.readouterr().out


def test_record_verdict_refuses_a_regex_that_matches_nothing(tmp_path, capsys):
    runs = tmp_path / "runs"
    runs.mkdir()
    write(runs, "r1.json", "2026-11-10", [{"file": "a.md", "issue": "the done list is very long"}])
    v = tmp_path / "v.json"
    args = ["--runs", str(runs), "--verdicts", str(v), "--record-verdict", "a.md", "--verdict", "fixed", "--by", "#2"]
    assert fr.main(args + ["--match", "no such words"]) == 2 and not v.exists()
    assert fr.main(args + ["--match", "("]) == 2
    assert fr.main(args + ["--match", "done list", "--note", "n"]) == 0
    rec = json.loads(v.read_text())["verdicts"][0]
    assert (rec["file"], rec["verdict"], rec["by"]) == ("a.md", "fixed", "#2") and rec["at"].endswith("Z")


def test_real_verdicts_file_is_well_formed_and_each_matches_a_report():
    raw = json.loads(fr.VERDICTS.read_text())
    loaded = fr.load_verdicts()
    assert len(loaded) == len(raw["verdicts"]), "a verdict failed to load (bad regex or missing key)"
    reports = list(fr.load())
    for v in loaded:
        assert v["verdict"] in fr.VERDICT_KINDS and v.get("by")
        assert any(f == v["file"] and v["re"].search(i) for _, _, f, i, _ in reports), v["match"]


def test_fix_hints_need_a_fix_track_commit_on_the_reported_file_after_the_report():
    commits = [("2026-11-14T12:00:00+00:00", "aaa", "process: one entry per line + post", ["v/PRODUCTION.md"]),
               ("2026-11-14T11:00:00+00:00", "bbb", "v: episode 12 + post", ["v/PRODUCTION.md"]),
               ("2026-11-14T10:00:00+00:00", "ccc", "perf: faster build", ["v/build.mjs"]),
               ("2026-11-13T09:00:00+00:00", "ddd", "process: older fix", ["v/PRODUCTION.md"])]
    hit = {"file": "v/PRODUCTION.md", "last_at": "2026-11-13T10:00:00Z"}
    late = {"file": "v/PRODUCTION.md", "last_at": "2026-11-14T13:00:00Z"}
    other = {"file": "v/README.md", "last_at": "2026-11-13T10:00:00Z"}
    fr.fix_hints([hit, late, other], commits)
    assert [f[1] for f in hit["fixes"]] == ["aaa"]  # not the venture run, not the older fix
    assert late["fixes"] == [] and other["fixes"] == []


def test_live_lists_hinted_rows_after_the_others(tmp_path, capsys, monkeypatch):
    runs = tmp_path / "runs"
    runs.mkdir()
    for i, f in enumerate(["a.md", "a.md", "a.md", "b.md", "b.md"]):
        write(runs, f"r{i}.json", "2026-11-10", [{"file": f, "issue": "the done list is very long"}])
    commits = [("2026-11-12T00:00:00+00:00", "abc123", "process: shorter done list", ["a.md"])]
    monkeypatch.setattr(fr, "changes", lambda since, rev: (commits, None))
    monkeypatch.setattr(fr, "revs", lambda: ["HEAD"])
    monkeypatch.setattr(fr, "basename_counts", lambda: {})
    base = ["--runs", str(runs), "--days", "0", "--no-prs", "--no-fetch",
            "--verdicts", str(tmp_path / "none.json")]
    assert fr.main(base + ["--json"]) == 0
    assert [c["file"] for c in json.loads(capsys.readouterr().out)] == ["a.md", "b.md"]
    assert fr.main(base + ["--json", "--live"]) == 0
    out = json.loads(capsys.readouterr().out)
    assert [c["file"] for c in out] == ["b.md", "a.md"] and out[1]["fixes"][0][1] == "abc123"
    assert fr.main(base + ["--live"]) == 0
    assert "edited since by a fix commit: 2026-11-12 abc123 process: shorter done list" in capsys.readouterr().out
