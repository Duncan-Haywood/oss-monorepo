import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from swe_orgs.catalogue import read_csv, validate, failure_shares, score, wilson  # noqa: E402


def test_catalogue_validates():
    assert validate(read_csv("practices.csv"), read_csv("sources.csv")) == []


def test_every_source_is_used_or_justified():
    used = {p["source"] for p in read_csv("practices.csv")}
    assert {s["id"] for s in read_csv("sources.csv")} == used


def test_validate_catches_bad_rows():
    p = read_csv("practices.csv")
    p[0] = {**p[0], "source": "S99", "transfer": "maybe"}
    assert len(validate(p, read_csv("sources.csv"))) == 2


def test_failure_shares_and_score_order():
    rows = [{"errors": ["slug collision with a parallel run"]}, {"errors": []}, {"errors": ["stale branch left alone"]}, {}]
    sh = failure_shares(rows)
    assert sh["coordination"] == (1, 4) and sh["unlanded"] == (1, 4)
    prac = [{"id": "a", "failure_mode": "coordination", "transfer": "no"},
            {"id": "b", "failure_mode": "coordination", "transfer": "yes"}]
    assert [r["id"] for r in score(prac, sh)] == ["b", "a"]


def test_wilson_bounds():
    lo, hi = wilson(5, 100)
    assert 0.02 < lo < 0.05 < hi < 0.12 and wilson(0, 0) == (0.0, 1.0)


def test_error_texts_accepts_strings_and_dicts():
    from swe_orgs.catalogue import error_texts
    row = {"errors": ["timed out", {"what": "stray line", "fixed": True}]}
    assert error_texts(row) == ["timed out", "stray line True"]
    assert error_texts({}) == [] and error_texts({"errors": None}) == []


def test_load_ledger_reads_a_directory_and_a_jsonl_file(tmp_path):
    from swe_orgs.catalogue import load_ledger
    (tmp_path / "a.json").write_text('{"errors": ["x"]}')
    (tmp_path / "b.json").write_text('{"errors": []}')
    assert len(load_ledger(tmp_path)) == 2
    f = tmp_path / "l.jsonl"
    f.write_text('{"errors": []}\n\n{"errors": ["y"]}\n')
    assert len(load_ledger(f)) == 2
