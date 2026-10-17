import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from garment_twonodeheld import held as h

def test_splits_disjoint_and_both_directions():
    tr, bt, out = set(h.TRAIN), set(h.TEST_BETWEEN), set(h.TEST_OUTSIDE)
    assert not (tr & bt) and not (tr & out) and not (bt & out)
    assert {(m0, m1) for _, m0, m1 in h.TRAIN} == {(1.0, 2.0), (2.0, 1.0)}
    rooms = lambda s: {sc[0] for sc in s}
    assert min(rooms(bt)) > min(rooms(tr)) and max(rooms(bt)) < max(rooms(tr))
    assert all(r < min(rooms(tr)) or r > max(rooms(tr)) for r in rooms(out))

def test_band_grid_valid():
    g = h.bands()
    assert all(lo < hi for lo, hi in g) and len(set(g)) == len(g)

def test_tuned_band_no_worse_than_default_on_train():
    b, s = h.tune(h.TRAIN, h.OURS, grid=h.bands() + [h.DEFAULT_BAND])
    assert s <= h.mean_score(h.TRAIN, h.OURS, band=h.DEFAULT_BAND) + 1e-12
    assert abs(s - h.mean_score(h.TRAIN, h.OURS, band=b)) < 1e-12

def test_oracle_lower_bound_on_every_policy():
    o = h.oracle_mean(h.TEST_BETWEEN, h.OURS)
    for tau in (h.CLOSED, h.OPEN):
        assert o <= h.mean_score(h.TEST_BETWEEN, h.OURS, tau=tau) + 1e-12
    assert o <= h.mean_score(h.TEST_BETWEEN, h.OURS, band=h.DEFAULT_BAND) + 1e-12
