import numpy as np
from sensing_mixgate import MIXES, mixed_mismatch
from sensing_mixgate.mix import gate
from sensing_baoutlier.outlier import make_object, orbit_cameras, project, visible


def _rig():
    pts, nrm = make_object(200, seed=0)
    cams = orbit_cameras(12, 360.0)
    vis = np.array([visible(c, pts, nrm) for c in cams])
    return pts, cams, vis, np.array([project(c, pts) for c in cams])


def test_mixes_are_distributions():
    for rate, a, n, f in MIXES.values():
        assert 0 < rate < 1 and abs(a + n + f - 1) < 0.01


def test_mixed_mismatch_hits_rate_and_only_visible():
    pts, cams, vis, clean = _rig()
    out, mask = mixed_mismatch((0.4, 0.3, 0.3), clean, vis, 0.2, np.random.default_rng(0), cams, pts)
    assert not mask[~vis].any() and 0.15 < mask.sum() / vis.sum() < 0.25
    assert (out[~mask] == clean[~mask]).all() and (out[mask] != clean[mask]).any()


def test_shares_control_the_kind_of_displacement():
    pts, cams, vis, clean = _rig()
    for shares, lo, hi in [((0, 1, 0), 9.99, 40.01), ((1, 0, 0), 9.99, 40.01)]:
        out, mask = mixed_mismatch(shares, clean, vis, 0.2, np.random.default_rng(1), cams, pts)
        d = np.linalg.norm(out[mask] - clean[mask], axis=1)
        assert d.min() >= lo and d.max() <= hi
    out, mask = mixed_mismatch((0, 0, 1), clean, vis, 0.2, np.random.default_rng(1), cams, pts)
    assert np.linalg.norm(out[mask] - clean[mask], axis=1).max() > 60


def test_run_mixed_restores_gate_and_scores():
    from sensing_mixgate import run_mixed
    orig = gate.mismatch
    r = run_mixed("0.7", seed=0, n_feat=80, max_nfev=30)
    assert gate.mismatch is orig and r["recall"] >= 0 and np.isfinite(r["g_cauchy"])


def test_headline_quotes_the_24_seed_medians():
    # Quality audit 2026-11-19: the headline quoted 6-seed means that the 24-seed rerun overturned.
    import pathlib, re
    root = pathlib.Path(__file__).resolve().parents[1]
    readme = (root / "README.md").read_text()
    seeds = (root / "experiments" / "results_seeds.txt").read_text()
    table_a = seeds.split("== A")[1].split("== B")[0]
    head = readme[readme.index("**Headline"):].split("**", 2)[1]
    for ratio in ("0.8", "0.7", "0.6", "0.9"):
        row = next(l for l in table_a.splitlines() if l.startswith(ratio + " "))
        cells = row.split("|")
        ri, g = cells[2].split()[0], cells[3].split()[0]
        for v in (ri, g):
            x = float(v)
            assert f"{x:.4f}" in head or f"{x:.3f}" in head, (ratio, v)
    assert "0.0207" not in head and "0.130" not in head
