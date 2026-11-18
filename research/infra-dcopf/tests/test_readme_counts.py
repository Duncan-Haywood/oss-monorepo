"""README counts quoted from experiments/results_pglib.txt.

Quality census 2026-11-15: the README said the slack ran past its P limit in
"6 of 11 API cases" while the table shows 8; this fails if they drift again.
"""
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parents[1]


def dc_mp_api_rows():
    text = (ROOT / "experiments" / "results_pglib.txt").read_text()
    block = text.split("DC-MP (MATPOWER", 1)[1].split("\n\n", 1)[0]
    rows = []
    for line in block.splitlines()[2:]:
        cols = line.split()
        if len(cols) >= 15 and cols[1] == "api":
            rows.append(dict(case=cols[0], recall=cols[4], slack=float(cols[12])))
    return rows


def test_slack_over_limit_count_matches_table():
    rows = dc_mp_api_rows()
    assert len(rows) == 11
    over = sum(r["slack"] > 0 for r in rows)
    readme = (ROOT / "README.md").read_text()
    assert f"P limit in {over} of 11 API cases" in readme


def test_recall_range_matches_table():
    recalls = [float(r["recall"]) for r in dc_mp_api_rows() if r["recall"] != "nan"]
    lo, hi = round(min(recalls) * 100), round(max(recalls) * 100)
    assert f"({lo} to {hi} %)" in (ROOT / "README.md").read_text()
