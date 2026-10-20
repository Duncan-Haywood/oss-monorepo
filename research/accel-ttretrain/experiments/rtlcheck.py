"""Run the trained seed-0 models through rtl/kws_tt.v (Icarus) on test clips and compare with the tile reference.
usage: python rtlcheck.py <features.npz>   (needs iverilog; writes rtlcheck.json)"""
import json, os, sys
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
sys.path.insert(0, os.path.join(HERE, "..", "..", "accel-ttfit", "src"))
import accel_ttretrain as tt  # noqa: E402
from accel_kws import mfcc, model  # noqa: E402
from accel_ttfit import rtl  # noqa: E402

N = 30
z, S = np.load(sys.argv[1]), np.load(os.path.join(HERE, "models.npz"))
rows = []
for seg, h, b in [(s, h, b) for s in (7, 12) for h in (8, 16, 32, 64) for b in (2, 3, 4, 8)]:
    xtr = mfcc.pool_segments(z["train_x"].astype(np.float64), seg)
    xte = mfcc.pool_segments(z["test_x"].astype(np.float64), seg)
    n_in = xtr.shape[1]
    v = S[f"{seg}_{h}_{b}_0"]
    a = h * n_in
    w1, b1 = v[:a].reshape(h, n_in).astype(np.int64), v[a:a + h].astype(np.int64)
    w2 = v[a + h:a + h + 11 * h].reshape(11, h).astype(np.int64)
    b2, s1 = v[a + h + 11 * h:a + h + 11 * h + 11].astype(np.int64), int(v[-1])
    mean, std = xtr.mean(axis=0), xtr.std(axis=0) + 1e-6
    pick = np.linspace(0, len(xte) - 1, N).astype(int)
    xq = model.quantise_inputs(xte[pick], mean, std)
    m = dict(IN=n_in, H=h, wb=b, s1=s1, w1=w1, b1=b1, w2=w2, b2=b2)
    cls, t = rtl.simulate(m, xq)
    ref, _ = rtl.reference(m, xq)
    ok = bool((cls == ref).all() and len(cls) == N and all(y - x == rtl.cycles(n_in, h) for x, y in zip(t, t[1:])))
    rows.append(dict(inputs=n_in, hidden=h, wbits=b, clips=N, classes_seen=int(len(set(ref.tolist()))), rtl_exact=ok))
    print(rows[-1], flush=True)
json.dump(rows, open(os.path.join(HERE, "rtlcheck.json"), "w"), indent=1)
print("all exact:", all(r["rtl_exact"] for r in rows))
