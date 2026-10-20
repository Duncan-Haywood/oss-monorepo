"""Surrogate of a 2D plane-stress Q4 cantilever at two mesh sizes: error against its own FE solve, the FE
solve's own discretisation error against a 128x16 reference, and the energy break-even. 3 seeds."""
import json, os, sys, time
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'src'))
from accel_surrogate2d import fe2d, mlp, cost

SIZES = [fe2d.NSEG, 32, 32, 1]
MESHES = [(32, 4), (64, 8)]
REF = (128, 16)
BITS = [6, 8]
SEEDS = 3
NTRAIN, NTEST, NREF = 2000, 500, 100


def relerr(params, X, ytrue, ym, ys, wbits):
    pred = mlp.forward(params, X, wbits=wbits, abits=8 if wbits else None)[:, 0] * ys + ym
    return np.abs(np.exp(pred - ytrue) - 1.0)


def main():
    t0 = time.time()
    res = {'meshes': {}, 'sizes': SIZES, 'ref': list(REF)}
    for nx, ny in MESHES:
        key = '%dx%d' % (nx, ny)
        r = {'float': [], 'ptq': {b: [] for b in BITS}, 'qat': {b: [] for b in BITS},
             'fe_vs_ref': [], 'float_vs_ref': [], 'qat6_vs_ref': []}
        for seed in range(SEEDS):
            rng = np.random.default_rng(seed)
            H = fe2d.sample_designs(rng, NTRAIN + NTEST)
            y = np.log([fe2d.tip_deflection(h, nx, ny) for h in H])
            X = (H - (fe2d.H_LO + fe2d.H_HI) / 2) / ((fe2d.H_HI - fe2d.H_LO) / 2)
            ym, ys = y[:NTRAIN].mean(), y[:NTRAIN].std()
            yn = ((y - ym) / ys)[:, None]
            Xtr, Xte, ytr = X[:NTRAIN], X[NTRAIN:], yn[:NTRAIN]
            base = mlp.train(mlp.init(rng, SIZES), Xtr, ytr, rng, epochs=300)
            r['float'].append(relerr(base, Xte, y[NTRAIN:], ym, ys, None).tolist())
            qats = {}
            for b in BITS:
                r['ptq'][b].append(relerr(base, Xte, y[NTRAIN:], ym, ys, b).tolist())
                q = mlp.train(mlp.copy(base), Xtr, ytr, rng, epochs=80, lr=1e-3, wbits=b)
                qats[b] = q
                r['qat'][b].append(relerr(q, Xte, y[NTRAIN:], ym, ys, b).tolist())
            # reference: the first NREF test designs solved on the fine mesh
            yref = np.log([fe2d.tip_deflection(h, *REF) for h in H[NTRAIN:NTRAIN + NREF]])
            r['fe_vs_ref'].append(np.abs(np.exp(y[NTRAIN:NTRAIN + NREF] - yref) - 1).tolist())
            r['float_vs_ref'].append(relerr(base, Xte[:NREF], yref, ym, ys, None).tolist())
            r['qat6_vs_ref'].append(relerr(qats[6], Xte[:NREF], yref, ym, ys, 6).tolist())
            print(key, 'seed', seed, 'done', round(time.time() - t0), 's', flush=True)
        r['flops'] = fe2d.fe_flops(nx, ny)
        res['meshes'][key] = r
    with open(os.path.join(HERE, 'results.json'), 'w') as f:
        json.dump(res, f)
    report()


def report():
    with open(os.path.join(HERE, 'results.json')) as f:
        res = json.load(f)
    S = res['sizes']
    lines = ['MLP %s, %d params; reference mesh %s; errors are relative tip-deflection errors, medians over test designs, mean over seeds'
             % (S, sum(a * b + b for a, b in zip(S[:-1], S[1:])), 'x'.join(map(str, res['ref'])))]
    med = lambda a: 100 * np.mean(np.median(np.array(a), 1))
    for key, r in res['meshes'].items():
        lines += ['', 'mesh %s: FE solve ~%d flops (banded-Cholesky estimate), %.1f nJ at 2.3 pJ/flop'
                  % (key, r['flops'], cost.fe_energy_pj(r['flops']) / 1000),
                  'FE discretisation error vs reference: median %.2f %%' % med(r['fe_vs_ref']),
                  'variant | wbits | median err vs own FE % | energy (nJ) | break-even sim flops | ratio FE energy / MLP energy']
        def row(name, bits, errs):
            en = cost.mlp_energy_pj(S, bits or 32)
            lines.append('%s | %s | %.3f | %.2f | %.0f | %.0f' % (name, bits or 'fp', med(errs), en / 1000,
                                                                cost.breakeven_flops(S, bits or 32),
                                                                cost.fe_energy_pj(r['flops']) / en))
        row('float', None, r['float'])
        for b in BITS:
            row('PTQ', b, r['ptq'][str(b)])
        for b in BITS:
            row('QAT', b, r['qat'][str(b)])
        lines.append('against the reference mesh: float surrogate median %.2f %%, QAT-6 surrogate median %.2f %%, FE itself %.2f %%'
                     % (med(r['float_vs_ref']), med(r['qat6_vs_ref']), med(r['fe_vs_ref'])))
    txt = '\n'.join(lines)
    with open(os.path.join(HERE, 'results.txt'), 'w') as f:
        f.write(txt + '\n')
    print(txt)


if __name__ == '__main__':
    report() if '--report' in sys.argv else main()
