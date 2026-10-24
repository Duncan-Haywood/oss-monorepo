"""Integer (Q15) MFCC front end with operation counters, matching accel-kws's float recipe.

Pre-emphasis, Hamming window, 512-point real FFT (a 256-point complex radix-2 FFT plus a
real-split pass), power spectrum, 40 mel filters (the exact non-zero weights of
accel_kws.mfcc.mel_filterbank), log, DCT-II to 10 coefficients. Every multiply, add and
16-bit memory word moved is counted as it happens, so the counts are of this code, not a formula.
"""
import numpy as np

WIN, NFFT, NMEL, NCEP, SR = 480, 512, 40, 10, 16000
HOP = 320
Q = 15
ONE = 1 << Q


class Ops:
    def __init__(self):
        self.mul = self.add = self.mem = self.lut = 0
        self.peak = 0  # largest |value| seen before any right shift in the FFT, to size the word

    def as_dict(self):
        return dict(mul=self.mul, add=self.add, mem=self.mem, lut=self.lut)


def q15(a):
    return np.clip(np.round(np.asarray(a) * ONE), -ONE, ONE - 1).astype(np.int64)


def mel_filterbank(nmel=NMEL, nfft=NFFT, sr=SR, fmin=20.0, fmax=4000.0):
    mel = lambda f: 2595.0 * np.log10(1.0 + f / 700.0)
    imel = lambda m: 700.0 * (10.0 ** (m / 2595.0) - 1.0)
    pts = imel(np.linspace(mel(fmin), mel(fmax), nmel + 2))
    bins = pts / (sr / 2) * (nfft // 2)
    fb = np.zeros((nmel, nfft // 2 + 1))
    k = np.arange(nfft // 2 + 1)
    for i in range(nmel):
        lo, mid, hi = bins[i], bins[i + 1], bins[i + 2]
        fb[i] = np.clip(np.minimum((k - lo) / (mid - lo), (hi - k) / (hi - mid)), 0.0, None)
    return fb


def dct_matrix(nin=NMEL, nout=NCEP):
    n = np.arange(nin)
    k = np.arange(nout)[:, None]
    m = np.cos(np.pi / nin * (n + 0.5) * k) * np.sqrt(2.0 / nin)
    m[0] /= np.sqrt(2.0)
    return m


FB = mel_filterbank()
FB_NZ = [np.nonzero(r)[0] for r in FB]
FBQ = q15(FB)
DCTQ = q15(dct_matrix())
WINQ = q15(np.hamming(WIN))
N2 = NFFT // 2
TW = np.exp(-2j * np.pi * np.arange(N2 // 2) / N2)
TWQ = (q15(TW.real), q15(TW.imag))
SPLIT = np.exp(-2j * np.pi * np.arange(N2 + 1) / NFFT)
SPLQ = (q15(SPLIT.real), q15(SPLIT.imag))


def _bitrev(n):
    bits = n.bit_length() - 1
    return [int(format(i, '0%db' % bits)[::-1], 2) for i in range(n)]


BREV = _bitrev(N2)


def cfft256(re, im, ops, shifts=(1,) * 8):
    """Radix-2 DIT, in place, shifts[s] right shifts after stage s (all ones: the output is X/256)."""
    re = [re[i] for i in BREV]
    im = [im[i] for i in BREV]
    size = 2
    stage = -1
    while size <= N2:
        stage += 1
        sh = shifts[stage]
        half, step = size // 2, N2 // size
        for s in range(0, N2, size):
            for j in range(half):
                wr, wi = TWQ[0][j * step], TWQ[1][j * step]
                a, b = s + j, s + j + half
                tr = (re[b] * wr - im[b] * wi) >> Q
                ti = (re[b] * wi + im[b] * wr) >> Q
                ur, ui = re[a], im[a]
                ops.peak = max(ops.peak, abs(ur + tr), abs(ui + ti), abs(ur - tr), abs(ui - ti))
                re[a], im[a] = (ur + tr) >> sh, (ui + ti) >> sh
                re[b], im[b] = (ur - tr) >> sh, (ui - ti) >> sh
                ops.mul += 4
                ops.add += 6
                ops.mem += 10  # read 2 complex points and 1 twiddle, write 2 complex points
        size *= 2
    return re, im


def frame_cepstra(x, prev, ops, shifts=(1,) * 8):
    """x: WIN int samples (Q15 audio), prev: the sample before x[0] (or x[0]). Returns 10 Q-ints."""
    xs = [int(v) for v in x]
    pre = [xs[0] - ((31785 * prev) >> Q)] + [xs[i] - ((31785 * xs[i - 1]) >> Q) for i in range(1, WIN)]
    ops.mul += WIN; ops.add += WIN; ops.mem += 2 * WIN
    w = [(pre[i] * int(WINQ[i])) >> Q for i in range(WIN)]
    ops.mul += WIN; ops.mem += 2 * WIN
    w += [0] * (NFFT - WIN)
    re = [w[2 * i] for i in range(N2)]
    im = [w[2 * i + 1] for i in range(N2)]
    zr, zi = cfft256(re, im, ops, shifts)
    scale = sum(shifts)  # the spectrum is X / 2^scale
    # real-split: X[k] = (Z[k] + conj Z[N2-k])/2 + W^k * (Z[k] - conj Z[N2-k])/(2j)
    power = []
    for k in range(N2 + 1):
        a, b = k % N2, (N2 - k) % N2
        er, ei = (zr[a] + zr[b]) >> 1, (zi[a] - zi[b]) >> 1
        orr, oi = (zi[a] + zi[b]) >> 1, -((zr[a] - zr[b]) >> 1)
        wr, wi = int(SPLQ[0][k]), int(SPLQ[1][k])
        xr = er + ((orr * wr - oi * wi) >> Q)
        xi = ei + ((orr * wi + oi * wr) >> Q)
        power.append(xr * xr + xi * xi)  # kept at full 32-bit width: a >>15 here floors the noise bins
        ops.mul += 4 + 2; ops.add += 6 + 5 + 1; ops.mem += 4 + 2 + 1
    mel = []
    for m in range(NMEL):
        nz = FB_NZ[m]
        mel.append(sum(power[k] * int(FBQ[m][k]) for k in nz) >> Q)
        # 32-bit power x 16-bit weight into a 48-bit accumulator: counted as 2 multiplies, 3 adds, 3 words moved
        ops.mul += 2 * len(nz); ops.add += 3 * len(nz); ops.mem += 3 * len(nz)
    # log: 16-entry table on the top 4 mantissa bits after normalising, linear interpolation
    logmel = []
    for v in mel:
        v = max(int(v), 1)
        e = v.bit_length() - 1
        frac = (v << 15 >> e) - (1 << 15) if e else 0
        idx, rem = frac >> 11, frac & 0x7FF
        t0 = LOGT[idx]; t1 = LOGT[idx + 1]
        logmel.append(((e << 15) + t0 + (((t1 - t0) * rem) >> 11)) - ((2 * (8 - scale) + 15) << 15))  # undo the FFT scale; power is now Q30 not Q15
        ops.mul += 1; ops.add += 4; ops.lut += 2; ops.mem += 3
    cep = []
    for c in range(NCEP):
        cep.append(sum(logmel[n] * int(DCTQ[c][n]) for n in range(NMEL)) >> Q)
        ops.mul += NMEL; ops.add += NMEL; ops.mem += 2 * NMEL
    return cep


LOGT = [int(round(np.log2(1 + i / 16) * (1 << 15))) for i in range(17)]  # log2 mantissa table, Q15


def float_cepstra(x, prev):
    """The accel-kws recipe, in float, with log2 instead of ln (a constant factor apart)."""
    x = np.asarray(x, float) / ONE
    p = np.concatenate([[x[0] - 0.97 * prev / ONE], x[1:] - 0.97 * x[:-1]])
    f = p * np.hamming(WIN)
    pw = np.abs(np.fft.rfft(f, NFFT)) ** 2
    # the integer path holds |X/256|^2 * 2^15, i.e. float power * 2^15 / 2^16; the integer path floors at 1, the float reference at 1e-12
    return (np.log2(np.maximum(pw @ FB.T * 2.0 ** -1, 1e-12))) @ dct_matrix().T
