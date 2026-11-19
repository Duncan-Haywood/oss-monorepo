"""Milestone 3t: pooling windows that carry a causal prior (experiments/m3t_poolprior)."""
import importlib.util, os
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
_s = importlib.util.spec_from_file_location("m3t_an", os.path.join(HERE, "..", "experiments", "m3t_poolprior", "analyse.py"))
an = importlib.util.module_from_spec(_s)
_s.loader.exec_module(an)


def test_hk_equals_dl_when_the_windows_agree_exactly_with_their_weights():
    # Equal f: q = 0, so the HKSJ sd is 0 while DL keeps 1/sqrt(sum w); with k = 1 both fall back to DL.
    mu, sd = an.hk_pool([500.0, 500.0, 500.0], [2.0, 2.0, 2.0])
    assert mu == 500.0 and sd == 0.0
    mu1, sd1 = an.hk_pool([510.0], [3.0])
    assert mu1 == 510.0 and abs(sd1 - 3.0) < 1e-12


def test_hk_is_honest_on_heterogeneous_draws_where_ivw_is_not():
    rng = np.random.default_rng(1)
    zi, zh = [], []
    for _ in range(2000):
        sd = np.full(5, 1.0)
        f = 500 + rng.normal(0, 4.0, 5) + rng.normal(0, sd)     # between-window spread 4x the stated sd
        mi, si = an.ivw_pool(f, sd)
        mh, sh = an.hk_pool(f, sd)
        zi.append((mi - 500) / si); zh.append((mh - 500) / sh)
    assert np.sqrt(np.mean(np.square(zi))) > 3
    # HKSJ with k = 5 follows a t(4) roughly: rms z near sqrt(4/2) = 1.41
    assert 1.1 < np.sqrt(np.mean(np.square(zh))) < 1.7


def test_blocks_skip_unconverged_and_keep_order():
    rows = [{"seq": "s", "unit": "u", "window": i, "rank": i,
             "est": {"f": 500.0 + i, "sd_rel": 0.01}} for i in range(6)]
    del rows[2]["est"]
    b = an.blocks(rows, "est", 3, {"board": {"u": 500.0}})
    assert [x["start"] for x in b] == [3]
    b1 = an.blocks(rows, "est", 1, {"board": {"u": 500.0}})
    assert [x["start"] for x in b1] == [0, 1, 3, 4, 5]
