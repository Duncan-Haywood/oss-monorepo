"""Online sampling-rate-offset tracking by weighted average coherence drift (online WACD), step 4d.

A port of three pieces of `paderwasn` (Department of Communications Engineering, Paderborn University; MIT
licence; https://github.com/fgnt/paderwasn at commit cd7054fcf72d), the open code of

  Gburrek, Schmalenstroeer and Haeb-Umbach (2022), "On synchronization of wireless acoustic sensor networks in
  the presence of time-varying sampling rate offsets and speaker changes", ICASSP, and the online WACD
  estimator `paderwasn.synchronization.sro_estimation.OnlineWACD`, whose docstring cites "Online Estimation
  of Sampling Rate Offset in Wireless Acoustic Sensor Networks with Packet Loss" (paderwasn's README, ref. 4).

Ported line by line, same defaults, so this project's tests run without paderwasn's `paderbox` and `sacred`
dependencies (and because this session's sandbox would not run the downloaded checkout):

  * `stft`: paderbox's STFT as OnlineWACD builds it (periodic Blackman window of fft_size, shift
    frame_shift_welch, pad=False, fading=False, real FFT).
  * `compensate_sro` / `sim_sro`: the STFT-domain resampler of `paderwasn.synchronization.sync` and
    `.simulation` (Schmalenstroeer and Haeb-Umbach's overlap-save method), constant SRO only.
  * `coarse_sync_offset`: `paderwasn.synchronization.sync.coarse_sync`'s integer offset (argmax of the
    absolute full cross-correlation of the first len_sync samples), computed by FFT; numerically the same
    argmax as its np.correlate up to floating-point ties.
  * `online_wacd`: OnlineWACD.__call__, returning the per-segment SRO estimates (ppm) and the estimator's own
    running SRO-induced shift tau (samples) at each segment centre.
"""
import numpy as np
from scipy.signal.windows import blackman, hann

# OnlineWACD's defaults (paderwasn cd7054f)
SEG_LEN, SEG_SHIFT, FRAME_SHIFT_WELCH, FFT_SIZE = 16384, 2048, 1024, 8192
TEMP_DIST, EPS_MAX_PPM, AVG_PERIOD, K_MIN, K_MAX = 16384, 400, 160, 100, 1800
LEN_COARSE_SYNC = 320000  # paderwasn/experiments/sro_estimation_methods.py, len_coarse_sync
SETTLING = 40  # the same script's settling_time for online WACD


def stft(x, size=FFT_SIZE, shift=FRAME_SHIFT_WELCH):
    """paderbox.transform.STFT(shift, size, window_length=size, pad=False, fading=False)(x): frames x rfft bins."""
    x = np.asarray(x, float)
    n = 1 + (len(x) - size) // shift
    idx = np.arange(size)[None, :] + shift * np.arange(n)[:, None]
    return np.fft.rfft(x[idx] * blackman(size, sym=False), size, axis=-1)


