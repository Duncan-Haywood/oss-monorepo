#!/usr/bin/env python3
"""Turn podcast scripts into episode audio, offline, with Piper text to speech.

    python3 platform/pages/podcast_tts.py --piper <piper executable> --model <voice.onnx>
    python3 platform/pages/podcast_tts.py ... --only 2026-10-20-some-slug   # one episode
    python3 platform/pages/podcast_tts.py --check                           # which scripts lack current audio

Reads `docs/podcast/<date>-<slug>.md`, writes `docs/podcast/audio/<date>-<slug>.mp3`
(mono MP3, ID3-tagged) and records bytes, seconds, the audio's sha256 and the
script's sha256 in `docs/podcast/audio/manifest.json`. A script whose sha256 is
already in the manifest is skipped, so editing a script is what re-voices it.
`podcast.mjs` publishes what this writes; the site build never runs a voice.

Setup (once, outside the repository): `python3 -m venv tts && tts/bin/pip install
piper-tts`, then download a voice's `.onnx` and `.onnx.json` from
huggingface.co/rhasspy/piper-voices. The published episodes use
`en_US-ljspeech-high`, trained on the public-domain LJ Speech recordings; pick a
voice whose dataset licence allows redistribution.

Needs `ffmpeg` and `ffprobe` on PATH.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PODCAST = ROOT / "docs" / "podcast"
AUDIO = PODCAST / "audio"
MANIFEST = AUDIO / "manifest.json"
SHOW = "Open Tools and Research podcast"


def split_script(text: str) -> tuple[dict[str, str], str]:
    """Front matter (flat key: value) and body."""
    m = re.match(r"^---\n(.*?)\n---\n?", text.replace("\r\n", "\n"), re.S)
    if not m:
        return {}, text
    meta = {}
    for line in m.group(1).splitlines():
        kv = re.match(r"^([A-Za-z_][\w-]*):\s*(.*)$", line)
        if kv:
            meta[kv.group(1)] = kv.group(2).strip().strip('"').strip("'")
    return meta, text[m.end():]


def spoken_lines(body: str) -> list[str]:
    """One line per paragraph: Piper voices each input line in turn."""
    return [re.sub(r"\s+", " ", p).strip() for p in re.split(r"\n\s*\n", body) if p.strip()]


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def load_manifest() -> dict:
    return json.loads(MANIFEST.read_text()) if MANIFEST.exists() else {}


def stale(manifest: dict) -> list[Path]:
    out = []
    for script in sorted(PODCAST.glob("*.md")):
        entry = manifest.get(script.stem)
        if not entry or entry.get("script_sha256") != sha256(script.read_bytes()) or not (AUDIO / f"{script.stem}.mp3").exists():
            out.append(script)
    return out


def voice(script: Path, piper: str, model: str, sentence_silence: float) -> dict:
    meta, body = split_script(script.read_text())
    text = "\n".join(spoken_lines(body)) + "\n"
    mp3 = AUDIO / f"{script.stem}.mp3"
    with tempfile.TemporaryDirectory() as tmp:
        wav = Path(tmp) / "episode.wav"
        subprocess.run([piper, "-m", model, "-f", str(wav), "--sentence-silence", str(sentence_silence)],
                       input=text.encode(), check=True, capture_output=True)
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav), "-ac", "1", "-ar", "22050",
                        "-codec:a", "libmp3lame", "-b:a", "40k",
                        "-metadata", f"title={meta.get('title', script.stem)}", "-metadata", f"artist={SHOW}",
                        "-metadata", f"album={SHOW}", "-metadata", f"date={meta.get('date', '')[:4]}",
                        "-metadata", "comment=Synthetic voice (Piper); script written by an AI agent.",
                        str(mp3)], check=True)
    seconds = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(mp3)],
                                   check=True, capture_output=True, text=True).stdout.strip())
    data = mp3.read_bytes()
    return {"bytes": len(data), "seconds": round(seconds, 2), "sha256": sha256(data),
            "script_sha256": sha256(script.read_bytes()), "voice": Path(model).stem}


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--piper", default="piper")
    ap.add_argument("--model")
    ap.add_argument("--only", action="append", default=[], help="file stem(s) to voice")
    ap.add_argument("--force", action="store_true", help="re-voice even when the script is unchanged")
    ap.add_argument("--sentence-silence", type=float, default=0.35)
    ap.add_argument("--check", action="store_true", help="list scripts without current audio; exit 1 if any")
    args = ap.parse_args(argv)

    manifest = load_manifest()
    todo = sorted(PODCAST.glob("*.md")) if args.force else stale(manifest)
    if args.only:
        todo = [s for s in sorted(PODCAST.glob("*.md")) if s.stem in args.only]
    if args.check:
        for s in todo:
            print(f"needs audio: {s.relative_to(ROOT)}")
        return 1 if todo else 0
    if not args.model:
        ap.error("--model is required to voice scripts")
    AUDIO.mkdir(parents=True, exist_ok=True)
    for script in todo:
        manifest[script.stem] = voice(script, args.piper, args.model, args.sentence_silence)
        e = manifest[script.stem]
        print(f"voiced {script.stem}: {e['seconds']:.0f} s, {e['bytes'] / 1e6:.1f} MB")
        MANIFEST.write_text(json.dumps(dict(sorted(manifest.items())), indent=2) + "\n")
    # Drop entries whose script is gone, so the manifest never names audio nobody publishes.
    live = {s.stem for s in PODCAST.glob("*.md")}
    manifest = {k: v for k, v in manifest.items() if k in live}
    MANIFEST.write_text(json.dumps(dict(sorted(manifest.items())), indent=2) + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
