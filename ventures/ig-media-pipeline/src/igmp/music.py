"""Music for reels: a local library of licensed tracks, their beats and character, and where to
cut into them.

Library
  A folder (setting `music_dir`, default <output_dir>/music) of audio files. Every file needs a
  sidecar `<file>.license.json` (`song.mp3.license.json`; `song.license.json` is accepted too):
      {"source": "...", "license": "CC0-1.0", "attribution": null, "url": "https://..."}
  optional: "title", "attribution_required" (true/false overrides the guess from the licence).
  A track without a readable record is never used (a warning is logged), and neither is one whose
  licence rules out adaptations (CC ...-ND: under CC 4.0 setting music to moving images is an
  adaptation), commercial use (...-NC), or says "all rights reserved".

Analysis (librosa, local, no network), cached by content hash in <state>/music/<id>.json
  - decoded to mono 22.05 kHz by ffmpeg
  - onset strength: log-mel spectral flux (1024-point frames, 11.6 ms hop), less the ~13 ms the
    flux peak lags an attack (clicks ~10 ms, drum kits 13-18 ms)
  - beats: librosa's dynamic-programming beat tracker on that envelope; when the beats fit one
    straight line (steady tempo, as nearly all produced music has: residual < 15 ms) they are
    replaced by that exact grid, which gives the tempo to a hundredth of a BPM and beat times
    to a few ms; otherwise the tracked beats are kept as they are
  - downbeats: bar phase (4/4, or 3/4 when that pattern is clearly stronger) with the strongest
    accents: low-band onset (kick), overall onset and harmonic change (beat-synchronous chroma)
  - energy and onset curves at 10 Hz (0..1, energy relative to the loudest part of the track)
  - loudness: ffmpeg loudnorm measurement (integrated LUFS, true peak, LRA)
  - character: energy level from tempo, onset density, percussive share (HPSS) and loudness;
    bright/dark from mode (Krumhansl key profiles on chroma) and spectral centroid; a couple of
    mood words from that table

A reel uses one window of one track: best_window() picks a downbeat with a strong entrance (an
energy rise, an accent) and a full, unbroken body, ending on a bar line near the reel length;
beat_grid() turns the window into cut points for reels.snap().
"""
from __future__ import annotations

import hashlib
import json
import logging
import re
import subprocess
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Literal

import numpy as np
from pydantic import BaseModel

from .config import Config

log = logging.getLogger(__name__)
_warned: set[str] = set()       # library problems are logged once per run, not once per reel


def _warn_once(key: str, msg: str, *args) -> None:
    if key not in _warned:
        _warned.add(key)
        log.warning(msg, *args)

AUDIO_EXTS = {".mp3", ".wav", ".flac", ".m4a", ".aac", ".ogg", ".oga", ".opus", ".aif", ".aiff"}
ANALYSIS_VERSION = 1
SR = 22050                 # analysis sample rate
N_FFT, HOP = 1024, 256     # beat tracking frames: 46 ms window, 11.6 ms hop
ONSET_LATENCY = 0.013      # flux peaks this long after an attack (clicks ~10 ms, drum kits 13-18 ms)
CURVE_HOP = 0.1            # energy / onset curves, seconds per value
MIN_EXTRA_S = 1.0          # a track must be this much longer than a reel to be offered

NO_ATTRIBUTION = re.compile(r"CC0|PUBLIC.?DOMAIN|PIXABAY|^GENERATED", re.I)
BY = re.compile(r"\bBY\b|ATTRIBUTION", re.I)
FORBIDDEN = [(re.compile(r"\bNC\b|NON.?COMMERCIAL", re.I), "non-commercial only"),
             (re.compile(r"\bND\b|NO.?DERIV", re.I), "no adaptations (syncing to video is one)"),
             (re.compile(r"ALL RIGHTS RESERVED", re.I), "all rights reserved")]

