"""Cepstral error of a 16-bit block-floating-point FFT front end against fixed shift schedules, and its extra cost."""
import json, os, sys
import numpy as np
H = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(H, '..', 'src'))
from accel_frontendbfp import bfp
F = bfp.F

t = np.arange(F.WIN) / F.SR


def voiced(level_db, seed):
    """Same synthetic frame as accel-frontend/experiments/run.py (copied: that file runs its experiment on import)."""
    r = np.random.default_rng(seed)
    f0 = r.uniform(90, 250)
    forms = r.uniform([300, 900, 2200], [800, 2200, 3200])
    x = np.zeros(F.WIN)
    for h in range(1, int(4000 // f0)):
        f = h * f0
        amp = sum(np.exp(-0.5 * ((f - fc) / 150.0) ** 2) for fc in forms) + 0.02
        x += amp * np.sin(2 * np.pi * f * t + r.uniform(0, 6.28))
    x += r.normal(0, 0.01 * x.std(), F.WIN)
    return x / x.std() * 10 ** (level_db / 20) + r.normal(0, 10 ** (-61 / 20), F.WIN)


N = 40
LEVELS = (-60, -50, -40, -30, -20, -10, -3)
spread = float(np.mean([np.std(F.float_cepstra(F.q15(voiced(-20, s)), 0)[1:]) for s in range(20)]))
SCHED = [('fixed, 1 shift per stage (8)', (1,) * 8), ('fixed, 4 shifts', (1,) * 4 + (0,) * 4), ('fixed, 2 shifts', (1, 1) + (0,) * 6)]
rows = []
for lvl in LEVELS:
    for name, sh in SCHED + [('block floating point', None)]:
        errs, peaks, nets, stored = [], [], [], []
        for s in range(N):
            x = F.q15(voiced(lvl, s)); o = F.Ops()
            if sh is None:
                c, net = bfp.frame_cepstra_bfp(x, int(x[0]), o); nets.append(net); stored.append(o.stored)
            else:
                c = F.frame_cepstra(x, int(x[0]), o, sh)
            c = np.array(c) / F.ONE
            errs.append(np.sqrt(np.mean((c[1:] - F.float_cepstra(x, int(x[0]))[1:]) ** 2)))
            peaks.append(o.peak)
        rows.append(dict(scheme=name, level_dbfs=lvl, rel_err=float(np.mean(errs)) / spread, peak_bits=int(max(peaks)).bit_length() + 1,
                         net_shift_mean=float(np.mean(nets)) if nets else None, max_stored=int(max(stored)) if stored else None))
x = F.q15(voiced(-20, 0)); o0 = F.Ops(); F.frame_cepstra(x, int(x[0]), o0)
o1 = F.Ops(); bfp.frame_cepstra_bfp(x, int(x[0]), o1)
res = dict(spread=spread, n_frames=N, rows=rows, ops_fixed=o0.as_dict(), ops_bfp=o1.as_dict())
json.dump(res, open(os.path.join(H, 'results.json'), 'w'), indent=1)
with open(os.path.join(H, 'results.txt'), 'w') as f:
    f.write('cepstral spread %.2f, %d frames per point\nops fixed %s\nops bfp   %s\n' % (spread, N, o0.as_dict(), o1.as_dict()))
    for r in rows:
        f.write('%-30s %4d dBFS  err/spread %.3f  peak %2d bits%s\n' % (r['scheme'], r['level_dbfs'], r['rel_err'], r['peak_bits'],
                '' if r['net_shift_mean'] is None else '  mean net shift %.2f  largest stored word %d' % (r['net_shift_mean'], r['max_stored'])))
print(open(os.path.join(H, 'results.txt')).read())
