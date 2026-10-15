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