MAJOR = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
MINOR = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])
PITCHES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
MOODS = {("high", "bright"): ["upbeat", "euphoric"], ("high", "dark"): ["driving", "intense"],
         ("medium", "bright"): ["warm", "easygoing"], ("medium", "dark"): ["moody", "steady"],
         ("low", "bright"): ["calm", "gentle"], ("low", "dark"): ["melancholic", "reflective"]}

__all__ = ["License", "Track", "TrackInfo", "analyze", "attribution_line", "beat_grid",
           "best_window", "enabled", "library", "library_listing", "listing", "load_library",
           "music_dir", "track_id"]


class License(BaseModel):
    source: str
    license: str
    attribution: str | None = None
    url: str | None = None
    title: str | None = None
    attribution_required: bool | None = None

    @property
    def short(self) -> str:
        s = self.license.strip()
        if s.lower().startswith("generated"):
            return "generated"
        if re.search(r"pixabay", s, re.I):
            return "Pixabay"
        m = re.match(r"(CC0|CC[- ]BY(?:[- ]SA)?)", s, re.I)
        return m.group(1).upper().replace(" ", "-") if m else s.split()[0]


class TrackInfo(BaseModel):
    """What analyze() learns about a track. Times are seconds from the start of the file."""
    id: str
    version: int = ANALYSIS_VERSION
    duration_s: float
    tempo_bpm: float
    steady_tempo: bool                  # beats are an exact grid
    beats: list[float]
    downbeats: list[float]
    beats_per_bar: int = 4
    downbeat_confidence: float = 0.0    # 0 = a guess, >= 1 clear accents on the bar line
    hop_s: float = CURVE_HOP
    energy: list[float]                 # 0..1 per hop, relative to the loudest part
    onset: list[float]                  # 0..1 per hop
    loudness_lufs: float
    true_peak_dbtp: float
    lra: float
    energy_score: float                 # 0..1
    energy_level: Literal["low", "medium", "high"]
    brightness: Literal["bright", "dark"]
    key: str                            # e.g. "A major"
    percussive: float                   # share of spectral energy in the percussive part
    mood: list[str]

    @property
    def beat_s(self) -> float:
        return 60.0 / self.tempo_bpm if self.tempo_bpm > 0 else 0.5


@dataclass
class Track:
    id: str
    path: Path
    license: License
    info: TrackInfo | None = None

    @property
    def title(self) -> str:
        return self.license.title or self.path.stem.replace("_", " ").replace("-", " ").strip()


# --------------------------------------------------------------------------- settings, library


def enabled(cfg: Config) -> bool:
    """Setting `music`: "auto" (default) puts a track under every reel; "none" exports silent
    reels for adding a sound in the Instagram app."""
    return str((cfg.extra or {}).get("music", "auto")).strip().lower() in ("auto", "true", "on", "yes")


def music_dir(cfg: Config) -> Path:
    d = (cfg.extra or {}).get("music_dir")
    return Path(d).expanduser() if d else cfg.output_dir / "music"


@lru_cache(maxsize=1024)
def _hash(path: str, size: int, mtime_ns: int) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()[:16]


def track_id(path: str | Path) -> str:
    """Stable id: a hash of the file's bytes (renaming or moving a track keeps it)."""
    st = Path(path).stat()
    return _hash(str(Path(path).resolve()), st.st_size, st.st_mtime_ns)


def _sidecar(path: Path) -> Path | None:
    for p in (path.with_name(path.name + ".license.json"), path.with_suffix(".license.json")):
        if p.exists():
            return p
    return None


def read_license(path: Path) -> License | None:
    """The track's licence record, or None (with a warning) when it may not be used."""
    side = _sidecar(path)
    key = str(path)
    if side is None:
        _warn_once(key, "music: %s has no %s.license.json; not used", path.name, path.name)
        return None
    try:
        lic = License.model_validate(json.loads(side.read_text()))
    except (OSError, ValueError) as e:
        _warn_once(key, "music: unreadable licence record %s: %s; not used", side.name, e)
        return None
    if not lic.license.strip() or not lic.source.strip():
        _warn_once(key, "music: %s names no licence or source; not used", side.name)
        return None
    for pattern, why in FORBIDDEN:
        if pattern.search(lic.license):
            _warn_once(key, "music: %s is %s (%s); not used", path.name, lic.license, why)
            return None
    return lic


