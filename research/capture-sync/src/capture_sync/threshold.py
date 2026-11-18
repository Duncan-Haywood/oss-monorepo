"""Threshold (gross-error) theory for windowed GCC delay estimates, fed with each window's measured spectra.

Ianniello (1982) showed that below a threshold SNR a cross-correlation delay estimate stops being a small
error around the true delay and jumps to a wrong peak anywhere in the search range. His model: the
correlator output at the true lag is Gaussian with mean mu and spread sigma0; the outputs at the wrong
lags are zero-mean Gaussian with spread sigma1; the estimate fails when the largest wrong-lag output beats
the true-lag one. This module evaluates that model for the generalised (weighted) correlator

    r(tau) = int_band W(f) Gxy_hat(f) e^{j 2 pi f tau} df,     W(f) = (Gxx(f) Gyy(f))^(-gamma/2)

over a window of L seconds, with one-sided spectral densities (units^2/Hz):

    mu       = max_{|tau| <= tol} int W Re(Gxy e^{j2 pi f tau}) df              (mean output at the true lag)
    sigma1^2 = 1/(2L) int W^2 Gxx Gyy df                                          (wrong lags)
    sigma0^2 = 1/(2L) int W^2 (Gxx Gyy + Re(Gxy^2)) df                            (true lag)

(the variance of a time-averaged product of jointly Gaussian processes; Knapp and Carter 1976, eq. 20ff).
gamma = 0 is Ianniello's plain correlator; gamma = 1 with smoothed spectra is the SCOT weighting. The GCC in
`sync.gcc` instead divides each FFT bin by its own raw |X Y*|^gamma; `gcc_fixed` below uses the smooth
W so the theory and an estimator can be compared like for like, and the gap to the raw-bin weighting is a
measured quantity, not an assumption.

Two models for the largest of the wrong-lag outputs over a span T of lags:
  * "cells" (Ianniello): M = 2 B_eff T independent Gaussians, B_eff = (int P)^2 / int P^2, P = W^2 Gxx Gyy;
  * "rice": Phi(x/sigma1) exp(-T nu e^{-x^2/2 sigma1^2}), nu = sqrt(int f^2 P / int P) (Rice 1944 upcrossings).

Gaussian, stationary signals are assumed; speech, reverberation and real noise break that, and how far is
what the experiments measure.
"""
import numpy as np
from scipy.special import log_ndtr

FS = 16000
_trapz = getattr(np, "trapezoid", None) or np.trapz  # numpy < 2 has only trapz


def welch(a, b, fs=FS, nperseg=512):
    """One-sided density spectra of two aligned, equal-length windows from non-overlapping Hann segments.
    Returns f, Gxx, Gyy, Gxy (complex, E[X* Y]), n_seg."""
    a = np.asarray(a, float) - np.mean(a)
    b = np.asarray(b, float) - np.mean(b)
    n = min(len(a), len(b)) // nperseg
    if n < 1:
        raise ValueError("window shorter than one segment")
    w = np.hanning(nperseg)
    A = np.fft.rfft(a[:n * nperseg].reshape(n, nperseg) * w, axis=1)
    B = np.fft.rfft(b[:n * nperseg].reshape(n, nperseg) * w, axis=1)
    scale = 2.0 / (fs * np.sum(w ** 2))  # one-sided density; DC/Nyquist doubling is irrelevant in band
    f = np.fft.rfftfreq(nperseg, 1.0 / fs)
    return (f, scale * np.mean(np.abs(A) ** 2, 0), scale * np.mean(np.abs(B) ** 2, 0),
            scale * np.mean(np.conj(A) * B, 0), n)