def compensate_sro(sig, sro, fft_size=8192):
    """paderwasn.synchronization.sync.compensate_sro for a constant SRO (ppm)."""
    sig = np.asarray(sig, float)
    sro = float(sro)
    while fft_size * abs(sro) * 1e-6 > 1:
        fft_size = fft_size // 2
    k = np.fft.fftshift(np.arange(-fft_size / 2, fft_size / 2))
    block_len = int(fft_size // 2)
    out = np.zeros_like(sig)
    block_idx, len_rest = 0, 0
    win = hann(block_len, sym=False)
    while True:
        shift_sro = sro * 1e-6 * (block_idx * block_len / 2 + block_len / 2)
        integer_shift = np.round(shift_sro)
        rest_shift = integer_shift - shift_sro
        start = int(block_idx * block_len / 2 + integer_shift)
        if start < 0:
            if start + block_len < 0:
                block = np.zeros(block_len)
            else:
                block = np.pad(sig[0:start + block_len], (block_len - (start + block_len), 0), "constant")
        elif start + block_len > sig.size:
            block = np.zeros(block_len)
            block[:sig[start:].size] = sig[start:]
            len_rest = sig[start:].size
        else:
            block = sig[start:start + block_len]
        spec = np.fft.fft(win * block, fft_size) * np.exp(-1j * 2 * np.pi * k / fft_size * rest_shift)
        start = int(block_idx * block_len / 2)
        if start + block_len > out.size:
            out = np.pad(out, (0, start + block_len - out.size), "constant")
        out[start:start + block_len] += np.real(np.fft.ifft(spec))[:block_len]
        if start + block_len > sig.size:
            return out[:start + len_rest]
        block_idx += 1


def sim_sro(sig, sro, fft_size=8192):
    """paderwasn.synchronization.simulation.sim_sro: the signal as recorded by a device whose clock runs sro
    ppm slow, so a sound at sample m of sig lands near sample m (1 + sro 1e-6)."""
    return compensate_sro(sig, -sro, fft_size)


def coarse_sync_offset(sig, ref_sig, len_sync=LEN_COARSE_SYNC):
    """coarse_sync's integer offset (samples) of sig behind ref_sig: argmax |np.correlate(sig[:L], ref[:L],
    'full')| - (L - 1), by FFT."""
    a = np.asarray(sig[:len_sync], float)
    b = np.asarray(ref_sig[:len_sync], float)
    n = len(a) + len(b) - 1
    nfft = 1 << (n - 1).bit_length()
    c = np.fft.irfft(np.fft.rfft(a, nfft) * np.conj(np.fft.rfft(b, nfft)), nfft)
    lags = np.arange(-(len(b) - 1), len(a))
    return int(lags[int(np.argmax(np.abs(c[lags % nfft])))])


def trim(sig, ref_sig, offset):
    """coarse_sync's returned (sig, ref_sig) after compensating the integer offset."""
    if offset > 0:
        return sig[offset:], ref_sig[:-offset]
    if offset < 0:
        return sig[:offset], ref_sig[-offset:]
    return sig, ref_sig


class _Frames:
    """Blackman-windowed rfft frames of x keyed by start sample, so overlapping segments share them (the same
    numbers as stft() of each segment; frames older than `keep_from` are dropped)."""

    def __init__(self, x, size=FFT_SIZE, shift=FRAME_SHIFT_WELCH):
        self.x, self.size, self.shift, self.c = np.asarray(x, float), size, shift, {}
        self.win = blackman(size, sym=False)

    def seg(self, start, seg_len):
        n = 1 + (seg_len - self.size) // self.shift
        out = []
        for j in range(n):
            s = start + j * self.shift
            f = self.c.get(s)
            if f is None:
                f = self.c[s] = np.fft.rfft(self.x[s:s + self.size] * self.win, self.size)
            out.append(f)
        return np.array(out)

    def drop_before(self, keep_from):
        for s in [s for s in self.c if s < keep_from]:
            del self.c[s]


def _coherence_spec(S, R):
    cpsd = np.mean(R * np.conj(S), axis=0)
    p_ref = np.mean(R * np.conj(R), axis=0)
    p_sig = np.mean(S * np.conj(S), axis=0)
    return cpsd / (np.sqrt(p_ref * p_sig) + 1e-13)


def _coherence(seg, seg_ref):
    return _coherence_spec(stft(seg), stft(seg_ref))


def online_wacd(sig, ref_sig, seg_len=SEG_LEN, seg_shift=SEG_SHIFT, temp_dist=TEMP_DIST, eps_max_ppm=EPS_MAX_PPM,
                avg_period=AVG_PERIOD, k_min=K_MIN, k_max=K_MAX, fft_size=FFT_SIZE):
    """OnlineWACD()(sig, ref_sig). Returns (sro estimates in ppm per segment, the estimator's running
    SRO-induced shift tau in samples after each segment, each segment's centre in ref_sig samples)."""
    eps_max = eps_max_ppm * 1e-6
    k_max = int(np.minimum(int(fft_size / (2 * eps_max * temp_dist)), k_max))
    num = int((len(ref_sig) - temp_dist - seg_len + seg_shift) // seg_shift)
    est, taus, centres = np.zeros(num), np.zeros(num), np.zeros(num)
    tau = 0.0
    prods = np.zeros((avg_period, k_max - k_min), dtype=np.complex128)
    k = np.arange(k_min, k_max)
    FS_, FR = _Frames(sig, fft_size), _Frames(ref_sig, fft_size)
    for i in range(num):
        shift = int(np.round(tau))
        start = i * seg_shift + temp_dist
        coh = _coherence_spec(FS_.seg(start + shift, seg_len), FR.seg(start, seg_len))
        sd = i * seg_shift
        coh_d = _coherence_spec(FS_.seg(sd + shift, seg_len), FR.seg(sd, seg_len))
        FS_.drop_before(sd + shift - 4 * seg_shift)
        FR.drop_before(sd - 4 * seg_shift)
        prod = (coh * np.conj(coh_d))[k_min:k_max]
        prods = np.roll(prods, -1, 0)
        prods[-1] = prod
        avg = np.mean(prods, 0)
        norm_phase = np.angle(avg) * fft_size / (2 * temp_dist * k * eps_max)
        e = eps_max / np.pi * np.angle(np.mean(np.abs(avg) * np.exp(1j * norm_phase)))
        est[i] = e
        tau = (seg_len / 2 + temp_dist) * e if i == 0 else tau + seg_shift * e
        taus[i] = tau
        centres[i] = seg_len / 2 + temp_dist + i * seg_shift
        nxt = (i + 1) * seg_shift + temp_dist + int(np.round(tau)) + seg_len
        if nxt > len(sig):
            return est[:i + 1] * 1e6, taus[:i + 1], centres[:i + 1]
    return est * 1e6, taus, centres