def library(cfg: Config) -> list[Track]:
    """Every licensed audio file in the music folder (not analysed)."""
    root = music_dir(cfg)
    if not root.is_dir():
        return []
    out = []
    for p in sorted(root.rglob("*")):
        if p.suffix.lower() not in AUDIO_EXTS or p.name.startswith(".") or not p.is_file():
            continue
        lic = read_license(p)
        if lic is not None:
            out.append(Track(track_id(p), p, lic))
    return out


def load_library(cfg: Config, min_seconds: float | None = None) -> dict[str, Track]:
    """Licensed, analysed tracks long enough for a reel, by id. Tracks that fail to decode are
    skipped with a warning."""
    need = (cfg.reel_seconds if min_seconds is None else min_seconds) + MIN_EXTRA_S
    out = {}
    for t in library(cfg):
        if t.id in out:
            continue                                    # the same file twice
        try:
            t.info = analyze(t, cfg)
        except Exception as e:                          # one bad file must not stop the reels
            _warn_once(f"analyse:{t.id}", "music: cannot analyse %s: %s", t.path.name, e)
            continue
        if t.info.duration_s < need:
            _warn_once(f"short:{t.id}", "music: %s is too short for a %.0f s reel", t.path.name, cfg.reel_seconds)
            continue
        out[t.id] = t
    return out


def attribution_line(track: Track) -> str | None:
    """The credit line a reel's caption needs for this track, or None when the licence asks for
    none. CC BY-family licences always get one (built from title/url when the record has no
    text); CC0, Pixabay and generated music get none; anything else gets the record's text if it
    has one."""
    lic = track.license
    need = lic.attribution_required
    if need is None:
        if NO_ATTRIBUTION.search(lic.license.strip()):
            need = False
        else:
            need = bool(BY.search(lic.license)) or bool(lic.attribution)
    if not need:
        return None
    text = (lic.attribution or "").strip()
    if not text:
        where = lic.url or lic.source
        text = f'"{track.title}" ({where}), {lic.license}'
    return text if text.lower().startswith(("music", "song", "track", "♪")) else f"Music: {text}"


# --------------------------------------------------------------------------- analysis


def _decode(path: Path, cfg: Config) -> np.ndarray:
    proc = subprocess.run([cfg.ffmpeg, "-hide_banner", "-nostdin", "-v", "error", "-i", str(path),
                           "-vn", "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"],
                          capture_output=True, timeout=600)
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.decode(errors="replace")[-500:])
    y = np.frombuffer(proc.stdout, np.float32)
    if len(y) < SR:
        raise RuntimeError("less than a second of audio")
    return y.copy()


def parse_loudnorm(stderr: str) -> dict:
    """The JSON block loudnorm prints (print_format=json), numbers as floats (-inf for silence)."""
    end = stderr.rfind("}")
    start = stderr.rfind("{", 0, end)
    if start < 0 or end < 0:
        raise RuntimeError("no loudnorm measurement in ffmpeg output")
    out = {}
    for k, v in json.loads(stderr[start:end + 1]).items():
        try:
            out[k] = float(v)
        except (TypeError, ValueError):
            out[k] = v
    return out


def measure_loudness(path: Path, cfg: Config) -> dict:
    proc = subprocess.run([cfg.ffmpeg, "-hide_banner", "-nostdin", "-i", str(path), "-vn", "-af",
                           "loudnorm=I=-14:TP=-1:LRA=11:print_format=json", "-f", "null", "-"],
                          capture_output=True, timeout=600)
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.decode(errors="replace")[-500:])
    return parse_loudnorm(proc.stderr.decode(errors="replace"))


