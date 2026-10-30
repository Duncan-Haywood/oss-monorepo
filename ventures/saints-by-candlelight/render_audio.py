#!/usr/bin/env python3
"""Render an episode script to MP3 with Kokoro, offline and at $0, then record
it in audio/manifest.json so the pages and the podcast feed pick it up.

    pip install kokoro-onnx soundfile          # once (optionally "misaki[en]" too)
    python3 render_audio.py the-angel-who-called-himself-azarias
    node generate.mjs

Rendering is the shared engine, `platform/audio/narrate.py` (sentence cache, one
worker per core, fixed-gain loudness). Kokoro v1.0 (Apache 2.0) model files are
read from --models (default ~/.cache/kokoro) and downloaded from Hugging Face if
missing. Needs ffmpeg. Output: mono 32 kHz 40 kbps MP3 at -16 LUFS, the usual
podcast loudness. A soft synthesised bell opens and closes the episode and marks
scene breaks.
"""
import argparse
import json
import re
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT.parents[1] / "platform" / "audio"))
import narrate  # noqa: E402

VOICE = "bm_george"
SPEED = 0.9
RATE = narrate.RATE

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


def plan(slug: str) -> list:
    parts = [narrate.Clip(bell()), narrate.Gap(0.8)]
    for block in script_blocks(episode_path(slug)):
        if block == "[pause]":
            parts.append(narrate.Gap(2.2))
        elif block in ("* * *", "***"):
            parts += [narrate.Gap(0.8), narrate.Clip(bell(3.0, 440.0, 0.1)), narrate.Gap(0.6)]
        else:
            parts.append(narrate.Say(speakable(block), after=0.7))
    return parts + [narrate.Gap(1.5), narrate.Clip(bell(5.0))]


def render(slug: str, models: Path) -> dict:
    narrator = narrate.Narrator(voice=VOICE, lang="en-gb", speed=SPEED, models=models)
    entry = narrate.master(narrator.render(plan(slug)), ROOT / "audio" / f"{slug}.mp3", bitrate="40k", metadata={
        "title": slug, "artist": "Saints by Candlelight",
        "comment": "Written by an AI and read by a synthetic voice (Kokoro). CC BY-SA 4.0"})
    return {"bytes": entry["bytes"], "seconds": round(entry["seconds"], 1), "voice": f"kokoro-v1.0 {VOICE}"}


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
