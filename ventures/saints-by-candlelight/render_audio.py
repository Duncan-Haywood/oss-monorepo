#!/usr/bin/env python3
"""Render an episode script to MP3 with Kokoro, offline and at $0, then record
it in audio/manifest.json so the pages and the podcast feed pick it up.

    pip install kokoro-onnx soundfile          # once
    python3 render_audio.py the-angel-who-called-himself-azarias
    node generate.mjs

Kokoro v1.0 (Apache 2.0) model files are read from --models (default
~/.cache/kokoro) and downloaded from Hugging Face if missing. Needs ffmpeg.
Output: mono 44.1 kHz 40 kbps MP3 at -16 LUFS, the usual podcast loudness.
A soft synthesised bell opens and closes the episode and marks scene breaks.
"""
import argparse
import json
import re
import subprocess
import tempfile
import urllib.request
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent
MODEL_URL = "https://huggingface.co/fastrtc/kokoro-onnx/resolve/main/"
MODEL_FILES = ("kokoro-v1.0.onnx", "voices-v1.0.bin")
VOICE = "bm_george"
SPEED = 0.9
RATE = 24000

# Words the voice reads badly, spelled the way they should sound.
SAY = {
    "Jordanes": "Jor-dah-nees",
    "Raguel": "Rag-you-el",
    "Lycia": "Lissia",
    "Spyridon": "Spy-rid-on",
    "Trimythous": "Tri-mith-us",
    "Demetrios": "Deh-meet-ree-os",
    "Kallias": "Kal-ee-as",
    "Argos": "Ar-goss",
    "Seraphim": "Serra-fim",
    "Sarov": "Sah-rov",
    "Prokhor": "Prok-hor",
    "Motovilov": "Mo-toe-vee-lov",
    "Diveyevo": "Dee-vay-ay-vo",
    "Agathia": "Ah-gah-thee-ah",
}


def episode_path(slug: str) -> Path:
    matches = sorted((ROOT / "episodes").glob(f"[0-9][0-9][0-9]-{slug}.md"))
    if not matches:
        raise SystemExit(f"no episodes/NNN-{slug}.md")
    return matches[0]


def script_blocks(path: Path) -> list[str]:
    text = path.read_text()
    body = text.split("\n---\n", 1)[1] if text.startswith("---\n") else text
    return [b.strip() for b in re.split(r"\n\s*\n", body) if b.strip()]


def speakable(text: str) -> str:
    text = text.replace("*", "")
    for word, said in SAY.items():
        text = re.sub(rf"\b{re.escape(word)}\b", said, text)
    return text.replace("\n", " ")


def bell(seconds: float = 4.0, base: float = 392.0, gain: float = 0.18) -> np.ndarray:
    """A soft hand-bell: inharmonic partials with exponential decay."""
    t = np.arange(int(RATE * seconds)) / RATE
    tone = np.zeros_like(t)
    for ratio, amp, decay in ((1.0, 1.0, 1.4), (2.0, 0.45, 2.2), (2.76, 0.3, 3.0), (5.4, 0.12, 5.0)):
        tone += amp * np.sin(2 * np.pi * base * ratio * t) * np.exp(-decay * t)
    attack = np.minimum(1.0, t / 0.01)
    return (gain * tone * attack / 1.9).astype(np.float32)


def silence(seconds: float) -> np.ndarray:
    return np.zeros(int(RATE * seconds), dtype=np.float32)


def ensure_models(models: Path) -> None:
    models.mkdir(parents=True, exist_ok=True)
    for name in MODEL_FILES:
        if not (models / name).exists():
            print("downloading", name)
            urllib.request.urlretrieve(MODEL_URL + name, models / name)


def render(slug: str, models: Path) -> dict:
    import soundfile as sf
    from kokoro_onnx import Kokoro

    ensure_models(models)
    kokoro = Kokoro(str(models / MODEL_FILES[0]), str(models / MODEL_FILES[1]))
    parts = [bell(), silence(0.8)]
    for block in script_blocks(episode_path(slug)):
        if block == "[pause]":
            parts.append(silence(2.2))
        elif block in ("* * *", "***"):
            parts += [silence(0.8), bell(3.0, 440.0, 0.1), silence(0.6)]
        else:
            samples, rate = kokoro.create(speakable(block), voice=VOICE, speed=SPEED, lang="en-gb")
            assert rate == RATE, rate
            parts += [samples.astype(np.float32), silence(0.7)]
    parts += [silence(1.5), bell(5.0)]
    audio = np.concatenate(parts)
    out = ROOT / "audio" / f"{slug}.mp3"
    out.parent.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        wav = Path(tmp) / "episode.wav"
        sf.write(wav, audio, RATE)
        subprocess.run(
            ["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav), "-ac", "1",
             "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-ar", "44100",
             "-codec:a", "libmp3lame", "-b:a", "40k",
             "-metadata", f"title={slug}", "-metadata", "artist=Saints by Candlelight",
             "-metadata", "comment=Written by an AI and read by a synthetic voice (Kokoro). CC BY-SA 4.0",
             str(out)],
            check=True,
        )
    seconds = float(subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(out)],
        check=True, capture_output=True, text=True).stdout)
    return {"bytes": out.stat().st_size, "seconds": round(seconds, 1), "voice": f"kokoro-v1.0 {VOICE}"}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("slugs", nargs="+")
    parser.add_argument("--models", type=Path, default=Path.home() / ".cache" / "kokoro")
    args = parser.parse_args()
    manifest_path = ROOT / "audio" / "manifest.json"
    for slug in args.slugs:
        entry = render(slug, args.models)
        manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
        manifest[slug] = entry
        manifest_path.write_text(json.dumps(dict(sorted(manifest.items())), indent=2) + "\n")
        print(slug, entry)


if __name__ == "__main__":
    main()
