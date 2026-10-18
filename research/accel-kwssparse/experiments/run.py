"""Sweep accel-sparse's 14 designs on Speech Commands MFCC features from accel-kws.

usage: python3 experiments/run.py <features.npz> [--report]
  features.npz comes from research/accel-kws/experiments/prepare_features.py (not committed).
"""
import json
import os
import sys
import time

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'src'))
from accel_kwssparse import sweep as S  # noqa: E402
from accel_sparse import model as M  # noqa: E402
from accel_kws import mfcc  # noqa: E402

SEEDS = 5
HIDDEN = 64
SEGMENTS = 7
EPOCHS = 30
BS = 128


def run(feats):
    z = np.load(feats)
    x = {s: mfcc.pool_segments(z[s + '_x'].astype(np.float64), SEGMENTS) for s in ('train', 'validation', 'test')}
    y = {s: z[s + '_y'] for s in x}
    xtr, xva, xte = S.standardise(x['train'], x['validation'], x['test'])
    inputs = xtr.shape[1]
    out = {}
    t0 = time.time()
    for seed in range(SEEDS):
        for name, qk, wb, sp in S.DESIGNS:
            params, masks, quant = S.train_design(xtr, y['train'], qk, sp, seed, HIDDEN, EPOCHS, BS)
            sc = M.act_scales_from(params, xtr, quant, masks, 8)
            nnz = M.nnz_per_layer(params, quant, masks)
            sparse = sp is not None
            out.setdefault(name, []).append(dict(
                seed=seed, test=M.accuracy(params, xte, y['test'], quant, masks, 8, sc),
                val=M.accuracy(params, xva, y['validation'], quant, masks, 8, sc), nnz=nnz,
                energy_nj=S.energy_nj(nnz, qk, wb, sparse, inputs, HIDDEN),
                storage_kbit=S.storage_kbit(nnz, wb, sparse, inputs, HIDDEN),
                multiplier_free=S.kind_of(qk) == 'signadd'))
            print('seed', seed, name, '%.3f' % out[name][-1]['test'], '%.0fs' % (time.time() - t0), flush=True)
        json.dump(out, open(os.path.join(HERE, 'results.json'), 'w'), indent=1)
    return out


def report():
    r = json.load(open(os.path.join(HERE, 'results.json')))
    base = np.array([v['test'] for v in r['float32 dense']])
    inputs = SEGMENTS * 10
    lines = ['design | test acc mean (sd) | drop vs float32, paired mean (se) | nonzero weights | energy nJ | storage kbit | multiplier-free']
    rows = []
    for name, v in r.items():
        t = np.array([q['test'] for q in v])
        dd = base - t
        nz = np.mean([sum(q['nnz']) for q in v])
        e = np.mean([q['energy_nj'] for q in v])
        s = np.mean([q['storage_kbit'] for q in v])
        rows.append((name, t.mean(), dd.mean(), e, v[0]['multiplier_free']))
        lines.append('%s | %.3f (%.3f) | %+.3f (%.3f) | %.0f | %.2f | %.1f | %s' % (
            name, t.mean(), t.std(ddof=1), dd.mean(), dd.std(ddof=1) / np.sqrt(len(dd)), nz, e, s, v[0]['multiplier_free']))
    lines.append('')
    ref = [e for n, a, dr, e, mf in rows if n == 'int8 dense'][0]
    for tol in (0.01, 0.02, 0.05):
        ok = [(e, n, a) for n, a, dr, e, mf in rows if dr <= tol]
        mfz = [(e, n, a) for n, a, dr, e, mf in rows if dr <= tol and mf]
        e, n, a = min(ok)
        lines.append('cheapest design within %.0f points of float32: %s (acc %.3f, %.2f nJ, %.0f%% of int8 dense)%s' % (
            tol * 100, n, a, e, 100 * e / ref,
            '; cheapest multiplier-free: %s (%.2f nJ)' % (min(mfz)[1], min(mfz)[0]) if mfz else '; no multiplier-free design within tolerance'))
    lines.append('')
    lines.append('sensitivity: multiplier energy scaled by f; cheapest design within 2 points of float32 (all / multiplier-free only)')
    base_e = S.C.E_MULT_8X8_PJ
    for f in (1, 3, 10, 30):
        S.C.E_MULT_8X8_PJ = base_e * f
        best = {}
        for n, v in r.items():
            if base.mean() - np.mean([q['test'] for q in v]) > 0.02:
                continue
            qk, wb, sp = [(d[1], d[2], d[3]) for d in S.DESIGNS if d[0] == n][0]
            best[n] = (np.mean([S.energy_nj(q['nnz'], qk, wb, sp is not None, inputs, HIDDEN) for q in v]), S.kind_of(qk))
        a = min((e, n) for n, (e, k) in best.items())
        m = min((e, n) for n, (e, k) in best.items() if k == 'signadd') if any(k == 'signadd' for e, k in best.values()) else None
        lines.append('f=%g: %s %.2f nJ / %s' % (f, a[1], a[0], '%s %.2f nJ' % (m[1], m[0]) if m else 'no multiplier-free design within 2 points'))
    S.C.E_MULT_8X8_PJ = base_e
    open(os.path.join(HERE, 'results.txt'), 'w').write('\n'.join(lines) + '\n')
    print('\n'.join(lines))


if __name__ == '__main__':
    if '--report' not in sys.argv:
        run(sys.argv[1])
    report()
