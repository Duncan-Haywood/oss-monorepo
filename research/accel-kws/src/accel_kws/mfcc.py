"""MFCC front end in plain NumPy (written for this project; standard recipe).

Pre-emphasis, 30 ms Hamming frames at a 20 ms hop, 512-point FFT power spectrum, 40 triangular
mel filters between 20 Hz and 4 kHz, log, DCT-II, first 10 coefficients. A 1 s clip at 16 kHz
gives 49 frames.
"""
import numpy as np

SR = 16000
CLIP = 16000
WIN = 480
HOP = 320
NFFT = 512
NMEL = 40
NCEP = 10
NFRAMES = 1 + (CLIP - WIN) // HOP  # 49


def _mel(f):
    return 2595.0 * np.log10(1.0 + f / 700.0)


def _imel(m):
    return 700.0 * (10.0 ** (m / 2595.0) - 1.0)


def mel_filterbank(nmel=NMEL, nfft=NFFT, sr=SR, fmin=20.0, fmax=4000.0):
    pts = _imel(np.linspace(_mel(fmin), _mel(fmax), nmel + 2))
    bins = pts / (sr / 2) * (nfft // 2)
    fb = np.zeros((nmel, nfft // 2 + 1))
    k = np.arange(nfft // 2 + 1)
    for i in range(nmel):
        lo, mid, hi = bins[i], bins[i + 1], bins[i + 2]
        up = (k - lo) / (mid - lo)
        down = (hi - k) / (hi - mid)
        fb[i] = np.clip(np.minimum(up, down), 0.0, None)
    return fb


def dct_matrix(nin=NMEL, nout=NCEP):
    n = np.arange(nin)
    k = np.arange(nout)[:, None]
    m = np.cos(np.pi / nin * (n + 0.5) * k) * np.sqrt(2.0 / nin)
    m[0] /= np.sqrt(2.0)
    return m


_FB = mel_filterbank()
_DCT = dct_matrix()
_WINDOW = np.hamming(WIN)


def mfcc(clips):
    """clips: (N, 16000) float array in [-1, 1]. Returns (N, 49, 10) float64."""
    x = np.asarray(clips, dtype=np.float64)
    x = np.concatenate([x[:, :1], x[:, 1:] - 0.97 * x[:, :-1]], axis=1)
    idx = np.arange(NFRAMES)[:, None] * HOP + np.arange(WIN)[None, :]
    frames = x[:, idx] * _WINDOW
    power = np.abs(np.fft.rfft(frames, NFFT, axis=-1)) ** 2
    logmel = np.log(power @ _FB.T + 1e-6)
    return logmel @ _DCT.T


def pool_segments(c, segments=7):
    """Average the 49 frames into `segments` equal groups: (N, 49, 10) -> (N, segments*10)."""
    n = c.shape[0]
    per = NFRAMES // segments
    c = c[:, : per * segments].reshape(n, segments, per, -1).mean(axis=2)
    return c.reshape(n, -1)
