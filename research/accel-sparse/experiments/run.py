"""Sparsity / low-bit sweep on scikit-learn's bundled 8x8 digits (UCI optical-recognition set).
usage: python3 experiments/run.py [--report]   (about 2 minutes, NumPy + scikit-learn)"""
import json, os, sys
import numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))
from accel_sparse import model as M, cost as C

HERE = os.path.dirname(__file__)
SEEDS = 10
H = 32
SIZES = [64, H, 10]
ABITS = [4, 8]  # first-layer inputs are the dataset's native 4-bit pixels; hidden activations 8-bit
# name, weight quantiser, weight bits stored, target sparsity (None = dense), kind of arithmetic
DESIGNS = [
    ('float32 dense', 'float', 32, None),
    ('int8 dense', 'int8', 8, None),
    ('int4 dense', 'int4', 4, None),
    ('ternary', 'ternary', 2, None),
    ('binary', 'binary', 1, None),
] + [('int8 pruned %d%%' % int(s * 100), 'int8', 8, s) for s in (0.5, 0.75, 0.9, 0.95, 0.98)] \
  + [('ternary pruned %d%%' % int(s * 100), 'ternary', 2, s) for s in (0.5, 0.75, 0.9)]


def split(seed, X, y):
    rng = np.random.default_rng(1000 + seed)
    tr, va, te = [], [], []
    for c in range(10):
        idx = rng.permutation(np.where(y == c)[0])
        a, b = int(0.6 * len(idx)), int(0.8 * len(idx))
        tr += list(idx[:a]); va += list(idx[a:b]); te += list(idx[b:])
    return np.array(tr), np.array(va), np.array(te)


def energy_nj(nnz, kind, wbits, sparse):
    dims = [(64, H), (H, 10)]
    e = 0.0
    for (fi, fo), nz, ab in zip(dims, nnz, ABITS):
        e += C.layer_energy_pj(fi, fo, nz, 'signadd' if kind in ('ternary', 'binary') else 'mult', wbits, ab, sparse)
    return e / 1000.0


def storage_kbit(nnz, wbits, sparse):
    dims = [(64, H), (H, 10)]
    return sum(C.storage_bits(fi, fo, nz, wbits, sparse) for (fi, fo), nz in zip(dims, nnz)) / 1000.0


def run():
    from sklearn.datasets import load_digits
    d = load_digits()
    X = d.data / 16.0
    y = d.target
    out = {}
    for seed in range(SEEDS):
        tr, va, te = split(seed, X, y)
        for name, qk, wb, sp in DESIGNS:
            rng = np.random.default_rng(seed)
            quant = M.make_quant(qk)
            params = M.init(SIZES, rng)
            masks = [np.ones_like(p[0]) for p in params]
            if sp is None:
                M.train(params, X[tr], y[tr], masks, quant, 150, rng)
            else:
                M.train(params, X[tr], y[tr], masks, quant, 60, rng)  # dense warm-up
                M.train(params, X[tr], y[tr], masks, quant, 180, rng, prune_to=sp, prune_from=0, prune_until=100)
            sc = M.act_scales_from(params, X[tr], quant, masks, 8)
            acc = M.accuracy(params, X[te], y[te], quant, masks, 8, sc)
            vacc = M.accuracy(params, X[va], y[va], quant, masks, 8, sc)
            nnz = M.nnz_per_layer(params, quant, masks)
            kind = 'signadd' if qk in ('ternary', 'binary') else 'mult'
            sparse = sp is not None
            out.setdefault(name, []).append(dict(
                seed=seed, test=acc, val=vacc, nnz=nnz,
                energy_nj=energy_nj(nnz, kind, wb, sparse), storage_kbit=storage_kbit(nnz, wb, sparse),
                multiplier_free=kind == 'signadd'))
        print('seed', seed, 'done', flush=True)
    json.dump(out, open(os.path.join(HERE, 'results.json'), 'w'), indent=1)


def report():
    r = json.load(open(os.path.join(HERE, 'results.json')))
    base = np.array([x['test'] for x in r['float32 dense']])
    lines = ['design | test acc mean (sd) | drop vs float32, paired mean (se) | nonzero weights | energy nJ | storage kbit | multiplier-free']
    rows = []
    for name, v in r.items():
        t = np.array([x['test'] for x in v])
        dd = base - t
        nz = np.mean([sum(x['nnz']) for x in v])
        e = np.mean([x['energy_nj'] for x in v]); s = np.mean([x['storage_kbit'] for x in v])
        rows.append((name, t.mean(), dd.mean(), e))
        lines.append('%s | %.3f (%.3f) | %+.3f (%.3f) | %.0f | %.2f | %.1f | %s' % (
            name, t.mean(), t.std(ddof=1), dd.mean(), dd.std(ddof=1) / np.sqrt(len(dd)), nz, e, s, v[0]['multiplier_free']))
    lines.append('')
    ref = [e for n, a, dr, e in rows if n == 'int8 dense'][0]
    for tol in (0.01, 0.02, 0.05):
        ok = [(e, n, a) for n, a, dr, e in rows if dr <= tol]
        e, n, a = min(ok)
        mf = [(e2, n2, a2) for n2, a2, dr, e2 in rows if dr <= tol and ('ternary' in n2 or 'binary' in n2)]
        lines.append('cheapest design within %.0f points of float32: %s (acc %.3f, %.2f nJ, %.0f%% of int8 dense)%s' % (
            tol * 100, n, a, e, 100 * e / ref,
            '; cheapest multiplier-free: %s (%.2f nJ)' % (min(mf)[1], min(mf)[0]) if mf else '; no multiplier-free design within tolerance'))
    lines.append('')
    lines.append('sensitivity: multiplier energy scaled by f; cheapest design within 2 points of float32 (all / multiplier-free only)')
    base_e = C.E_MULT_8X8_PJ
    names = {n: r[n] for n in r}
    for f in (1, 3, 10, 30):
        C.E_MULT_8X8_PJ = base_e * f
        best = {}
        for n, v in names.items():
            dd = base - np.array([x['test'] for x in v])
            if dd.mean() > 0.02:
                continue
            qk = [d for d in DESIGNS if d[0] == n][0]
            kind = 'signadd' if qk[1] in ('ternary', 'binary') else 'mult'
            e = np.mean([energy_nj(x['nnz'], kind, qk[2], qk[3] is not None) for x in v])
            best[n] = (e, kind)
        a = min((e, n) for n, (e, k) in best.items())
        m = min((e, n) for n, (e, k) in best.items() if k == 'signadd')
        lines.append('f=%g: %s %.2f nJ / %s %.2f nJ' % (f, a[1], a[0], m[1], m[0]))
    C.E_MULT_8X8_PJ = base_e
    open(os.path.join(HERE, 'results.txt'), 'w').write('\n'.join(lines) + '\n')
    print('\n'.join(lines))


if __name__ == '__main__':
    if '--report' not in sys.argv:
        run()
    report()