def moments(f, Gxx, Gyy, Gxy, L, gamma, band=(100.0, 4000.0), tol_s=1e-3):
    """mu, sigma0, sigma1 and the wrong-lag spectrum P (on the band) for a window of L seconds."""
    m = (f >= band[0]) & (f <= band[1])
    f, Gxx, Gyy, Gxy = f[m], Gxx[m], Gyy[m], Gxy[m]
    df = f[1] - f[0]
    W = (Gxx * Gyy + 1e-300) ** (-gamma / 2)
    taus = np.linspace(-tol_s, tol_s, 33)
    mu = float(np.max(np.real(np.exp(2j * np.pi * np.outer(taus, f)) @ (W * Gxy))) * df)
    k = int(np.argmax(np.real(np.exp(2j * np.pi * np.outer(taus, f)) @ (W * Gxy))))
    g = Gxy * np.exp(2j * np.pi * f * taus[k])  # cross spectrum at the best lag (its real part carries mu)
    P = W ** 2 * Gxx * Gyy
    s1 = float(np.sqrt(np.sum(P) * df / (2 * L)))
    s0 = float(np.sqrt(max(np.sum(W ** 2 * (Gxx * Gyy + np.real(g ** 2))) * df, 0.0) / (2 * L)))
    return mu, s0, s1, f, P


def p_fail(mu, s0, s1, f, P, span_s, model="cells", n=801):
    """Probability that the largest wrong-lag output over span_s seconds of lag beats the true-lag output."""
    if s1 <= 0:
        return 0.0
    lo = min(mu - 8 * s0, -2 * s1)
    hi = max(mu + 8 * s0, 12 * s1)
    x = np.linspace(lo, hi, n)
    dens = np.exp(-0.5 * ((x - mu) / s0) ** 2) / (s0 * np.sqrt(2 * np.pi))
    z = x / s1
    if model == "cells":
        beff = np.sum(P) ** 2 / np.sum(P ** 2) * (f[1] - f[0])
        M = max(1.0, 2 * beff * span_s)
        logF = M * log_ndtr(z)
    elif model == "rice":
        nu = np.sqrt(np.sum(f ** 2 * P) / np.sum(P))
        logF = log_ndtr(z) - span_s * nu * np.exp(-0.5 * z ** 2)
    else:
        raise ValueError(model)
    ok = _trapz(dens * np.exp(logF), x)
    return float(min(1.0, max(0.0, 1.0 - ok)))


def predict(a, b_aligned, L, gamma, span_s, model="cells", nperseg=512, fs=FS, band=(100.0, 4000.0)):
    """Predicted gross-error probability for one window from its own aligned recordings. With
    model="both" returns (cells, rice)."""
    f, Gxx, Gyy, Gxy, _ = welch(a, b_aligned, fs, nperseg)
    mu, s0, s1, fb, P = moments(f, Gxx, Gyy, Gxy, L, gamma, band)
    if model == "both":
        return p_fail(mu, s0, s1, fb, P, span_s, "cells"), p_fail(mu, s0, s1, fb, P, span_s, "rice")
    return p_fail(mu, s0, s1, fb, P, span_s, model)


def gcc_fixed(a, b, gamma, fs=FS, max_lag_s=1.0, band=(100.0, 4000.0), centre_s=0.0, nperseg=512):
    """GCC with a smooth weight W = (Gxx Gyy)^(-gamma/2) from Welch spectra of a and of b (all of b), the
    estimator the theory describes. Returns the delay of b behind a (s) on the same lag convention as
    sync.gcc."""
    a = np.asarray(a, float) - np.mean(a)
    b = np.asarray(b, float) - np.mean(b)
    fw, ga, _, _, _ = welch(a, a, fs, nperseg)
    _, gb, _, _, _ = welch(b, b, fs, nperseg)
    n = len(a) + len(b)
    nfft = 1 << (n - 1).bit_length()
    A, B = np.fft.rfft(a, nfft), np.fft.rfft(b, nfft)
    fr = np.fft.rfftfreq(nfft, 1.0 / fs)
    w = np.interp(fr, fw, (ga * gb + 1e-300) ** (-gamma / 2))
    c = B * np.conj(A) * w
    c[(fr < band[0]) | (fr > band[1])] = 0
    cc = np.fft.irfft(c, nfft)
    lags = np.arange(int(round((centre_s - max_lag_s) * fs)), int(round((centre_s + max_lag_s) * fs)) + 1)
    k = int(np.argmax(cc[lags % nfft]))
    return lags[k] / fs
