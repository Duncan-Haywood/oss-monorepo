#!/usr/bin/env python3
"""Render a story to MP3 with Piper, offline and at $0, then record it in
audio/manifest.json so the pages and podcast feeds pick it up.

    python3 -m pip install piper-tts                        # once (bare `pip` may belong to another Python)
    python3 -m piper.download_voices en_US-ljspeech-high    # once; public-domain voice
    python3 render_audio.py the-slowest-bell-on-the-moon --voice path/to/en_US-ljspeech-high.onnx
    node generate.mjs

Needs ffmpeg and a network that reaches huggingface.co (the voice download; a sandbox that blocks it
cannot render, and `pip download` writes wheels into the current directory).
Output is mono 48 kbps MP3 at -16 LUFS, the usual podcast loudness. The LJSpeech voice is trained on a public-domain dataset, so the
audio can carry the same CC BY-SA licence as the text.
"""
import argparse
import json
import re
import subprocess
import tempfile
import unicodedata
import wave
from pathlib import Path

ROOT = Path(__file__).resolve().parent

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
PACE = {"little-lamps": 1.15}


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


def render(slug: str, voice_path: str) -> dict:
    from piper import PiperVoice, SynthesisConfig

    script = subprocess.run(["node", str(ROOT / "generate.mjs"), "--speech", slug], check=True, capture_output=True, text=True).stdout
    voice = PiperVoice.load(voice_path)
    config = SynthesisConfig(length_scale=PACE.get(shelf_of(slug), 1.05))
    rate = voice.config.sample_rate
    out_dir = ROOT / "audio"
    out_dir.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        wav_path = Path(tmp) / "story.wav"
        with wave.open(str(wav_path), "wb") as wav:
            wav.setnchannels(1)
            wav.setsampwidth(2)
            wav.setframerate(rate)
            for block in script.split("\n\n"):
                block = block.strip()
                if block == "[pause]":
                    wav.writeframes(b"\0\0" * int(rate * 1.6))
                    continue
                for line in block.split("\n"):  # prayers and letters keep their line pauses
                    for chunk in voice.synthesize(speakable(line), syn_config=config):
                        wav.writeframes(chunk.audio_int16_bytes)
                    wav.writeframes(b"\0\0" * int(rate * 0.35))
                wav.writeframes(b"\0\0" * int(rate * 0.45))
        with wave.open(str(wav_path)) as wav:
            seconds = wav.getnframes() / wav.getframerate()
        mp3 = out_dir / f"{slug}.mp3"
        subprocess.run(
            ["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav_path), "-ac", "1",
             "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-ar", "44100", "-codec:a", "libmp3lame", "-b:a", "48k",
             "-metadata", f"title={slug}", "-metadata", "artist=Claude (AI) for Hearth & Horizon",
             "-metadata", "copyright=CC BY-SA 4.0", str(mp3)],
            check=True,
        )
    return {"bytes": mp3.stat().st_size, "seconds": round(seconds, 1), "voice": Path(voice_path).stem}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("slugs", nargs="+")
    parser.add_argument("--voice", required=True, help="path to a Piper .onnx voice")
    args = parser.parse_args()
    manifest_path = ROOT / "audio" / "manifest.json"
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
    for slug in args.slugs:
        manifest[slug] = render(slug, args.voice)
        print(slug, manifest[slug])
        manifest_path.write_text(json.dumps(dict(sorted(manifest.items())), indent=2) + "\n")


if __name__ == "__main__":
    main()
