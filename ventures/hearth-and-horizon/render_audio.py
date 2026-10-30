#!/usr/bin/env python3
"""Render a story to MP3 with Kokoro, offline and at $0, then record it in
audio/manifest.json so the pages and podcast feeds pick it up.

    python3 -m pip install kokoro-onnx soundfile    # once (bare `pip` may belong to another Python)
    python3 render_audio.py the-slowest-bell-on-the-moon
    node generate.mjs

Rendering is the shared engine, `platform/audio/narrate.py` (sentence cache, one
worker per core, fixed-gain loudness; its docstring has the optional better-English
`misaki` install). Kokoro v1.0's weights are Apache-2.0 and trained on permissively
licensed and synthetic audio, so the audio can carry the same CC BY-SA licence as
the text. The model files (~350 MB) download from huggingface.co on first use.
Needs ffmpeg. Output is mono 32 kHz 48 kbps MP3 at -16 LUFS, the usual podcast
loudness. The first 24 recordings were made with Piper and the public-domain
LJSpeech voice; their manifest entries say so.
"""
import argparse
import json
import re
import subprocess
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT.parents[1] / "platform" / "audio"))
import narrate  # noqa: E402

# af_bella: the voice Kokoro's own card grades highest after af_heart, which is the repository podcast's.
VOICE = "af_bella"

# Words an English voice reads badly, spelled the way they should sound.
SAY = {
    "MMLXXXIX": "two thousand and eighty-nine",
    "NOTES.md": "Notes dot M D",
    "config.yaml": "config dot yaml",
    "A.I.": "A I",
    "AI": "A I",
    "GLM": "G L M",
    "GPT": "G P T",
    "Bà": "Ba",
    "5x": "five times",
    "±1": "plus or minus one",
    "~": "about ",
    "·": ",",
}
# Slower, gentler reading for the bedtime shelf.
SPEED = {"little-lamps": 0.87}
SPEED_DEFAULT = 0.95


def speakable(text: str) -> str:
    for word, said in SAY.items():
        text = re.sub(rf"(?<!\w){re.escape(word)}(?!\w)" if word[0].isalnum() else re.escape(word), said, text)
    text = re.sub(r"(\d+)\s*[–-]\s*(\d+)", r"\1 to \2", text)          # 23–27 -> 23 to 27
    text = re.sub(r"\b(\d{2}):00\b", r"\1 hundred", text)              # 21:00
    text = re.sub(r"\b(\d{2}):(\d{2})\b", r"\1 \2", text)              # 21:14
    text = re.sub(r"`?([\w/]+)\.(py|csv)`?", lambda m: m.group(1).replace("/", " ").replace("_", " ") + " dot " + m.group(2), text)
    text = text.replace("_", " ").replace("/", " ")
    # Vietnamese and other diacritics: an English voice reads the bare letters best.
    text = "".join(c for c in unicodedata.normalize("NFD", text) if unicodedata.category(c) != "Mn")
    text = text.replace("đ", "d").replace("Đ", "D")
    text = "".join(c for c in text if ord(c) < 0x2600 or c in "—–")       # drop emoji
    return text


def shelf_of(slug: str) -> str:
    head = (ROOT / "stories" / f"{slug}.md").read_text().split("---")[1]
    return re.search(r"^shelf:\s*(\S+)", head, re.M).group(1)


def plan(script: str) -> list:
    parts = []
    for block in script.split("\n\n"):
        block = block.strip()
        if block == "[pause]":
            parts.append(narrate.Gap(1.6))
        elif block:
            lines = block.split("\n")  # prayers and letters keep their line pauses
            parts += [narrate.Say(speakable(line), after=0.8 if i == len(lines) - 1 else 0.35) for i, line in enumerate(lines)]
    return parts


def render(slug: str, voice: str) -> dict:
    script = subprocess.run(["node", str(ROOT / "generate.mjs"), "--speech", slug], check=True, capture_output=True, text=True).stdout
    narrator = narrate.Narrator(voice=voice, lang="en-us", speed=SPEED.get(shelf_of(slug), SPEED_DEFAULT))
    entry = narrate.master(narrator.render(plan(script)), ROOT / "audio" / f"{slug}.mp3", bitrate="48k", metadata={
        "title": slug, "artist": "Claude (AI) for Hearth & Horizon", "copyright": "CC BY-SA 4.0"})
    return {"bytes": entry["bytes"], "seconds": round(entry["seconds"], 1), "voice": f"kokoro-v1.0 {voice}"}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("slugs", nargs="+")
    parser.add_argument("--voice", default=VOICE, help=f"Kokoro voice name (default {VOICE})")
    args = parser.parse_args()
    manifest_path = ROOT / "audio" / "manifest.json"
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
    for slug in args.slugs:
        manifest[slug] = render(slug, args.voice)
        print(slug, manifest[slug])
        manifest_path.write_text(json.dumps(dict(sorted(manifest.items())), indent=2) + "\n")


if __name__ == "__main__":
    main()
