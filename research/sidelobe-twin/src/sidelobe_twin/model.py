"""Pulse-compression sidelobes: ideal point-response radar twin vs a real matched filter, stylised.

Range axis x is in resolution cells (1/B). A point target gives the output response rho_w(x) = W_w(x)/W_w(0), where W_w is the
Fourier transform of the processing window w (rect: sinc; Hann and Hamming: closed-form sums of shifted sincs). Output-cell
noise is circular complex Gaussian with unit power, so a target of peak SNR S (linear, after processing) has peak amplitude
sqrt(S). A taper costs peak SNR by its equivalent noise bandwidth ENBW. The twin keeps only the peak: a target contributes
nothing outside its own cell. The cell threshold is T^2 = -ln(Pfa0) in power.
"""
import math

ENBW = {"rect": 1.0, "hann": 1.5, "hamming": (0.54 ** 2 + 0.46 ** 2 / 2) / 0.54 ** 2}
_COEF = {"hann": 0.5, "hamming": 0.54}


def sinc(x):
    if x == 0:
        return 1.0
    return math.sin(math.pi * x) / (math.pi * x)


def resp(window, x):
    """Normalised point response, equal to 1 at x = 0."""
    if window == "rect":
        return sinc(x)
    a = _COEF[window]
    b = (1 - a) / 2
    return (a * sinc(x) + b * (sinc(x - 1) + sinc(x + 1))) / a


def db(p):
    return 10 * math.log10(p)


def undb(d):
    return 10 ** (d / 10)


def peak_sidelobe(window, x_max=40.0, step=0.001):
    """(level, location) of the largest |rho| beyond the first null (1 for rect, 2 for the tapers)."""
    best, xb, x = 0.0, 0.0, (1.0 if window == "rect" else 2.0) + step
    while x < x_max:
        v = abs(resp(window, x))
        if v > best:
            best, xb = v, x
        x += step
    return best, xb


def width_3db(window):
    """Full width (cells) at which the power response falls to 1/2."""
    lo, hi = 0.0, 1.5
    for _ in range(60):
        mid = (lo + hi) / 2
        if resp(window, mid) ** 2 > 0.5:
            lo = mid
        else:
            hi = mid
    return 2 * lo


def marcum_sf(nu, t2):
    """P(|nu + n|^2 > t2) for n ~ CN(0,1): the Rician exceedance, Marcum Q1(sqrt(2) nu, sqrt(2 t2)).
    Poisson mixture: sum_k Pois(k; nu^2) * P(Pois(t2) <= k)."""
    lam = nu * nu
    if lam == 0:
        return math.exp(-t2)
    hi = int(lam + 12 * math.sqrt(lam) + max(40, 3 * t2))
    ll = math.log(lam)
    cdf, pm, tot = 0.0, math.exp(-t2), 0.0
    for k in range(hi + 1):
        cdf += pm
        tot += math.exp(-lam + k * ll - math.lgamma(k + 1)) * min(cdf, 1.0)
        pm = pm * t2 / (k + 1)
    return min(max(tot, 0.0), 1.0)


def thresh_power(pfa0):
    return -math.log(pfa0)


def amp(window, snr_db):
    """Peak amplitude (noise std 1) of a target of the given raw SNR after the taper's ENBW loss."""
    return math.sqrt(undb(snr_db) / ENBW[window])


def ghost_pfa(window, s_db, x, pfa0=1e-6):
    """Real: false-alarm probability at a cell x cells from a lone strong target of SNR s_db. The twin says pfa0."""
    return marcum_sf(amp(window, s_db) * abs(resp(window, x)), thresh_power(pfa0))


def ghost_free_snr_db(window, x, pfa_max, pfa0=1e-6):
    """Largest strong-target SNR (dB) whose ghost at cell x stays at or below pfa_max."""
    lo, hi = -10.0, 140.0
    for _ in range(60):
        mid = (lo + hi) / 2
        if ghost_pfa(window, mid, x, pfa0) <= pfa_max:
            lo = mid
        else:
            hi = mid
    return lo


def ghost_zone_radius(window, s_db, pfa_max, pfa0=1e-6, x_max=1000.0):
    """Smallest integer offset (cells) beyond which every lobe's ghost Pfa is <= pfa_max (each unit interval is sampled at 1/8 cell)."""
    t2 = thresh_power(pfa0)
    a = amp(window, s_db)
    last, x = (1 if window == "rect" else 2), (1.0 if window == "rect" else 2.0)
    while x < x_max:
        w = max(abs(resp(window, x + i / 8.0)) for i in range(8))
        if marcum_sf(a * w, t2) > pfa_max:
            last = int(x) + 1
        x += 1.0
    return last


def pd_twin(window, w_db, pfa0=1e-6):
    return marcum_sf(amp(window, w_db), thresh_power(pfa0))


def pd_real(window, s_db, w_db, x, pfa0=1e-6, nphi=256):
    """Detection probability of a weak target (SNR w_db) at cell x from a strong one (s_db), uniform relative phase."""
    sa = amp(window, s_db) * resp(window, x)
    wa = amp(window, w_db)
    t2 = thresh_power(pfa0)
    tot = 0.0
    for i in range(nphi):
        ph = 2 * math.pi * (i + 0.5) / nphi
        tot += marcum_sf(abs(complex(sa + wa * math.cos(ph), wa * math.sin(ph))), t2)
    return tot / nphi
