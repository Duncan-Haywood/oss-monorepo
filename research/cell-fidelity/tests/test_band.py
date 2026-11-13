import importlib.util
from pathlib import Path

HERE = Path(__file__).resolve().parents[1] / "experiments" / "band"
spec = importlib.util.spec_from_file_location("band_run", HERE / "run.py")
run = importlib.util.module_from_spec(spec)
spec.loader.exec_module(run)


def _row(score, dfn, r=0.5, kind="ok"):
    return dict(kind=kind, score=score, r=r, dfn=dfn, v0kind=kind, v0r=r, t_spme=1.0, t_v0=1.0, t_dfn=10.0, j=0)


def test_sound_needs_positive_score_and_r_above_flag():
    assert run.sound(_row(90, 100, r=0.5))
    assert not run.sound(_row(90, 100, r=0.1))
    assert not run.sound(_row(0, 100, r=None, kind="fail"))


def test_band_factor_is_median_ratio_of_verified_sound_floored_at_one():
    rows = [_row(80, 100), _row(50, 100), _row(100, 90), _row(10, 100, r=0.05)]
    assert run.band_factor(rows, {0, 1, 2}) == 100 / 80
    assert run.band_factor(rows, {2}) == 1.0          # SPMe over-scores: floor
    assert run.band_factor(rows, {3}) == 1.0          # none sound


def test_band_keeps_verifying_where_spme_under_scores():
    # verified: design 0 (DFN 100, SPMe 80, ratio 1.25). Design 1 SPMe 85 looks worse than 100 to the iterate step,
    # but 85 * 1.25 >= 100, so the band verifies it and finds DFN 110.
    rows = [_row(80, 100), _row(85, 110), _row(50, 60)]
    p, ver = run.band_answer(rows, [0])
    assert p == 1 and ver == {0, 1}
    ip, _ = run.G.iterate_answer(rows, [0])
    assert ip == 0


def test_band_stops_when_no_score_can_reach_the_verified_best():
    rows = [_row(100, 100), _row(70, 70), _row(60, 61)]
    p, ver = run.band_answer(rows, [0])
    assert p == 0 and ver == {0}


def test_verdicts_h58_untestable_without_under_scoring():
    c = dict(set="Chen2020", rate=0.5, pool_ratio=1.02, iter_gap=0.0, band_gap=0.0, t_band=1.0, t_all=2.0, n_bad=0,
             recall=None, suspect_share=0.1)
    v = run.verdicts({"Chen2020@0.5x": c})
    assert v["H58"] == "untestable" and v["H56"] == "supported" and v["H57"] == "supported"
