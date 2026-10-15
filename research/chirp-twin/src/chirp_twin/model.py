"""FMCW range-Doppler coupling.  A sawtooth chirp of bandwidth B and duration T at carrier fc has slope S = B/T.
A target at range R receding at v produces a beat tone f_b = 2 S R/c + 2 v fc/c, so the range read from the beat is
R + kappa*v with kappa = fc/S = fc T/B.  Twin: reads R.  Real: reads R + kappa*v (up ramp).
The signal-level simulation (exact two-way delay) also shows a second-order term v T (the target moves during the ramp, so
the beat tone is itself chirped and its spectral peak sits at the mean frequency); R below is the range at ramp start."""
import cmath, math

__all__ = ["C", "kappa", "range_bias", "range_read", "bias_cells", "bias_cells_unamb", "unamb_velocity", "beat_signal", "fft",
           "peak_frequency", "measured_range", "wrap", "corrected_error", "corrected_error_cells", "worse_than_none",
           "ring_cos2_mean", "ring_translation_bias", "ring_residual_rms", "ring_rigid_residual_rms"]

C = 299792458.0


def kappa(fc, T, B):
    """Range read per unit radial speed (seconds): fc/S = fc T / B."""
    return fc * T / B


def range_bias(v, fc, T, B):
    return kappa(fc, T, B) * v


def range_read(R0, v, fc, T, B):
    """Range an up-ramp radar reads from the spectral peak: R0 + kappa v + v T (R0 = range at ramp start)."""
    return R0 + kappa(fc, T, B) * v + v * T


def bias_cells(v, fc, T):
    """Bias in range cells (c/2B): kappa v / (c/2B) = 2 fc T v/c = f_D T.  Independent of B."""
    return 2 * fc * T * v / C


def unamb_velocity(fc, Tpri):
    return (C / fc) / (4 * Tpri)


def bias_cells_unamb(v, V, T, Tpri):
    """Same, written with the unambiguous speed V = lambda/(4 Tpri): (v/V) T/(2 Tpri)."""
    return (v / V) * T / (2 * Tpri)


def beat_signal(R0, v, fc, B, T, fs, N):
    """Complex beat samples for a constant-speed target, exact two-way delay tau = 2(R0+v t)/(c+v):
    phase = 2 pi (fc tau + S t tau - S tau^2/2) (up ramp)."""
    S = B / T
    out = []
    for n in range(N):
        t = n / fs
        tau = 2 * (R0 + v * t) / (C + v)
        out.append(cmath.exp(2j * math.pi * (fc * tau + S * t * tau - S * tau * tau / 2)))
    return out


def fft(x):
    n = len(x)
    if n == 1:
        return list(x)
    e, o = fft(x[0::2]), fft(x[1::2])
    w = [cmath.exp(-2j * math.pi * k / n) * o[k] for k in range(n // 2)]
    return [e[k] + w[k] for k in range(n // 2)] + [e[k] - w[k] for k in range(n // 2)]


def peak_frequency(x, fs, pad=16384):
    """Hann window, zero pad, peak bin refined by a parabola through the log magnitudes (positive frequencies)."""
    N = len(x)
    xs = [x[n] * (0.5 - 0.5 * math.cos(2 * math.pi * n / N)) for n in range(N)] + [0j] * (pad - N)
    m = [abs(z) for z in fft(xs)[: pad // 2]]
    k = max(range(1, len(m) - 1), key=lambda i: m[i])
    a, b, c = (math.log(m[k - 1]), math.log(m[k]), math.log(m[k + 1]))
    d = 0.5 * (a - c) / (a - 2 * b + c)
    return (k + d) * fs / pad


def measured_range(R0, v, fc, B, T, fs=None, N=None):
    """Range an up-ramp radar reads from the spectral peak of the simulated beat tone."""
    S = B / T
    if fs is None:
        fs = 4 * (2 * S * (R0 + abs(v) * T) / C + 2 * abs(v) * fc / C)
    if N is None:
        N = int(round(fs * T))
    f = peak_frequency(beat_signal(R0, v, fc, B, T, fs, N), fs)
    return C * f / (2 * S)


def wrap(v, V):
    return v - 2 * V * math.floor((v + V) / (2 * V))


def corrected_error(v, fc, T, B, Tpri):
    """Range error after subtracting kappa * (wrapped Doppler speed): kappa (v - wrap(v)) = 2 kappa V k, k = round(v/2V)."""
    V = unamb_velocity(fc, Tpri)
    return kappa(fc, T, B) * (v - wrap(v, V))


def corrected_error_cells(v, V, T, Tpri):
    """In range cells: (T/Tpri) * k, k = (v - wrap(v))/2V.  Uncorrected is (v/V) T/(2 Tpri) = x (T/Tpri), x = v/2V."""
    return (T / Tpri) * (v - wrap(v, V)) / (2 * V)


def worse_than_none(v, V):
    """Wrapped-Doppler compensation leaves |k| units where doing nothing leaves |x| = |v|/2V: worse iff |k| > |x|."""
    return abs((v - wrap(v, V)) / (2 * V)) > abs(v / (2 * V)) + 1e-12


def ring_cos2_mean(phi):
    """<cos^2 theta> for theta uniform on [-phi, phi]."""
    return 0.5 + math.sin(2 * phi) / (4 * phi)


def ring_translation_bias(kv, phi):
    """Stationary scene, ego forward at v: each point's range is read short by kappa v cos(theta), a shift kappa v cos(theta)
    toward the radar along the ray.  Mean (centroid) shift along the direction of travel = kappa v <cos^2>."""
    return kv * ring_cos2_mean(phi)


def ring_residual_rms(kv, phi):
    """RMS of the shift field after removing its mean (translation): kv sqrt(c2 - c2^2)."""
    c2 = ring_cos2_mean(phi)
    return kv * math.sqrt(c2 - c2 * c2)


def ring_rigid_residual_rms(kv, phi, r, n=2001):
    """Numerical rigid (rotation + translation) 2-D Procrustes residual rms for points on a ring of radius r,
    azimuths uniform on [-phi, phi], each moved by -kv cos(theta) along its ray."""
    P, Q = [], []
    for i in range(n):
        th = -phi + 2 * phi * i / (n - 1)
        P.append((r * math.cos(th), r * math.sin(th)))
        rr = r - kv * math.cos(th)
        Q.append((rr * math.cos(th), rr * math.sin(th)))
    pm = (sum(p[0] for p in P) / n, sum(p[1] for p in P) / n)
    qm = (sum(q[0] for q in Q) / n, sum(q[1] for q in Q) / n)
    a = sum((p[0] - pm[0]) * (q[0] - qm[0]) + (p[1] - pm[1]) * (q[1] - qm[1]) for p, q in zip(P, Q))
    b = sum((p[0] - pm[0]) * (q[1] - qm[1]) - (p[1] - pm[1]) * (q[0] - qm[0]) for p, q in zip(P, Q))
    th = math.atan2(b, a)
    c, s = math.cos(th), math.sin(th)
    err = 0.0
    for p, q in zip(P, Q):
        x, y = p[0] - pm[0], p[1] - pm[1]
        rx, ry = c * x - s * y + qm[0], s * x + c * y + qm[1]
        err += (rx - q[0]) ** 2 + (ry - q[1]) ** 2
    return math.sqrt(err / n)
