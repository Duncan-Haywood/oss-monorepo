"""The whitepaper's plain-averaging ratio is read off experiments/results.txt (E4).

Quality census 2026-11-15 found the paper quoting 1.7-5.7x at kappa=1e4 while
its own E4 table gave 2.3-16.5x; this test fails if the two drift apart again.
"""
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parents[1]


def e4_rows():
    text = (ROOT / "experiments" / "results.txt").read_text()
    block = text.split("E4 optimal sync interval", 1)[1]
    rows = []
    for line in block.splitlines()[2:]:
        m = re.match(r"\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+x\s*[\d.]+\s*\|\s*(\d+)\s+(\d+)", line)
        if not m:
            break
        rows.append(tuple(int(g) for g in m.groups()))
    return rows


def test_plain_averaging_ratio_quoted_in_paper_matches_e4():
    rows = e4_rows()
    assert len(rows) == 6
    paper = (ROOT / "paper" / "whitepaper.md").read_text()
    for kappa in (1000, 10000):
        ratios = [plain / mom for k, _c, _h, mom, _t1, _hp, plain in rows if k == kappa]
        lo, hi = min(ratios), max(ratios)
        quoted = f"{lo:.1f}–{hi:.1f}×"
        assert quoted in paper, f"kappa={kappa}: E4 gives {quoted}, not quoted in whitepaper"
