"""Tests for milestone 1 (experiments/m1_blame). Run: python3 -m pytest research/agent-defects/tests"""
import math
import sys
from datetime import datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "experiments" / "m1_blame"))

import analyse  # noqa: E402
import extract  # noqa: E402


def test_parse_where_takes_path_and_first_line():
    assert extract.parse_where("ventures/x/calc.mjs:102") == ("ventures/x/calc.mjs", 102)
    assert extract.parse_where("research/a/src/m.py:40-55 and tests") == ("research/a/src/m.py", 40)
    assert extract.parse_where("research/a/README.md Reproduce") is None
    assert extract.parse_where("calc.mjs:12") is None  # no directory: not a repository path
    assert extract.parse_where("") is None


def test_controls_avoid_defects_and_blanks_and_are_seeded():
    blank = {5, 6, 7}
    picks = extract.pick_controls(100, blank, [50], "a|b")
    assert picks == extract.pick_controls(100, blank, [50], "a|b")
    assert len(picks) == 3
    assert all(abs(p - 50) >= 10 and p not in blank and 1 <= p <= 100 for p in picks)
    assert extract.pick_controls(12, set(), [6], "s") == []  # nothing 10 lines away


def test_mantel_haenszel_single_stratum_is_woolf():
    o, lo, hi = analyse.mantel_haenszel([(10, 20, 5, 40)])
    assert math.isclose(o, 4.0)
    se = math.sqrt(1 / 10 + 1 / 20 + 1 / 5 + 1 / 40)
    assert math.isclose(lo, math.exp(math.log(4) - 1.96 * se), rel_tol=1e-9)
    assert math.isclose(hi, math.exp(math.log(4) + 1.96 * se), rel_tol=1e-9)


def test_mantel_haenszel_concordant_strata_carry_no_information():
    base = analyse.mantel_haenszel([(10, 20, 5, 40)])
    # A stratum where every line is exposed adds nothing to R or S.
    assert math.isclose(analyse.mantel_haenszel([(10, 20, 5, 40), (3, 0, 4, 0)])[0], base[0])


def _pr(n, day, subject, refs=(), files=(), n_files=None):
    return {"pr": n, "merged": datetime(2026, 11, 1) + timedelta(days=day), "subject": subject,
            "refs": set(refs), "files": list(files), "n_files": n_files if n_files is not None else len(files)}


def test_exposures_respect_window_and_audit_date():
    prs = {p["pr"]: p for p in [
        _pr(1, 0, "add calc", files=["a.mjs"]),
        _pr(2, 3, "calc: fix rounding (lands #1)", refs=[1], files=["a.mjs"]),
        _pr(3, 20, "fix calc again", refs=[1], files=["a.mjs"]),
        _pr(4, 1, "docs", files=["b.md"], n_files=40),
    ]}
    h = analyse.History(prs)
    e = h.exposures(1, "a.mjs", datetime(2026, 12, 1))
    assert e["named_fix"] and e["named_any"] and e["fix_touch"] and not e["reverted"]
    # An audit on day 2 sees nothing from PR 2 (merged day 3).
    e = h.exposures(1, "a.mjs", datetime(2026, 11, 3))
    assert not e["named_any"] and not e["fix_touch"]
    assert math.isclose(e["window_days"], 2.0)
    assert h.exposures(4, "b.md", datetime(2026, 12, 1))["big"]
    assert h.exposures(99, "a.mjs", datetime(2026, 12, 1)) is None


def test_revert_is_matched_by_subject():
    prs = {p["pr"]: p for p in [_pr(1, 0, "add widget (#1)"), _pr(2, 1, 'Revert "add widget (#1)" (#2)')]}
    assert analyse.History(prs).exposures(1, "x", datetime(2026, 12, 1))["reverted"]


def test_wilson_interval_brackets_the_rate():
    lo, hi = analyse.wilson(14, 92)
    assert lo < 14 / 92 < hi and 0 < lo and hi < 1
