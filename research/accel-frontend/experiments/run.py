"""Operation counts, energy and fixed-point error of the integer MFCC front end. Writes results.json/.txt."""
import json, os, sys
import numpy as np
H = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(H, '..', 'src'))
sys.path.insert(0, os.path.join(H, '..', '..', 'accel-kws', 'src'))
from accel_frontend import frontend as F
from accel_kws import cost, mfcc as KM

rng = np.random.default_rng(0)
t = np.arange(F.WIN) / F.SR


def voiced(level_db, seed):
    """Synthetic speech-like frame: harmonics of f0 under a three-formant envelope plus a fixed -61 dBFS microphone noise floor."""
    r = np.random.default_rng(seed)
    f0 = r.uniform(90, 250)
    forms = r.uniform([300, 900, 2200], [800, 2200, 3200])
    x = np.zeros(F.WIN)
    for h in range(1, int(4000 // f0)):
        f = h * f0
        amp = sum(np.exp(-0.5 * ((f - fc) / 150.0) ** 2) for fc in forms) + 0.02
        x += amp * np.sin(2 * np.pi * f * t + r.uniform(0, 6.28))
    x += r.normal(0, 0.01 * x.std(), F.WIN)
    # the microphone's own noise floor: 61 dB SNR (Adafruit PDM MEMS breakout, per ambient-wearable) puts it at -61 dBFS RMS
    return x / x.std() * 10 ** (level_db / 20) + r.normal(0, 10 ** (-61 / 20), F.WIN)


def count(shifts=(1,) * 8):
    x = F.q15(voiced(-20, 0)); o = F.Ops()
    F.frame_cepstra(x, int(x[0]), o, shifts)
    return o


def error(level_db, shifts, n=20):
    errs, peaks = [], []
    for s in range(n):
        x = F.q15(voiced(level_db, s)); o = F.Ops()
        c = np.array(F.frame_cepstra(x, int(x[0]), o, shifts)) / F.ONE
        ref = F.float_cepstra(x, int(x[0]))
        errs.append(np.sqrt(np.mean((c[1:] - ref[1:]) ** 2)))
        peaks.append(o.peak)
    return float(np.mean(errs)), int(np.max(peaks))


# cepstral spread of the float front end over the same synthetic frames (the yardstick for the error)
spread = float(np.mean([np.std(F.float_cepstra(F.q15(voiced(-20, s)), 0)[1:]) for s in range(20)]))

o = count()
res = {'ops_per_frame': o.as_dict(), 'cep_spread': spread}
nz = int(sum(len(r) for r in F.FB_NZ))
res['mel_macs'] = nz

# Classifier: accel-kws 70-64-11, 4-bit weights, as in its README table
macs = 70 * 64 + 64 * 11
res['clf_macs'] = macs
clf_pj = macs * cost.energy_per_mac_pj(4)
res['clf_nj'] = clf_pj / 1000

# Front-end energy: 16-bit datapath, constants scaled from cost.py's 8-bit ones
def fe_pj(o, k_mul=1.0, k_add=1.0, k_mem=1.0):
    mul = cost.E_MULT_8X8_PJ * (16 * 16) / (8 * 8)   # multiply energy ~ bits^2
    add = cost.E_ADD_32_PJ * 16 / 32                 # add energy ~ bits
    mem = cost.E_SRAM_PJ_PER_BIT * 16                # one 16-bit word read or write
    return o.mul * mul * k_mul + o.add * add * k_add + o.mem * mem * k_mem + o.lut * mem
res['fe_frame_nj'] = fe_pj(o) / 1000
res['fe_frame_nj_arith_only'] = fe_pj(o, k_mem=0) / 1000

INF = 4.0   # accel-kws's inference rate
FPS = 1 / (F.HOP / F.SR)   # 50 frames per second when frames are computed once
rows = []
for name, fps in [('stream: each frame computed once', FPS), ('naive: 49 frames recomputed per inference', 49 * INF)]:
    for lab, k in [('assumed constants', (1, 1, 1)), ('arithmetic only', (1, 1, 0)), ('multiply x1/3', (1/3, 1, 1)), ('memory x3', (1, 1, 3)), ('memory x1/3', (1, 1, 1/3))]:
        fe_uw = fe_pj(o, *k) * fps * 1e-6
        clf_uw = clf_pj * INF * 1e-6
        rows.append(dict(scheme=name, constants=lab, fe_uW=fe_uw, clf_uW=clf_uw, ratio=fe_uw / clf_uw))
res['power'] = rows

# Alternative: decimate by 2 and take a 256-point FFT of 240-sample frames (band is 4 kHz = fmax)
o256_fft_mul = 4 * (128 // 2) * 7        # 7 stages of 64 butterflies of 128-pt complex FFT
o512_fft_mul = 4 * (256 // 2) * 8
saved_per_s = (o512_fft_mul - o256_fft_mul) * FPS
res['decimate'] = dict(fft_mul_512=o512_fft_mul, fft_mul_256=o256_fft_mul, saved_mul_per_s=saved_per_s,
                       breakeven_macs_per_output_sample=saved_per_s / (F.SR / 2))

# Fixed-point fidelity vs level and shift schedule
fid = []
for sched_name, sh in [('1 shift per stage (8)', (1,) * 8), ('4 shifts (stages 1-4)', (1, 1, 1, 1, 0, 0, 0, 0)), ('2 shifts (stages 1-2)', (1, 1, 0, 0, 0, 0, 0, 0))]:
    for lvl in (-50, -40, -30, -20, -10):
        e, pk = error(lvl, sh)
        fid.append(dict(schedule=sched_name, level_dbfs=lvl, rms_cep_error=e, rel_to_spread=e / spread, peak=pk, bits=int(pk).bit_length() + 1))
res['fidelity'] = fid

# Instrumented count vs closed form for the FFT
res['fft_butterflies'] = 8 * 128
json.dump(res, open(os.path.join(H, 'results.json'), 'w'), indent=1)
with open(os.path.join(H, 'results.txt'), 'w') as f:
    f.write('ops per frame: %s\nmel nonzero weights: %d  classifier MACs: %d\n' % (o.as_dict(), nz, macs))
    f.write('front end %.1f nJ/frame (arith only %.1f), classifier %.2f nJ/inference\n' % (res['fe_frame_nj'], res['fe_frame_nj_arith_only'], res['clf_nj']))
    for r in rows:
        f.write('%-45s %-18s fe %.4f uW  clf %.4f uW  ratio %.1f\n' % (r['scheme'], r['constants'], r['fe_uW'], r['clf_uW'], r['ratio']))
    f.write('decimate: %s\n' % res['decimate'])
    f.write('cepstral spread (synthetic voiced, -20 dBFS): %.2f\n' % spread)
    for r in fid:
        f.write('%-26s %4d dBFS  err %.3f (%.2f of spread)  peak %d (%d bits)\n' % (r['schedule'], r['level_dbfs'], r['rms_cep_error'], r['rel_to_spread'], r['peak'], r['bits']))
print(open(os.path.join(H, 'results.txt')).read())
