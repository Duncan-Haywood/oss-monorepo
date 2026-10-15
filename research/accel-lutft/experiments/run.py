"""Does fine-tuning with the codebook in the loop rescue low-K weight sharing? (accel-lutft)
usage: python3 experiments/run.py [--report]   (a few minutes, NumPy + scikit-learn)"""
import json, os, sys, copy
import numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))
from accel_lutft import model as M, lut as L

HERE = os.path.dirname(__file__)
SEEDS = 10
SIZES = [64, 32, 10]
DIMS = [(64, 32), (32, 10)]
ABITS = [4, 8]
KS = (2, 4, 8)
SPARSITY = (0.0, 0.75)
FT_EPOCHS = 60
FT_LR = 1e-3


def split(seed, y):
    rng = np.random.default_rng(1000 + seed)
    tr, te = [], []
    for c in range(10):
        idx = rng.permutation(np.where(y == c)[0])
        a, b = int(0.6 * len(idx)), int(0.8 * len(idx))
        tr += list(idx[:a]); te += list(idx[b:])
    return np.array(tr), np.array(te)


def share_quant(k, iters):
    """Per-layer k-means codebook over the nonzero latent weights (pruned weights are held at 0)."""
    return lambda w: L.share_weights(w, (w != 0).astype(float), k, iters)[0]


def evaluate(params, masks, X, Xte, yte, quant):
    sc = M.act_scales_from(params, X, quant, masks, 8)
    acc = M.accuracy(params, Xte, yte, quant, masks, 8, sc)
    return acc, [int(np.count_nonzero(quant(w) * masks[k])) for k, (w, _) in enumerate(params)]


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
            for k in range(len(params)):
                params[k][0] *= masks[k]
            rows = {}
            rows['float32'] = evaluate(params, masks, X[tr], X[te], y[te], fq)
            rows['int8'] = evaluate(params, masks, X[tr], X[te], y[te], lambda w: M.q_uniform(w, 8))
            for k in KS:
                rows['post%d' % k] = evaluate(params, masks, X[tr], X[te], y[te], share_quant(k, 30))
                p2 = copy.deepcopy(params); m2 = copy.deepcopy(masks)
                r2 = np.random.default_rng(100 + seed)
                M.train(p2, X[tr], y[tr], m2, share_quant(k, 5), FT_EPOCHS, r2, lr=FT_LR, prune_to=0.0, prune_from=0, prune_until=1)
                rows['ft%d' % k] = evaluate(p2, m2, X[tr], X[te], y[te], share_quant(k, 30))
            for name, (acc, nnz) in rows.items():
                out.append(dict(seed=seed, sparsity=sp, design=name, test=acc, nnz=nnz))
        print('seed', seed, 'done', flush=True)
    json.dump(out, open(os.path.join(HERE, 'results.json'), 'w'), indent=1)


def energy(row, e_tbl=0.04):
    sparse = row['sparsity'] > 0
    n = row['design']
    if n in ('int8', 'float32'):
        wb = 8 if n == 'int8' else 32
        return sum(L.energy_mac_pj(fi, fo, nz, wb, ab, sparse, True) for (fi, fo), nz, ab in zip(DIMS, row['nnz'], ABITS)) / 1000
    k = int(n.lstrip('postft'))
    return sum(L.energy_lut_pj(fi, fo, nz, k, ab, sparse, e_tbl) for (fi, fo), nz, ab in zip(DIMS, row['nnz'], ABITS)) / 1000


def report():
    r = json.load(open(os.path.join(HERE, 'results.json')))
    lines = []
    for sp in SPARSITY:
        rows = [x for x in r if x['sparsity'] == sp]
        base = {x['seed']: x['test'] for x in rows if x['design'] == 'float32'}
        lines.append('== sparsity %d%% (%d splits; drop = float32 minus design, paired) ==' % (int(sp * 100), SEEDS))
        lines.append('design | test acc | drop vs float32 (se) | E nJ @0.04 pJ/bit table read | E nJ @0.16 pJ/bit')
        for name in ['int8'] + ['%s%d' % (p, k) for k in KS for p in ('post', 'ft')]:
            v = [x for x in rows if x['design'] == name]
            t = np.array([x['test'] for x in v]); dd = np.array([base[x['seed']] for x in v]) - t
            e1 = np.mean([energy(x, 0.04) for x in v]); e2 = np.mean([energy(x, 0.16) for x in v])
            lines.append('%s | %.3f | %+.3f (%.3f) | %.2f | %.2f' % (name, t.mean(), dd.mean(), dd.std(ddof=1) / np.sqrt(len(dd)), e1, e2))
        lines.append('')
    open(os.path.join(HERE, 'results.txt'), 'w').write('\n'.join(lines) + '\n')
    print('\n'.join(lines))


if __name__ == '__main__':
    if '--report' not in sys.argv:
        run()
    report()