def _regularise(beats: np.ndarray) -> tuple[float, float] | None:
    """(first beat, period) of the straight line through the beats when the tempo is steady."""
    if len(beats) < 8:
        return None
    ibi = float(np.median(np.diff(beats)))
    # count beats step by step: a median off by a frame would miscount over a whole track
    k = np.concatenate([[0], np.cumsum(np.maximum(1, np.round(np.diff(beats) / ibi)))])
    keep = np.ones(len(beats), bool)
    for _ in range(3):
        period, a = np.polyfit(k[keep], beats[keep], 1)
        res = beats - (a + period * k)
        keep = np.abs(res) < 0.04
        if keep.sum() < 8:
            return None
    if keep.mean() < 0.9 or float(np.std(res[keep])) > 0.015:
        return None
    return float(a), float(period)


def _bar_phase(accent: np.ndarray) -> tuple[int, int, float]:
    """(beats per bar, index of the first downbeat, confidence) from per-beat accents."""
    if len(accent) < 8:
        return 4, 0, 0.0
    z = (accent - accent.mean()) / (accent.std() + 1e-9)
    best = {}
    for m in (4, 3):
        means = np.array([z[p::m].mean() for p in range(m)])
        rest = np.delete(means, means.argmax())
        best[m] = (int(means.argmax()), float(means.max() - rest.mean()))
    m = 3 if best[3][1] > 1.3 * best[4][1] + 0.2 else 4
    return m, best[m][0], best[m][1]


def _curve(values: np.ndarray, times: np.ndarray, n: int, how: str) -> np.ndarray:
    idx = np.clip((times / CURVE_HOP).astype(int), 0, n - 1)
    out = np.zeros(n)
    if how == "max":
        np.maximum.at(out, idx, values)
    else:
        np.add.at(out, idx, values)
        out /= np.maximum(np.bincount(idx, minlength=n), 1)
    return out


