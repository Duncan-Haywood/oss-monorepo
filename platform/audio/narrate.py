#!/usr/bin/env python3
"""One offline narration engine for every spoken page in the repository.

The podcast (`platform/pages/podcast_tts.py`), Saints by Candlelight and Hearth &
Horizon (`ventures/*/render_audio.py`) each used to carry their own copy of the same
loop: read a script, call a voice paragraph by paragraph, pad with silence, run
one-pass `loudnorm`, write an MP3. This module is that loop once, faster and
cleaner. Measurements behind every default: `docs/reports/2026-10-24-audio-engine.md`.

    from narrate import Narrator, Say, Gap, master
    n = Narrator(voice="af_heart")
    audio = n.render([Say("First paragraph."), Gap(0.9), Say("Second.")])
    entry = master(audio, Path("out.mp3"), metadata={"title": "..."})

What it does that the copies did not:

- **Sentences, cached.** Text is cut into sentence-sized units (short ones merged
  so no unit is a lone "No."), and each unit's audio is cached on disk under the
  hash of (model, voice, speed, language, text). Editing one paragraph and
  re-rendering re-voices that paragraph only; a re-render with no edits runs no model.
- **Parallel.** Units the cache lacks are voiced across worker processes, each an
  onnxruntime session pinned to its share of the cores, longest unit first.
- **Designed pauses.** The voice's own leading and trailing silence is trimmed and
  every edge gets a short fade, so joins don't click, and the gap after a unit
  follows its punctuation (a question breathes a little longer than a comma).
- **Linear loudness.** Two-pass EBU R128: measure, then one fixed gain and a
  true-peak limiter, instead of one-pass `loudnorm`, whose moving gain lifts
  breaths and quiet words and pumps on long pieces.
- **A measured codec setting.** MP3 at 32 kHz (an MPEG-1 rate) scored as well
  as or better than every setting the copies used, at the same or fewer bytes:
  MPEG-2 rates such as Kokoro's own 24 kHz lose to it at every bitrate tried.

Engine: Kokoro v1.0 (82M parameters, Apache-2.0 weights) through kokoro-onnx, so
no torch. Setup, once, outside the repository:

    python3 -m venv tts && tts/bin/pip install kokoro-onnx soundfile
    # optional, Kokoro's own English G2P (better names, numbers, heteronyms); not
    # "misaki[en]", whose transformer extra pulls in torch (a 6 GB venv against 0.5 GB):
    tts/bin/pip install misaki num2words spacy phonemizer-fork espeakng-loader
    # (spaCy built on Python 3.12 here and failed to build on 3.13)

The two model files (~350 MB) are read from `--models` / $KOKORO_MODELS (default
~/.cache/kokoro) and fetched from huggingface.co when missing. Needs ffmpeg.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import subprocess
import urllib.request
from concurrent.futures import ProcessPoolExecutor
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

RATE = 24000
MODEL_URL = "https://huggingface.co/fastrtc/kokoro-onnx/resolve/main/"
MODEL_FILES = ("kokoro-v1.0.onnx", "voices-v1.0.bin")
MODEL_ID = "kokoro-v1.0"
DEFAULT_MODELS = Path(os.environ.get("KOKORO_MODELS", Path.home() / ".cache" / "kokoro"))
DEFAULT_CACHE = Path(os.environ.get("NARRATE_CACHE", Path.home() / ".cache" / "narrate"))

# Gap after a unit, in seconds at speed 1, by its last mark. Kokoro's own gap at a
# full stop is about a quarter second once trimmed; a person reading aloud takes a
# little more between sentences and more again after a question.
PAUSE_AFTER = {".": 0.34, "!": 0.38, "?": 0.42, "…": 0.45, ":": 0.3, ";": 0.28, ",": 0.18, "—": 0.22}
PAUSE_DEFAULT = 0.3
FADE = 0.004  # seconds of raised-cosine fade on every edge: removes the click a hard cut leaves
MIN_UNIT = 40  # characters; shorter sentences ride with the next one (kokoro-onnx notes a short batch comes out at a different rate and loudness)
MAX_UNIT = 420  # characters; longer runs stay one unit only if they are one sentence

# Never end a unit after these: the dot is part of the word, not the sentence.
_ABBREV = re.compile(r"(?:\b(?:Mr|Mrs|Ms|Dr|St|Sr|Jr|Fr|Mt|vs|etc|e\.g|i\.e|cf|No|approx)\.|\b(?:[A-Z]\.){2,})$")
_SENTENCE_END = re.compile(r"(?<=[.!?…])[\"'”’)\]]*\s+(?=[\"'“‘(\[]?[A-Z0-9])")


# --- the script ------------------------------------------------------------------

@dataclass
class Say:
    """Text to speak. `after` is the silence that follows it (the paragraph break)."""
    text: str
    after: float = 0.0


@dataclass
class Gap:
    """Silence, in seconds."""
    seconds: float


@dataclass
class Clip:
    """Ready-made audio at RATE (a bell, a sting), placed as is."""
    audio: np.ndarray


def sentences(text: str) -> list[str]:
    """Split prose into units the voice reads in one breath: sentences, short ones merged."""
    text = re.sub(r"\s+", " ", text).strip()
    if not text:
        return []
    parts, start = [], 0
    for m in _SENTENCE_END.finditer(text):
        head = text[start:m.start()].rstrip("\"'”’)] ")
        if _ABBREV.search(head):
            continue
        parts.append(text[start:m.start() + len(m.group(0).rstrip())].strip())
        start = m.end()
    parts.append(text[start:].strip())
    units: list[str] = []
    for p in filter(None, parts):
        if units and (len(units[-1]) < MIN_UNIT or len(p) < MIN_UNIT // 2) and len(units[-1]) + len(p) < MAX_UNIT:
            units[-1] = f"{units[-1]} {p}"
        else:
            units.append(p)
    return units


def pause_after(unit: str, speed: float = 1.0) -> float:
    mark = unit.rstrip("\"'”’)] ")[-1:] or "."
    return PAUSE_AFTER.get(mark, PAUSE_DEFAULT) / speed


def fade(audio: np.ndarray, seconds: float = FADE) -> np.ndarray:
    n = min(int(seconds * RATE), len(audio) // 2)
    if n <= 0:
        return audio
    ramp = (0.5 - 0.5 * np.cos(np.linspace(0, np.pi, n, dtype=np.float32))).astype(np.float32)
    out = audio.astype(np.float32, copy=True)
    out[:n] *= ramp
    out[-n:] *= ramp[::-1]
    return out


def silence(seconds: float) -> np.ndarray:
    return np.zeros(max(0, int(round(seconds * RATE))), dtype=np.float32)


def respell(text: str, pairs) -> str:
    """Apply (regex, spoken) pairs, or a {word: spoken} dict matched as whole words."""
    if isinstance(pairs, dict):
        pairs = [(rf"(?<!\w){re.escape(w)}(?!\w)" if w[:1].isalnum() else re.escape(w), s) for w, s in pairs.items()]
    for pattern, said in pairs:
        text = re.sub(pattern, said, text)
    return text


# --- the voice -------------------------------------------------------------------

def ensure_models(models: Path = DEFAULT_MODELS) -> Path:
    models.mkdir(parents=True, exist_ok=True)
    for name in MODEL_FILES:
        if not (models / name).exists():
            print(f"downloading {name}", flush=True)
            part = models / f"{name}.part"
            urllib.request.urlretrieve(MODEL_URL + name, part)
            part.rename(models / name)
    return models


_KOKORO = None
_G2P = None


def g2p_available() -> str:
    """'misaki' when Kokoro's own English G2P is installed, else 'espeak'.

    misaki (Kokoro's author's dictionary-first G2P, espeak only for unknown words)
    is what the torch `kokoro` package speaks with; plain kokoro-onnx phonemises with
    espeak-ng alone, which misreads more names and heteronyms. It is optional
    because it pulls in spaCy, which has no wheel yet for every Python.
    """
    try:
        import misaki.en  # noqa: F401
        return "misaki"
    except Exception:
        return "espeak"


def _load(models: str, threads: int, g2p: str = "espeak", lang: str = "en-us"):
    """Worker initialiser: one onnxruntime session with `threads` intra-op threads."""
    global _KOKORO, _G2P
    import onnxruntime as rt
    from kokoro_onnx import Kokoro

    opts = rt.SessionOptions()
    opts.intra_op_num_threads = threads
    opts.inter_op_num_threads = 1
    opts.graph_optimization_level = rt.GraphOptimizationLevel.ORT_ENABLE_ALL
    session = rt.InferenceSession(str(Path(models) / MODEL_FILES[0]), opts, providers=["CPUExecutionProvider"])
    _KOKORO = Kokoro.from_session(session, str(Path(models) / MODEL_FILES[1]))
    if g2p == "misaki":
        from misaki import en, espeak

        british = lang == "en-gb"
        _G2P = en.G2P(trf=False, british=british, fallback=espeak.EspeakFallback(british=british))


def _voice(job: tuple[str, str, float, str]) -> np.ndarray:
    text, voice, speed, lang = job
    if _G2P is not None:
        phonemes, _ = _G2P(text)
        audio, rate = _KOKORO.create(phonemes, voice=voice, speed=speed, is_phonemes=True, trim=True)
    else:
        audio, rate = _KOKORO.create(text, voice=voice, speed=speed, lang=lang, trim=True)
    assert rate == RATE, rate
    return fade(np.asarray(audio, dtype=np.float32))


def default_workers() -> tuple[int, int]:
    """(processes, threads each). One single-threaded session per core measured fastest."""
    cores = len(os.sched_getaffinity(0)) if hasattr(os, "sched_getaffinity") else os.cpu_count() or 1
    return max(1, cores), 1


@dataclass
class Narrator:
    voice: str = "af_heart"
    lang: str = "en-us"
    speed: float = 1.0
    models: Path = DEFAULT_MODELS
    cache: Path | None = DEFAULT_CACHE
    workers: int | None = None
    g2p: str = ""  # "misaki", "espeak", or "" for misaki when installed
    stats: dict = field(default_factory=lambda: {"units": 0, "voiced": 0, "cached": 0})

    def __post_init__(self):
        self.g2p = self.g2p or g2p_available()
        if self.g2p == "misaki" and self.lang not in ("en-us", "en-gb"):
            self.g2p = "espeak"

    def _key(self, text: str) -> str:
        size = (self.models / MODEL_FILES[0]).stat().st_size if (self.models / MODEL_FILES[0]).exists() else 0
        ident = json.dumps([MODEL_ID, size, self.g2p, self.voice, round(self.speed, 3), self.lang, text])
        return hashlib.sha256(ident.encode()).hexdigest()

    def _cached(self, key: str) -> np.ndarray | None:
        if not self.cache:
            return None
        f = self.cache / key[:2] / f"{key}.npy"
        return np.load(f).astype(np.float32) if f.exists() else None

    def _store(self, key: str, audio: np.ndarray) -> None:
        if not self.cache:
            return
        f = self.cache / key[:2] / f"{key}.npy"
        f.parent.mkdir(parents=True, exist_ok=True)
        tmp = f.with_suffix(".tmp.npy")
        np.save(tmp, audio.astype(np.float16))  # half precision: ~66 dB below the signal, far under the codec's noise
        tmp.rename(f)

    def voice_units(self, units: list[str]) -> dict[str, np.ndarray]:
        """Audio for each distinct unit, from the cache or freshly voiced in parallel."""
        out, todo = {}, []
        for u in dict.fromkeys(units):
            hit = self._cached(self._key(u))
            if hit is not None:
                out[u] = hit
            else:
                todo.append(u)
        self.stats["units"] += len(units)
        self.stats["cached"] += len(out)
        self.stats["voiced"] += len(todo)
        if not todo:
            return out
        ensure_models(self.models)
        procs, threads = (self.workers, 1) if self.workers else default_workers()
        procs = max(1, min(procs, len(todo)))
        order = sorted(todo, key=len, reverse=True)  # longest first keeps the last worker from finishing alone
        jobs = [(u, self.voice, self.speed, self.lang) for u in order]
        if procs == 1:
            _load(str(self.models), max(threads, default_workers()[0]), self.g2p, self.lang)
            results = map(_voice, jobs)
        else:
            pool = ProcessPoolExecutor(procs, initializer=_load, initargs=(str(self.models), threads, self.g2p, self.lang))
            results = pool.map(_voice, jobs, chunksize=1)
        try:
            for u, audio in zip(order, results):
                self._store(self._key(u), audio)
                out[u] = audio
        finally:
            if procs > 1:
                pool.shutdown()
        return out

    def render(self, script: list) -> np.ndarray:
        """The whole piece as one float32 waveform at RATE."""
        plan = []
        for item in script:
            if isinstance(item, Say):
                units = sentences(item.text)
                for i, u in enumerate(units):
                    plan.append((u, item.after if i == len(units) - 1 else pause_after(u, self.speed)))
            else:
                plan.append(item)
        voiced = self.voice_units([p[0] for p in plan if isinstance(p, tuple)])
        parts = []
        for p in plan:
            if isinstance(p, tuple):
                parts += [voiced[p[0]], silence(p[1])]
            elif isinstance(p, Gap):
                parts.append(silence(p.seconds))
            else:
                parts.append(fade(np.asarray(p.audio, dtype=np.float32)))
        return np.concatenate(parts) if parts else np.zeros(0, dtype=np.float32)


# --- the file --------------------------------------------------------------------

LOUDNESS = -16.0  # LUFS, the podcast norm (Apple, Spotify)
TRUE_PEAK = -1.5  # dBTP
HIGHPASS = 60  # Hz: below a voice's fundamental, only rumble lives here
OUT_RATE = 32000  # Hz in the MP3; see the report for the sweep


def _ffmpeg(args: list[str], pcm: np.ndarray) -> subprocess.CompletedProcess:
    return subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-f", "f32le", "-ar", str(RATE), "-ac", "1", "-i", "pipe:0", *args],
                          input=np.ascontiguousarray(pcm, dtype="<f4").tobytes(), capture_output=True, check=True)


def measure(pcm: np.ndarray, pre: str = f"highpass=f={HIGHPASS}") -> dict:
    """EBU R128 integrated loudness (LUFS), range (LU) and true peak (dBTP) of `pcm`."""
    r = _ffmpeg(["-af", f"{pre + ',' if pre else ''}loudnorm=I={LOUDNESS}:TP={TRUE_PEAK}:print_format=json", "-f", "null", "-"], pcm)
    stats = json.loads(re.findall(r"\{[^{}]*\}", r.stderr.decode())[-1])
    return {"lufs": float(stats["input_i"]), "lra": float(stats["input_lra"]), "peak": float(stats["input_tp"])}


def master(pcm: np.ndarray, out: Path, *, bitrate: str = "40k", rate: int = OUT_RATE, metadata: dict | None = None) -> dict:
    """Normalise to LOUDNESS with one fixed gain, limit peaks, and write a mono constant-bitrate MP3.

    Constant bitrate because podcast apps estimate an MP3's length from its size.

    Returns the manifest fields every caller records: bytes, seconds, sha256.
    """
    m = measure(pcm)
    gain = LOUDNESS - m["lufs"]
    limit = 10 ** (TRUE_PEAK / 20)
    # Fixed gain, then a lookahead limiter for the few peaks the gain pushes past the
    # ceiling (oversampled, so it catches inter-sample peaks too). Speech at -16 LUFS
    # rarely needs more than a dB or two of it.
    chain = (f"highpass=f={HIGHPASS},volume={gain:.2f}dB,aresample=96000,"
             f"alimiter=limit={limit:.4f}:attack=2:release=60:level=disabled,aresample={rate}")
    tags = [x for k, v in (metadata or {}).items() if v for x in ("-metadata", f"{k}={v}")]
    out.parent.mkdir(parents=True, exist_ok=True)
    _ffmpeg(["-y", "-loglevel", "error", "-af", chain, "-ar", str(rate), "-ac", "1",
             "-codec:a", "libmp3lame", "-b:a", bitrate, *tags, str(out)], pcm)
    seconds = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(out)],
                                   check=True, capture_output=True, text=True).stdout.strip())
    data = out.read_bytes()
    return {"bytes": len(data), "seconds": round(seconds, 2), "sha256": hashlib.sha256(data).hexdigest()}
