"""Block-floating-point 16-bit MFCC front end, built on accel-frontend's Q15 recipe.

accel-frontend found that a fixed FFT shift schedule must trade quiet-input accuracy against
loud-input overflow in a 16-bit word. Here the whole 256-point complex FFT shares one exponent
that is chosen from the data: the input is shifted left until its largest component is as big
as the first stage can take, and after every stage the block is shifted right by one only if the
next stage could overflow. Everything else (window, split pass, 32-bit power, mel, log, DCT)
is accel-frontend's code path, copied with the single change of the scale it undoes.
"""
import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', '..', '..', 'accel-frontend', 'src'))
from accel_frontend import frontend as F
from accel_frontend.frontend import Q, WIN, NFFT, N2, NMEL, NCEP, WINQ, SPLQ, FBQ, FB_NZ, DCTQ, LOGT, BREV, TWQ

# A butterfly output component is at most |a| + |w b| <= (1 + sqrt 2) * max(component), so a
# 16-bit signed word (32767) is safe while the input component magnitude is at most:
SAFE = int(32767 / (1 + 2 ** 0.5))   # 13573


def cfft256_bfp(re, im, ops, word=SAFE):
    """Radix-2 DIT with one shared exponent. Returns (re, im, net_shift) where the output is
    X / 2^net_shift (net_shift can be negative: the block was scaled up)."""
    re = [re[i] for i in BREV]
    im = [im[i] for i in BREV]
    m = max(max(abs(v) for v in re), max(abs(v) for v in im))
    ops.add += 2 * N2          # input peak detect
    k = 0
    while m and (m << (k + 1)) <= word:
        k += 1
    if k:
        re = [v << k for v in re]; im = [v << k for v in im]
    net = -k
    size, stage = 2, -1
    peak_in = max(m << k, 1)
    while size <= N2:
        stage += 1
        sh = 1 if peak_in > word else 0
        half, step = size // 2, N2 // size
        out_peak = 0
        for s in range(0, N2, size):
            for j in range(half):
                wr, wi = TWQ[0][j * step], TWQ[1][j * step]
                a, b = s + j, s + j + half
                tr = (re[b] * wr - im[b] * wi) >> Q
                ti = (re[b] * wi + im[b] * wr) >> Q
                ur, ui = re[a], im[a]
                o = (ur + tr, ui + ti, ur - tr, ui - ti)
                ops.peak = max(ops.peak, *(abs(v) for v in o))   # the word width this stage needs before the shift
                re[a], im[a] = o[0] >> sh, o[1] >> sh
                re[b], im[b] = o[2] >> sh, o[3] >> sh
                out_peak = max(out_peak, abs(re[a]), abs(im[a]), abs(re[b]), abs(im[b]))
                ops.mul += 4
                ops.add += 6 + 4   # 6 for the butterfly, 4 compares for the running peak
                ops.mem += 10
        ops.stored = max(getattr(ops, 'stored', 0), out_peak)   # largest value actually written back to a 16-bit memory word
        net += sh
        peak_in = max(out_peak, 1)
        size *= 2
    return re, im, net


def frame_cepstra_bfp(x, prev, ops):
    """Same as accel_frontend.frame_cepstra, with the FFT replaced by the block-floating-point one."""
    xs = [int(v) for v in x]
    pre = [xs[0] - ((31785 * prev) >> Q)] + [xs[i] - ((31785 * xs[i - 1]) >> Q) for i in range(1, WIN)]
    ops.mul += WIN; ops.add += WIN; ops.mem += 2 * WIN
    w = [(pre[i] * int(WINQ[i])) >> Q for i in range(WIN)]
    ops.mul += WIN; ops.mem += 2 * WIN
    w += [0] * (NFFT - WIN)
    zr, zi, scale = cfft256_bfp([w[2 * i] for i in range(N2)], [w[2 * i + 1] for i in range(N2)], ops)
    power = []
    for kk in range(N2 + 1):
        a, b = kk % N2, (N2 - kk) % N2
        er, ei = (zr[a] + zr[b]) >> 1, (zi[a] - zi[b]) >> 1
        orr, oi = (zi[a] + zi[b]) >> 1, -((zr[a] - zr[b]) >> 1)
        wr, wi = int(SPLQ[0][kk]), int(SPLQ[1][kk])
        xr = er + ((orr * wr - oi * wi) >> Q)
        xi = ei + ((orr * wi + oi * wr) >> Q)
        power.append(xr * xr + xi * xi)
        ops.mul += 4 + 2; ops.add += 6 + 5 + 1; ops.mem += 4 + 2 + 1
    mel = []
    for m in range(NMEL):
        nz = FB_NZ[m]
        mel.append(sum(power[kk] * int(FBQ[m][kk]) for kk in nz) >> Q)
        ops.mul += 2 * len(nz); ops.add += 3 * len(nz); ops.mem += 3 * len(nz)
    logmel = []
    for v in mel:
        v = max(int(v), 1)
        e = v.bit_length() - 1
        frac = (v << 15 >> e) - (1 << 15) if e else 0
        idx, rem = frac >> 11, frac & 0x7FF
        t0 = LOGT[idx]; t1 = LOGT[idx + 1]
        logmel.append(((e << 15) + t0 + (((t1 - t0) * rem) >> 11)) - ((2 * (8 - scale) + 15) << 15))
        ops.mul += 1; ops.add += 4; ops.lut += 2; ops.mem += 3
    cep = []
    for c in range(NCEP):
        cep.append(sum(logmel[n] * int(DCTQ[c][n]) for n in range(NMEL)) >> Q)
        ops.mul += NMEL; ops.add += NMEL; ops.mem += 2 * NMEL
    return cep, scale