def _features(y: np.ndarray) -> dict:
    import librosa                                      # slow import; only when analysing

    duration = len(y) / SR
    D = np.abs(librosa.stft(y, n_fft=N_FFT, hop_length=HOP))
    mel = librosa.feature.melspectrogram(S=D ** 2, sr=SR, n_mels=96, fmax=SR / 2)
    log_mel = librosa.power_to_db(mel)
    env = librosa.onset.onset_strength(S=log_mel, sr=SR, hop_length=HOP, n_fft=N_FFT)
    low_bands = int(np.searchsorted(librosa.mel_frequencies(n_mels=96, fmax=SR / 2), 160.0))
    low = librosa.onset.onset_strength(S=log_mel[: max(2, low_bands)], sr=SR, hop_length=HOP, n_fft=N_FFT)
    times = librosa.frames_to_time(np.arange(len(env)), sr=SR, hop_length=HOP)

    # energy in 0.1 s blocks, relative to the loudest part (99th percentile)
    n = max(1, int(np.ceil(duration / CURVE_HOP)))
    block = int(SR * CURVE_HOP)
    padded = np.pad(y, (0, n * block - len(y)))
    rms_db = 10 * np.log10(np.mean(padded.reshape(n, block) ** 2, axis=1) + 1e-12)
    ref = float(np.percentile(rms_db, 99))
    energy = np.clip((rms_db - ref + 30) / 30, 0, 1)
    onset = np.clip(_curve(env, times, n, "max") / (np.percentile(env, 99) + 1e-9), 0, 1)
    sounding = np.flatnonzero(rms_db > ref - 40)
    first_sound = sounding[0] * CURVE_HOP if len(sounding) else 0.0
    last_sound = (sounding[-1] + 1) * CURVE_HOP if len(sounding) else duration

    # beats
    tempo, frames = librosa.beat.beat_track(onset_envelope=env, sr=SR, hop_length=HOP, trim=True)
    tempo = float(np.atleast_1d(tempo)[0])
    beats = librosa.frames_to_time(frames, sr=SR, hop_length=HOP) - ONSET_LATENCY
    line = _regularise(beats)
    steady = line is not None
    if steady:
        a, period = line
        k0 = int(np.ceil((first_sound - a) / period - 0.25))
        k1 = int(np.floor((min(last_sound, duration) - a) / period))
        beats = a + period * np.arange(k0, k1 + 1)
        tempo = 60.0 / period
    elif len(beats) >= 2:
        tempo = 60.0 / float(np.median(np.diff(beats)))
    else:                                               # nothing to track: a plain grid
        tempo = tempo if tempo > 0 else 120.0
        beats = first_sound + 60.0 / tempo * np.arange(int((last_sound - first_sound) * tempo / 60) + 1)
    beats = beats[(beats >= 0) & (beats < duration)]

    # downbeats from accents at each beat
    bf = np.clip(np.round((beats + ONSET_LATENCY) * SR / HOP).astype(int), 0, len(env) - 1)

    def at_beats(curve: np.ndarray) -> np.ndarray:
        return np.array([curve[max(0, f - 2): f + 3].max() for f in bf]) if len(bf) else np.zeros(0)

    chroma = librosa.feature.chroma_stft(S=D ** 2, sr=SR, n_fft=N_FFT)
    sync = librosa.util.sync(chroma, bf, aggregate=np.median) if len(bf) else chroma[:, :1]
    sync = sync / (np.linalg.norm(sync, axis=0, keepdims=True) + 1e-9)
    # sync column j covers beat j-1 .. j; change at beat i = 1 - cos(column i, column i+1)
    change = np.zeros(len(bf))
    if sync.shape[1] > 1:
        cos = np.sum(sync[:, :-1] * sync[:, 1:], axis=0)
        change[: len(cos)] = (1 - cos)[: len(bf)]
    accent = (_z(at_beats(low)) + 0.5 * _z(at_beats(env)) + 0.5 * _z(change)) if len(bf) else np.zeros(0)
    per_bar, phase, conf = _bar_phase(accent)
    downbeats = beats[phase::per_bar]

    # character, from up to a minute around the middle of the track
    D2 = np.abs(librosa.stft(y, n_fft=4096, hop_length=2048))
    lo, hi = int(max(0.0, duration / 2 - 30) * SR / 2048), int(min(duration, duration / 2 + 30) * SR / 2048)
    mid = D2[:, lo: max(lo + 1, hi)]
    H, P = librosa.decompose.hpss(mid, kernel_size=17)
    percussive = float((P ** 2).sum() / ((H ** 2).sum() + (P ** 2).sum() + 1e-12))
    profile = librosa.feature.chroma_stft(S=H ** 2, sr=SR, n_fft=4096).mean(axis=1)
    scores = [(float(np.nan_to_num(np.corrcoef(np.roll(tmpl, k), profile)[0, 1], nan=-1.0)), k, mode)
              for mode, tmpl in (("major", MAJOR), ("minor", MINOR)) for k in range(12)]
    corr, root, mode = max(scores, key=lambda s: s[0])
    frame_rms = np.sqrt(np.mean(mid ** 2, axis=0))
    loud = frame_rms > 0.1 * (frame_rms.max() + 1e-12)
    centroid = float(np.median(librosa.feature.spectral_centroid(S=mid, sr=SR)[0][loud])) if loud.any() else 0.0
    active = max(1.0, last_sound - first_sound)
    onset_rate = len(librosa.onset.onset_detect(onset_envelope=env, sr=SR, hop_length=HOP)) / active
    active_db = float(np.mean(rms_db[rms_db > ref - 40])) if len(sounding) else -60.0
    energy_score = float(np.clip(
        0.3 * np.clip((tempo - 70) / 80, 0, 1) + 0.3 * np.clip(onset_rate / 4, 0, 1)
        + 0.2 * np.clip(percussive / 0.5, 0, 1) + 0.2 * np.clip((active_db + 30) / 20, 0, 1), 0, 1))
    level = "high" if energy_score >= 0.65 else "medium" if energy_score >= 0.4 else "low"
    tone = (0.6 if mode == "major" else -0.6) * (corr > 0.3) + 0.4 * float(np.clip((centroid - 2000) / 1500, -1, 1))
    brightness = "bright" if tone >= 0 else "dark"
    mood = list(MOODS[(level, brightness)])
    if percussive > 0.45:
        mood.append("percussive")
    elif percussive < 0.15:
        mood.append("ambient")
    return {
        "duration_s": round(duration, 3), "tempo_bpm": round(tempo, 2), "steady_tempo": steady,
        "beats": [round(float(b), 4) for b in beats], "downbeats": [round(float(b), 4) for b in downbeats],
        "beats_per_bar": per_bar, "downbeat_confidence": round(conf, 3),
        "energy": [round(float(v), 3) for v in energy], "onset": [round(float(v), 3) for v in onset],
        "energy_score": round(energy_score, 3), "energy_level": level, "brightness": brightness,
        "key": f"{PITCHES[root]} {mode}", "percussive": round(percussive, 3), "mood": mood,
    }


