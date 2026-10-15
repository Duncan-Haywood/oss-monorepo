"""Weight-sharing product-table inference vs int8 MAC engines on scikit-learn's bundled 8x8 digits.
usage: python3 experiments/run.py [--report]   (a few minutes, NumPy + scikit-learn)"""
import json, os, sys
import numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))
from accel_lut import model as M, lut as L

HERE = os.path.dirname(__file__)
SEEDS = 10
H = 32
SIZES = [64, H, 10]
DIMS = [(64, H), (H, 10)]
ABITS = [4, 8]
KS = (2, 4, 8, 16, 32)
SPARSITY = (0.0, 0.75)
E_TBLS = (0.04, 0.16)   # assumed product-table read energy per bit; 0.16 = same as the weight array


def split(seed, y):
    rng = np.random.default_rng(1000 + seed)
    tr, te = [], []
    for c in range(10):
        idx = rng.permutation(np.where(y == c)[0])
        a, b = int(0.6 * len(idx)), int(0.8 * len(idx))
        tr += list(idx[:a]); te += list(idx[b:])
    return np.array(tr), np.array(te)


def evaluate(params, masks, X, y, Xte, yte, quant_fn):
    """quant_fn(w, mask) -> quantised weights. Activations are quantised to 8 bits after training."""
    qs = [quant_fn(w, masks[k]) for k, (w, _) in enumerate(params)]
    look = lambda w: qs[[p[0] is w for p in params].index(True)]
    sc = M.act_scales_from(params, X, look, masks, 8)
    return M.accuracy(params, Xte, yte, look, masks, 8, sc), [int(np.count_nonzero(q)) for q in qs]


def run():
    from sklearn.datasets import load_digits
    d = load_digits(); X = d.data / 16.0; y = d.target
    out = []
    for seed in range(SEEDS):
        tr, te = split(seed, y)
        for sp in SPARSITY:
            rng = np.random.default_rng(seed)
            params = M.init(SIZES, rng); masks = [np.ones_like(p[0]) for p in params]
            fq = M.make_quant('float')
            if sp == 0:
                M.train(params, X[tr], y[tr], masks, fq, 150, rng)
            else:
                M.train(params, X[tr], y[tr], masks, fq, 60, rng)
                M.train(params, X[tr], y[tr], masks, fq, 180, rng, prune_to=sp, prune_from=0, prune_until=100)
            designs = {'int8': lambda w, m: M.q_uniform(w, 8) * m}
            designs['float32'] = lambda w, m: w * m
            for k in KS:
                designs['share%d' % k] = (lambda k: lambda w, m: L.share_weights(w, m, k)[0])(k)
            for name, fn in designs.items():
                acc, nnz = evaluate(params, masks, X[tr], y[tr], X[te], y[te], fn)
                out.append(dict(seed=seed, sparsity=sp, design=name, test=acc, nnz=nnz))
        print('seed', seed, 'done', flush=True)
    json.dump(out, open(os.path.join(HERE, 'results.json'), 'w'), indent=1)


def energies(row, e_tbl):
    sparse = row['sparsity'] > 0
    name = row['design']
    if name in ('int8', 'float32'):
        wb = 8 if name == 'int8' else 32
        a = sum(L.energy_mac_pj(fi, fo, nz, wb, ab, sparse, False) for (fi, fo), nz, ab in zip(DIMS, row['nnz'], ABITS))
        b = sum(L.energy_mac_pj(fi, fo, nz, wb, ab, sparse, True) for (fi, fo), nz, ab in zip(DIMS, row['nnz'], ABITS))
        return a / 1000, b / 1000
    k = int(name[5:])
    e = sum(L.energy_lut_pj(fi, fo, nz, k, ab, sparse, e_tbl) for (fi, fo), nz, ab in zip(DIMS, row['nnz'], ABITS)) / 1000
    return e, e


def report():
    r = json.load(open(os.path.join(HERE, 'results.json')))
    lines = []
    for sp in SPARSITY:
        rows = [x for x in r if x['sparsity'] == sp]
        base = {x['seed']: x['test'] for x in rows if x['design'] == 'float32'}
        lines.append('== sparsity %d%% (10 splits; drop = float32 minus design, paired) ==' % int(sp * 100))
        lines.append('design | test acc | drop vs float32 (se) | nnz | E nJ (act read per weight) | E nJ (act read once) | E nJ product-table @0.04 pJ/bit | @0.16 pJ/bit')
        for name in ['int8'] + ['share%d' % k for k in KS]:
            v = [x for x in rows if x['design'] == name]
            t = np.array([x['test'] for x in v]); dd = np.array([base[x['seed']] for x in v]) - t
            nz = np.mean([sum(x['nnz']) for x in v])
            if name == 'int8':
                ea = np.mean([energies(x, 0.04)[0] for x in v]); eb = np.mean([energies(x, 0.04)[1] for x in v])
                cols = '%.2f | %.2f | - | -' % (ea, eb)
            else:
                e1 = np.mean([energies(x, 0.04)[0] for x in v]); e2 = np.mean([energies(x, 0.16)[0] for x in v])
                cols = '- | - | %.2f | %.2f' % (e1, e2)
            lines.append('%s | %.3f | %+.3f (%.3f) | %.0f | %s' % (name, t.mean(), dd.mean(), dd.std(ddof=1) / np.sqrt(len(dd)), nz, cols))
        lines.append('')
    lines.append('== analytic crossover: one dense 64xN layer, 4-bit inputs, int8 MAC (act read once) vs K=16 product table (energy ratio table/MAC; <1 means the table wins) ==')
    lines.append('N | @0.04 pJ/bit | @0.16 pJ/bit')
    for n in (8, 16, 32, 64, 128, 256, 512, 1024):
        mac = L.energy_mac_pj(64, n, 64 * n, 8, 4, False, True)
        lines.append('%d | %.2f | %.2f' % (n, L.energy_lut_pj(64, n, 64 * n, 16, 4, False, 0.04) / mac, L.energy_lut_pj(64, n, 64 * n, 16, 4, False, 0.16) / mac))
    open(os.path.join(HERE, 'results.txt'), 'w').write('\n'.join(lines) + '\n')
    print('\n'.join(lines))


if __name__ == '__main__':
    if '--report' not in sys.argv:
        run()
    report()
