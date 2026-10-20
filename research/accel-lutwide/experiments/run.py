"""Does the wide-layer break-even of accel-lut show up in a trained wide MLP? 64-N-10 on sklearn digits.
usage: python3 experiments/run.py [--report]   (NumPy + scikit-learn)"""
import json, os, sys
import numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))
from accel_lutwide import model as M, lut as L

HERE = os.path.dirname(__file__)
SEEDS = 10
WIDTHS = (32, 128, 512)
KS = (8, 16, 32)
ABITS = [4, 8]
E_TBLS = (0.04, 0.16)   # assumed product-table read energy per bit


def split(seed, y):
    rng = np.random.default_rng(1000 + seed)
    tr, te = [], []
    for c in range(10):
        idx = rng.permutation(np.where(y == c)[0])
        a, b = int(0.6 * len(idx)), int(0.8 * len(idx))
        tr += list(idx[:a]); te += list(idx[b:])
    return np.array(tr), np.array(te)


def evaluate(params, masks, X, Xte, yte, qfns):
    qs = [qfns[k](w, masks[k]) for k, (w, _) in enumerate(params)]
    look = lambda w: qs[[p[0] is w for p in params].index(True)]
    sc = M.act_scales_from(params, X, look, masks, 8)
    return M.accuracy(params, Xte, yte, look, masks, 8, sc)


def designs():
    i8 = lambda w, m: M.q_uniform(w, 8) * m
    d = {'float32': [lambda w, m: w * m] * 2, 'int8': [i8, i8]}
    for k in KS:
        sh = (lambda k: lambda w, m: L.share_weights(w, m, k)[0])(k)
        d['share%d' % k] = [sh, sh]            # both layers through a table
        d['hybrid%d' % k] = [sh, i8]           # table on the wide first layer, int8 MAC on the 10-output layer
    return d


def run():
    from sklearn.datasets import load_digits
    d = load_digits(); X = d.data / 16.0; y = d.target
    out = []
    for n in WIDTHS:
        for seed in range(SEEDS):
            tr, te = split(seed, y)
            rng = np.random.default_rng(seed)
            params = M.init([64, n, 10], rng); masks = [np.ones_like(p[0]) for p in params]
            M.train(params, X[tr], y[tr], masks, M.make_quant('float'), 150, rng)
            for name, fns in designs().items():
                out.append(dict(width=n, seed=seed, design=name, test=evaluate(params, masks, X[tr], X[te], y[te], fns)))
        print('width', n, 'done', flush=True)
    json.dump(out, open(os.path.join(HERE, 'results.json'), 'w'), indent=1)


def energy_nj(width, name, e_tbl):
    """Dense layers, act read once per input for every design (the like-with-like convention of accel-lut)."""
    dims = [(64, width), (width, 10)]
    mac = lambda i: L.energy_mac_pj(*dims[i], dims[i][0] * dims[i][1], 8, ABITS[i], False, True)
    lut = lambda i, k: L.energy_lut_pj(*dims[i], dims[i][0] * dims[i][1], k, ABITS[i], False, e_tbl)
    if name == 'int8':
        e = mac(0) + mac(1)
    elif name.startswith('share'):
        e = lut(0, int(name[5:])) + lut(1, int(name[5:]))
    elif name.startswith('hybrid'):
        e = lut(0, int(name[6:])) + mac(1)
    else:
        return None
    return e / 1000


def report():
    r = json.load(open(os.path.join(HERE, 'results.json')))
    lines = []
    for n in WIDTHS:
        rows = [x for x in r if x['width'] == n]
        base = {x['seed']: x['test'] for x in rows if x['design'] == 'float32'}
        lines.append('== hidden width %d (10 splits; drop = float32 minus design, paired; dense, energy in nJ) ==' % n)
        lines.append('design | test acc | drop vs float32 (se) | E nJ @0.04 pJ/bit | E nJ @0.16 pJ/bit | ratio to int8 @0.04 | ratio to int8 @0.16')
        for name in ['int8'] + ['%s%d' % (p, k) for k in KS for p in ('share', 'hybrid')]:
            v = [x for x in rows if x['design'] == name]
            t = np.array([x['test'] for x in v]); dd = np.array([base[x['seed']] for x in v]) - t
            e1, e2 = energy_nj(n, name, 0.04), energy_nj(n, name, 0.16)
            b1, b2 = energy_nj(n, 'int8', 0.04), energy_nj(n, 'int8', 0.16)
            lines.append('%s | %.3f | %+.3f (%.3f) | %.2f | %.2f | %.2f | %.2f' % (name, t.mean(), dd.mean(), dd.std(ddof=1) / np.sqrt(len(dd)), e1, e2, e1 / b1, e2 / b2))
        lines.append('')
    open(os.path.join(HERE, 'results.txt'), 'w').write('\n'.join(lines) + '\n')
    print('\n'.join(lines))


if __name__ == '__main__':
    if '--report' not in sys.argv:
        run()
    report()