def _z(x: np.ndarray) -> np.ndarray:
    return (x - x.mean()) / (x.std() + 1e-9) if len(x) else x


def analyze(track: Track | str | Path, cfg: Config) -> TrackInfo:
    """Tempo, beats, downbeats, energy/onset curves, loudness and character of a track. Cached
    in <state>/music/<id>.json, keyed by the file's content hash."""
    path = Path(track.path if isinstance(track, Track) else track)
    tid = track.id if isinstance(track, Track) else track_id(path)
    cache = cfg.state_dir / "music" / f"{tid}.json"
    if cache.exists():
        try:
            info = TrackInfo.model_validate_json(cache.read_text())
            if info.version == ANALYSIS_VERSION:
                return info
        except ValueError:
            pass
    y = _decode(path, cfg)
    feats = _features(y)
    loud = measure_loudness(path, cfg)
    info = TrackInfo(id=tid, loudness_lufs=_finite(loud.get("input_i"), -70.0),
                     true_peak_dbtp=_finite(loud.get("input_tp"), -70.0),
                     lra=_finite(loud.get("input_lra"), 0.0), **feats)
    cache.parent.mkdir(parents=True, exist_ok=True)
    tmp = cache.with_suffix(".tmp")
    tmp.write_text(info.model_dump_json())
    tmp.replace(cache)
    log.info("music: analysed %s: %.1f BPM%s, %s energy, %s, %s", path.name, info.tempo_bpm,
             "" if info.steady_tempo else " (varying)", info.energy_level, info.brightness, info.key)
    return info


def _finite(v, default: float) -> float:
    try:
        v = float(v)
    except (TypeError, ValueError):
        return default
    return v if np.isfinite(v) else default


# --------------------------------------------------------------------------- windows and grids


def _mean(curve: np.ndarray, a: float, b: float) -> float:
    i, j = max(0, int(round(a / CURVE_HOP))), max(0, int(round(b / CURVE_HOP)))
    seg = curve[i:j]
    return float(seg.mean()) if len(seg) else 0.0


def _window_end(downbeats: np.ndarray, start: float, length_s: float, beat: float) -> float:
    """Where a window starting at `start` ends musically: the last bar line at or before
    start+length_s when it is within a bar of it, else start+length_s."""
    ends = downbeats[(downbeats > start + 0.5) & (downbeats <= start + length_s + 1e-6)]
    if len(ends) and start + length_s - ends[-1] <= 4 * beat + 1e-6:
        return float(ends[-1])
    return start + length_s


