"""Tests for check_plan_limits_2026.py: stale 2025 limits on 2026 pages."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import check_plan_limits_2026 as c  # noqa: E402


def limits(text):
    return sorted({h["limit"] for h in c.scan_text(text)})


def test_flags_old_ira_figure_labelled_2026():
    hits = limits("A traditional IRA is capped at $7,000 for 2025/2026, plus a $1,000 catch-up at 50+.")
    assert hits == ["IRA age 50+ catch-up", "IRA contribution limit"]


def test_both_years_given_is_clean():
    assert limits("The IRA limit is $7,000 for 2025 and $7,500 for 2026.") == []


def test_no_2026_is_clean():
    assert limits("The 2025 HSA limit is $4,300 for self-only coverage.") == []


def test_history_wording_is_clean():
    assert limits("For 2026 the HSA self-only limit rose from $4,300.") == []


def test_hsa_stale_family_figure():
    assert limits("2026 HSA family limit: $8,550") == ["HSA family limit"]


def test_figure_inside_a_larger_number_is_not_matched():
    assert limits("2026 IRA: rollover of $17,000 or $7,000.50 in fees") == []


def test_code_constants_and_underscores():
    assert limits("// 2026 401(k) deferral limit\nconst x = 1;") == []
    assert limits("deferral2026: 23_500, // 401(k) 2026") == ["402(g) elective deferral (401(k), 403(b), 457, TSP)"]


def test_shared_figure_reads_as_the_other_limit():
    # $7,500 is the stale 401(k) catch-up but also the 2026 IRA limit.
    assert limits("The 2026 IRA limit is $7,500, with a $1,100 catch-up at 50+.") == []


def test_ok_marker_skips_line():
    assert limits("2026 IRA cap $7,000 (2025 rule quoted) plan-limits: ok") == []


def test_sentences_split():
    text = "The 2026 IRA limit is $7,500. Back in 2019 the 401(k) cap was lower, $19,000."
    assert limits(text) == []


def test_repository_ventures_are_clean():
    assert c.main([str(c.ROOT / "ventures"), "--strict"]) == 0


def test_empty_root_refuses(tmp_path):
    assert c.main([str(tmp_path)]) == 2
