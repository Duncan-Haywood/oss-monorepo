import os, sys
import numpy as np, pandas as pd
import pytest
torch = pytest.importorskip("torch")
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
import neural, harness


def _frame(n=3000, seed=0):
    rng = np.random.default_rng(seed)
    pt = rng.choice(["a", "b"], n)
    # type b is slower; a has a 60% same-day mass
    y = np.where(pt == "a", np.where(rng.random(n) < .6, 0, rng.integers(1, 20, n)), rng.integers(20, 60, n))
    year = rng.choice([2020, 2021, 2022, 2023, 2024], n)
    return pd.DataFrame(dict(permit_type=pt, work_class="w", area="z", y=y, year=year,
                             month=rng.integers(1, 13, n), dow=rng.integers(0, 7, n),
                             log_cost=np.where(rng.random(n) < .3, np.nan, rng.random(n)),
                             desc_len=rng.integers(0, 200, n).astype(float),
                             start=[f"{int(yy)}-03-{int(d):02d}" for yy, d in zip(year, rng.integers(1, 28, n))]))


def test_quantiles_monotone_nonnegative_and_learns_type_gap():
    df = _frame()
    tr, ca, te = df[df.year <= 2022], df[df.year == 2023], df[df.year == 2024]
    (etr, eca, ete), sizes = neural.encode(tr, [ca, te])
    net, hist = neural.fit(etr, eca, tr.y.to_numpy(float), ca.y.to_numpy(float), sizes, seed=0, epochs=40, bs=256)
    q, pz = neural.predict(net, *ete)
    assert (np.diff(q, axis=1) >= -1e-6).all() and (q >= 0).all()
    a, b = (te.permit_type == "a").to_numpy(), (te.permit_type == "b").to_numpy()
    assert q[a, 1].mean() < q[b, 1].mean()          # median of fast type below slow type
    assert pz[a].mean() > pz[b].mean() + 0.3       # same-day probability separates the types
    assert len(hist) >= 1


def test_run_end_to_end_keys():
    df = _frame()
    res, P, wk, yte = neural.run(df, 2024, seeds=1)
    assert set(res["neural_pinball"]) == {str(t) for t in harness.TAUS}
    assert res["n_test"] == len(yte)
