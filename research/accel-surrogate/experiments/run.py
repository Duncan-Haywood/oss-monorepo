"""Train a float MLP surrogate of the FE cantilever, quantise it (post-training and QAT) at 3..8 weight
bits, and compare its error with the Euler-Bernoulli vs Timoshenko model-form gap. 5 seeds."""
import json, os, sys, time
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'src'))
from accel_surrogate import beam, mlp, cost

SIZES = [beam.NSEG, 32, 32, 1]
BITS = [3, 4, 5, 6, 8]
SEEDS = 5
NTRAIN, NTEST = 3000, 1000


def relerr(params, X, ytrue, ym, ys, wbits):
    pred = mlp.forward(params, X, wbits=wbits, abits=8 if wbits else None)[:, 0] * ys + ym
    return np.abs(np.exp(pred - ytrue) - 1.0)


def main():
    t0 = time.time()
    res = {'float': [], 'ptq': {b: [] for b in BITS}, 'qat': {b: [] for b in BITS}, 'gap': []}
    for seed in range(SEEDS):
        rng = np.random.default_rng(seed)
        H = beam.sample_designs(rng, NTRAIN + NTEST)
        d = np.array([beam.fe_tip_deflection(h) for h in H])
        y = np.log(d)
        X = (H - (beam.H_LO + beam.H_HI) / 2) / ((beam.H_HI - beam.H_LO) / 2)
        ym, ys = y[:NTRAIN].mean(), y[:NTRAIN].std()
        yn = ((y - ym) / ys)[:, None]
        Xtr, Xte, ytr = X[:NTRAIN], X[NTRAIN:], yn[:NTRAIN]
        yte_log = y[NTRAIN:]
        if seed == 0:
            res['gap'] = [beam.timoshenko_gap(h) for h in H[NTRAIN:]]
        base = mlp.train(mlp.init(rng, SIZES), Xtr, ytr, rng, epochs=300)
        res['float'].append(relerr(base, Xte, yte_log, ym, ys, None).tolist())
        for b in BITS:
            res['ptq'][b].append(relerr(base, Xte, yte_log, ym, ys, b).tolist())
            q = mlp.train(mlp.copy(base), Xtr, ytr, rng, epochs=80, lr=1e-3, wbits=b)
            res['qat'][b].append(relerr(q, Xte, yte_log, ym, ys, b).tolist())
        print('seed', seed, 'done', round(time.time() - t0), 's', flush=True)
    res['sizes'] = SIZES
    with open(os.path.join(HERE, 'results.json'), 'w') as f:
        json.dump(res, f)
    report()


def report():
    with open(os.path.join(HERE, 'results.json')) as f:
        r = json.load(f)
    gap = np.array(r['gap'])
    gmed, g95 = np.median(gap), np.percentile(gap, 95)
    S = r['sizes']
    fe_flops = beam.fe_flops()
    lines = ['model-form gap (Timoshenko vs Euler-Bernoulli, relative): median %.2f%%, 95th pct %.2f%%, min %.2f%%, max %.2f%%'
             % (100 * gmed, 100 * g95, 100 * gap.min(), 100 * gap.max()),
             'MLP %s, %d params; FE solve ~%d flops (estimate)' % (S, sum(a * b + b for a, b in zip(S[:-1], S[1:])), fe_flops), '',
             'variant | wbits | median err % | 95th pct err % | share of designs with err < gap | energy (nJ) | break-even sim flops']
    def row(name, bits, errs):
        e = np.array(errs)                      # seeds x designs
        gapb = np.broadcast_to(gap, e.shape)
        med = np.mean(np.median(e, 1)); p95 = np.mean(np.percentile(e, 95, 1))
        share = np.mean(e < gapb)
        en = cost.mlp_energy_pj(S, bits or 32) / 1000
        be = cost.breakeven_flops(S, bits or 32)
        lines.append('%s | %s | %.3f | %.3f | %.2f | %.2f | %.0f' % (name, bits or 'fp', 100 * med, 100 * p95, share, en, be))
    row('float', None, r['float'])
    for b in sorted(map(int, r['ptq'])):
        row('PTQ', b, r['ptq'][str(b)])
    for b in sorted(map(int, r['qat'])):
        row('QAT', b, r['qat'][str(b)])
    lines += ['', 'FE solve energy (arithmetic only, 2.3 pJ/flop assumed): %.1f nJ' % (cost.fe_energy_pj(fe_flops) / 1000)]
    txt = '\n'.join(lines)
    with open(os.path.join(HERE, 'results.txt'), 'w') as f:
        f.write(txt + '\n')
    print(txt)


if __name__ == '__main__':
    report() if '--report' in sys.argv else main()