def window_scores(info: TrackInfo, length_s: float) -> list[tuple[float, float]]:
    """(start, score) for every bar line a window of length_s can start on."""
    energy, onset = np.asarray(info.energy), np.asarray(info.onset)
    downs = np.asarray(info.downbeats or info.beats)
    beat = info.beat_s
    bar = beat * info.beats_per_bar
    out = []
    for s in downs:
        if s + length_s > info.duration_s - 0.2:
            break
        body = _mean(energy, s, s + length_s)
        seg = energy[int(s / CURVE_HOP): int((s + length_s) / CURVE_HOP)]
        floor = float(np.percentile(seg, 10)) if len(seg) else 0.0
        before = _mean(energy, max(0.0, s - 2 * bar), s) if s >= bar else 0.0
        rise = _mean(energy, s, s + 2 * bar) - before
        i = int(round(s / CURVE_HOP))
        hit = float(onset[max(0, i - 1): i + 2].max()) if len(onset) else 0.0
        end = _window_end(downs, s, length_s, beat)
        bars = (end - s) / bar if bar > 0 else 0
        phrase = 1.0 if abs(bars - 4 * round(bars / 4)) < 0.1 else 0.5 if abs(bars - 2 * round(bars / 2)) < 0.1 else 0.0
        turn = abs(_mean(energy, end, end + bar) - _mean(energy, end - bar, end))   # a section changes here
        score = (1.0 * body + 0.6 * floor + 0.8 * max(0.0, rise) + 0.3 * hit
                 + 0.1 * phrase + 0.2 * turn)
        out.append((float(s), score))
    return out


def best_window(info: TrackInfo, length_s: float) -> float:
    """Start (s) of the best length_s window: on a bar line, with a strong entrance (energy
    rising into it, an accent on the first beat), a full body without breaks, and a bar line
    near its end. Ties go to the earliest."""
    scores = window_scores(info, length_s)
    if not scores:
        downs = info.downbeats or info.beats or [0.0]
        return float(downs[0])
    best = max(s for _, s in scores)
    return next(t for t, s in scores if s >= best - 1e-9)


def beat_grid(info: TrackInfo, start_s: float, length_s: float, downbeats_only: bool = False) -> list[float]:
    """Cut points for a reel that starts at start_s in the track: the track's beats (or bar
    lines) from start_s up to start_s + length_s, relative to the reel's start. Always starts
    with 0.0."""
    src = info.downbeats if downbeats_only else info.beats
    pts = [round(b - start_s, 4) for b in src if start_s - 0.03 < b <= start_s + length_s + 1e-6]
    pts = [max(0.0, p) for p in pts]
    if not pts or pts[0] > 0.03:
        pts.insert(0, 0.0)
    pts[0] = 0.0
    return pts


def nearest_downbeat(info: TrackInfo, t: float) -> float | None:
    downs = np.asarray(info.downbeats or info.beats)
    if not len(downs):
        return None
    return float(downs[np.argmin(np.abs(downs - t))])


# --------------------------------------------------------------------------- for the story pass


def _clock(seconds: float) -> str:
    return f"{int(seconds // 60)}:{int(seconds % 60):02d}"


def listing(tracks: dict[str, Track] | list[Track], reel_seconds: float,
            used: dict[str, int] | None = None) -> str:
    """One line per analysed track, for the story pass: id, title, tempo, beat length, energy,
    tone, mood words, length, suggested start, licence (and how often reels already used it)."""
    lines = []
    for t in (tracks.values() if isinstance(tracks, dict) else tracks):
        i = t.info
        if i is None:
            continue
        line = (f"id={t.id} \"{t.title}\": {i.tempo_bpm:.0f} BPM (beat {i.beat_s:.3f}s), "
                f"{i.energy_level} energy, {i.brightness} ({i.key}), {', '.join(i.mood)}, "
                f"{_clock(i.duration_s)}, start {best_window(i, reel_seconds):.2f}s, {t.license.short}")
        if used and used.get(t.id):
            line += f", used {used[t.id]}x"
        lines.append(line)
    return "\n".join(lines)


def library_listing(cfg: Config, used: dict[str, int] | None = None) -> str:
    """Compact text of the analysed music library for the story agent ("" when empty)."""
    return listing(load_library(cfg), cfg.reel_seconds, used)
