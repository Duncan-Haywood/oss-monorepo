import numpy as np
import importlib.util, pathlib
from ambient_auditbudget.est import PRIOR, confusion, draw_audits, estimate_joint, estimate_goldonly


def _split():
    spec = importlib.util.spec_from_file_location("run_split", pathlib.Path(__file__).parents[1] / "experiments" / "run.py")
    src = pathlib.Path(spec.origin).read_text().split("def split")[1].split("print(")[0]
    ns = {}
    exec("def split" + src, ns)
    return ns["split"]


def test_split_spends_exactly_the_budget():
    split = _split()
    for B in (200, 1000):
        for c in (3, 10, 30):
            for f in (0.0, 0.1, 0.5, 1.0):
                G, N = split(B, c, f)
                assert G >= 0 and N >= 0 and c * G + N == B


def test_split_extremes():
    split = _split()
    assert split(200, 10, 0.0) == (0, 200)
    assert split(200, 10, 1.0) == (20, 0)


def test_draw_audits_counts():
    g, n = draw_audits(confusion(0.7), confusion(0.8), PRIOR, 40, 60, np.random.default_rng(0))
    assert g.sum() == 40 and n.sum() == 60


def test_joint_em_recovers_matrices():
    g, n = draw_audits(confusion(0.7), confusion(0.8), PRIOR, 20000, 200000, np.random.default_rng(3))
    p, C, A = estimate_joint(g, n)
    assert np.allclose(C, confusion(0.7), atol=0.02) and np.allclose(A, confusion(0.8), atol=0.02)


def test_goldonly_converges():
    g, _ = draw_audits(confusion(0.7), confusion(0.8), PRIOR, 200000, 0, np.random.default_rng(1))
    p, C = estimate_goldonly(g)
    assert np.allclose(C, confusion(0.7), atol=0.01)
