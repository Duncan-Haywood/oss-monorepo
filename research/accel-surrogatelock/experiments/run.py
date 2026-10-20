"""Locking-free (Q6) FE cantilever: surrogate error against its own FE and the reference, the energy break-even,
and a design-loop test (min-mass design that meets a deflection limit, screened by the FE mesh or a surrogate and
judged on the 128x16 reference). 3 seeds. Results go to results.json and results.txt."""
import json, os, sys, time
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'src'))
from accel_surrogatelock import fe2d, mlp, cost

SIZES = [fe2d.NSEG, 32, 32, 1]
MESHES = [(16, 2), (32, 4), (64, 8)]
REF = (128, 16)
BITS = [6, 8]
SEEDS = 3
NTRAIN, NTEST, NREF = 2000, 500, 100
NPOOL = 1000
QUANTILES = np.linspace(0.15, 0.85, 15)
MARGINS = [0.0, 0.05, 0.10]


def pred_defl(params, X, ym, ys, wbits):
    return np.exp(mlp.forward(params, X, wbits=wbits, abits=8 if wbits else None)[:, 0] * ys + ym)


def relerr(pred, true):
    return np.abs(pred / true - 1.0)


def pick(mass, est, limit, margin):
    """Index of the lightest design whose estimate (inflated by the margin) meets the limit, or None."""
    ok = est * (1 + margin) <= limit
    if not ok.any():
        return None
    return int(np.flatnonzero(ok)[np.argmin(mass[ok])])


def loop_stats(mass, truth, est, margins):
    """Per margin: share of limits where the pick breaks the true limit, share with no pick, mean extra mass over the oracle."""
    out = {}
    for m in margins:
        viol = none = 0
        extra = []
        for q in QUANTILES:
            lim = np.quantile(truth, q)
            ok = truth <= lim
            orc = mass[ok].min()
            i = pick(mass, est, lim, m)
            if i is None:
                none += 1
                continue
            if truth[i] > lim:
                viol += 1
            extra.append(mass[i] / orc - 1)
        out[str(m)] = {'violation': viol / len(QUANTILES), 'none': none / len(QUANTILES),
                       'extra_mass': float(np.mean(extra)) if extra else None}
    return out


def main():
    t0 = time.time()
    rngp = np.random.default_rng(1000)
    Hp = fe2d.sample_designs(rngp, NPOOL)
    mass = Hp.sum(1)
    truth_pool = np.array([fe2d.tip_deflection(h, *REF) for h in Hp])
    print('pool truth done', round(time.time() - t0), 's', flush=True)
    res = {'meshes': {}, 'sizes': SIZES, 'ref': list(REF), 'margins': MARGINS, 'npool': NPOOL}
    for nx, ny in MESHES:
        key = '%dx%d' % (nx, ny)
        r = {'float': [], 'ptq': {b: [] for b in BITS}, 'qat': {b: [] for b in BITS},
             'fe_vs_ref': [], 'float_vs_ref': [], 'qat6_vs_ref': [],
             'loop_fe': None, 'loop_float': [], 'loop_qat6': []}
        fe_pool = np.array([fe2d.tip_deflection(h, nx, ny) for h in Hp])
        r['loop_fe'] = loop_stats(mass, truth_pool, fe_pool, MARGINS)
        r['pool_fe_err'] = relerr(fe_pool, truth_pool).tolist()
        for seed in range(SEEDS):
            rng = np.random.default_rng(seed)
            H = fe2d.sample_designs(rng, NTRAIN + NTEST)
            y = np.log([fe2d.tip_deflection(h, nx, ny) for h in H])
            norm = lambda A: (A - (fe2d.H_LO + fe2d.H_HI) / 2) / ((fe2d.H_HI - fe2d.H_LO) / 2)
            X = norm(H)
            ym, ys = y[:NTRAIN].mean(), y[:NTRAIN].std()
            yn = ((y - ym) / ys)[:, None]
            Xtr, Xte, ytr = X[:NTRAIN], X[NTRAIN:], yn[:NTRAIN]
            ytrue = np.exp(y[NTRAIN:])
            base = mlp.train(mlp.init(rng, SIZES), Xtr, ytr, rng, epochs=300)
            r['float'].append(relerr(pred_defl(base, Xte, ym, ys, None), ytrue).tolist())
            qats = {}
            for b in BITS:
                r['ptq'][b].append(relerr(pred_defl(base, Xte, ym, ys, b), ytrue).tolist())
                q = mlp.train(mlp.copy(base), Xtr, ytr, rng, epochs=80, lr=1e-3, wbits=b)
                qats[b] = q
                r['qat'][b].append(relerr(pred_defl(q, Xte, ym, ys, b), ytrue).tolist())
            # reference: the first NREF test designs on the fine mesh
            yref = np.array([fe2d.tip_deflection(h, *REF) for h in H[NTRAIN:NTRAIN + NREF]])
            r['fe_vs_ref'].append(relerr(ytrue[:NREF], yref).tolist())
            r['float_vs_ref'].append(relerr(pred_defl(base, Xte[:NREF], ym, ys, None), yref).tolist())
            r['qat6_vs_ref'].append(relerr(pred_defl(qats[6], Xte[:NREF], ym, ys, 6), yref).tolist())
            Xp = norm(Hp)
            r['loop_float'].append(loop_stats(mass, truth_pool, pred_defl(base, Xp, ym, ys, None), MARGINS))
            r['loop_qat6'].append(loop_stats(mass, truth_pool, pred_defl(qats[6], Xp, ym, ys, 6), MARGINS))
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
    lines = ['MLP %s, %d params; Q6 (incompatible-modes) elements; reference mesh %s; errors are relative tip-deflection errors, medians over test designs, mean over seeds'
             % (S, sum(a * b + b for a, b in zip(S[:-1], S[1:])), 'x'.join(map(str, res['ref'])))]
    med = lambda a: 100 * np.mean(np.median(np.array(a), 1))
    for key, r in res['meshes'].items():
        lines += ['', 'mesh %s: FE solve ~%d flops (banded-Cholesky estimate, Q4 count), %.1f nJ at 2.3 pJ/flop'
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
        lines.append('design loop (%d-design pool, 15 deflection limits, judged on the reference): screen | margin | limits broken %% | no pick %% | extra mass over oracle %%' % res['npool'])
        def lrow(name, st):
            for m in res['margins']:
                s = st[str(m)]
                lines.append('%s | %.2f | %.1f | %.1f | %s' % (name, m, 100 * s['violation'], 100 * s['none'],
                                                              'n/a' if s['extra_mass'] is None else '%.2f' % (100 * s['extra_mass'])))
        def avg(runs):
            out = {}
            for m in res['margins']:
                k = str(m)
                ex = [x[k]['extra_mass'] for x in runs if x[k]['extra_mass'] is not None]
                out[k] = {'violation': np.mean([x[k]['violation'] for x in runs]), 'none': np.mean([x[k]['none'] for x in runs]),
                          'extra_mass': float(np.mean(ex)) if ex else None}
            return out
        lrow('FE ' + key, r['loop_fe'])
        lrow('float surrogate', avg(r['loop_float']))
        lrow('QAT-6 surrogate', avg(r['loop_qat6']))
    txt = '\n'.join(lines)
    with open(os.path.join(HERE, 'results.txt'), 'w') as f:
        f.write(txt + '\n')
    print(txt)


if __name__ == '__main__':
    report() if '--report' in sys.argv else main()
