"""Tests that need no download: geometry, the envelope detector on a synthetic fault, and that each
split keeps what it claims to keep apart. Run: python3 -m pytest research/cwru-split-audit -q"""
import numpy as np
import pytest

import data

audit = pytest.importorskip("audit")  # needs numpy, scipy, scikit-learn


def test_defect_multiples_match_cwru_site():
    got = data.defect_multiples()
    for k, v in data.SITE_MULTIPLES.items():
        assert got[k] == pytest.approx(v, rel=2e-4)


def test_manifest_shape():
    assert len(data.RECORDINGS) == 40
    assert len({r["n"] for r in data.RECORDINGS}) == 40
    assert set(data.SHA256) == {str(r["n"]) for r in data.RECORDINGS}
    labels = {r["label10"] for r in data.RECORDINGS}
    assert len(labels) == 10


def _impulse_train(f_defect, fs=12000, seconds=1.0, res=3000.0, seed=0):
    rng = np.random.default_rng(seed)
    n = int(fs * seconds)
    t = np.arange(n) / fs
    x = 0.05 * rng.standard_normal(n)
    ring = np.exp(-800 * t[:200]) * np.sin(2 * np.pi * res * t[:200])
    for t0 in np.arange(0.01, seconds - 0.02, 1 / f_defect):
        i = int(t0 * fs)
        x[i:i + 200] += ring
    return x


def test_envelope_features_pick_out_outer_race():
    rpm = 1797.0
    f_bpfo = data.SITE_MULTIPLES["bpfo"] * rpm / 60
    w = audit.windows(_impulse_train(f_bpfo))[:4]
    F = audit.envelope_features(w, rpm)
    # columns 0-2 BPFI, 3-5 BPFO, 6-8 2xBSF; BPFO fundamental must beat both other fundamentals
    assert (F[:, 3] > F[:, 0] + 1).all() and (F[:, 3] > F[:, 6] + 1).all()


def test_windows_overlap():
    w = audit.windows(np.arange(5000.0))
    assert w.shape == (1 + (5000 - audit.WIN) // audit.HOP, audit.WIN)
    assert w[1, 0] == audit.HOP


def _meta():
    rec, t, nwin = [], [], []
    for i, r in enumerate(data.RECORDINGS):
        for k in range(20):
            rec.append(i); t.append(k); nwin.append(20)
    rec = np.array(rec)
    R = data.RECORDINGS
    return dict(rec=rec, t=np.array(t), nwin=np.array(nwin),
                y10=np.array([R[i]["label10"] for i in rec]), y4=np.array([R[i]["location"] for i in rec]),
                load=np.array([R[i]["load"] for i in rec]), size=np.array([R[i]["size"] for i in rec]))


def test_time_split_has_gap():
    M = _meta()
    (tr, te, _), = audit.split_time(M)
    assert not (tr & te).any()
    for i in np.unique(M["rec"]):
        m = M["rec"] == i
        assert M["t"][m & tr].max() + 2 <= M["t"][m & te].min()


def test_load_split_is_recording_disjoint():
    M = _meta()
    for tr, te, _ in audit.split_load(M):
        assert not set(M["rec"][tr]) & set(M["rec"][te])


def test_size_split_is_bearing_disjoint_for_faults():
    M = _meta()
    for tr, te, key in audit.split_size(M):
        assert key == "y4"
        faulty_tr = set(M["size"][tr & (M["size"] > 0)])
        faulty_te = set(M["size"][te & (M["size"] > 0)])
        assert len(faulty_te) == 1 and not faulty_tr & faulty_te
        assert not (tr & te).any()


def test_cluster_bootstrap_brackets_accuracy():
    rng = np.random.default_rng(1)
    rec = np.repeat(np.arange(10), 30)
    ok = rng.random(300) < 0.7
    lo, hi = audit.cluster_bootstrap(ok, rec, n=500)
    assert lo <= ok.mean() <= hi
