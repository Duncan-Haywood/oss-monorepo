#!/usr/bin/env python3
"""Turn podcast scripts into episode audio, once, offline, with Kokoro text to speech.

    <venv>/bin/python platform/pages/podcast_tts.py                      # voice every script without current audio
    <venv>/bin/python platform/pages/podcast_tts.py --only 2026-10-20-some-slug
    python3 platform/pages/podcast_tts.py --check                        # which scripts lack current audio

Reads `docs/podcast/<date>-<slug>.md`, writes `docs/podcast/audio/<date>-<slug>.mp3`
(mono MP3 at -16 LUFS, ID3-tagged) and records bytes, seconds, the audio's sha256,
the script's sha256 and the voice in `docs/podcast/audio/manifest.json`. A script
whose sha256 and voice already match the manifest is skipped, so editing a script,
or changing `VOICE`, is what re-voices it. Voicing happens once, on the machine
that makes the episode; the MP3 is committed and `podcast.mjs` publishes it, so
the site build and the listener never run a model.

The voice is Kokoro-82M (huggingface.co/hexgrad/Kokoro-82M, Apache-2.0 weights,
trained on permissively licensed and synthetic audio, so the output can be
redistributed). It is a modern neural model with natural prosody, in place of the
flat Piper LJ Speech voice the first episodes used. It runs on a CPU at several
times real time; a GPU is used when torch finds one.

Setup (once, outside the repository): `python3 -m venv tts && tts/bin/pip install
kokoro soundfile` (add `--index-url https://download.pytorch.org/whl/cpu` to a
first `tts/bin/pip install torch` to skip the CUDA wheels). The weights download
from huggingface.co on first use. Needs `ffmpeg` and `ffprobe` on PATH, and
`espeak-ng` for words outside Kokoro's dictionary.
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

MODEL = "hexgrad/Kokoro-82M"
# af_heart is the voice Kokoro's own card grades highest; a warm, conversational read.
VOICE = "af_heart"
VOICE_ID = f"kokoro-82m-{VOICE}"
RATE = 24000
# Breaths between paragraphs: a short beat between thoughts, a longer one after the
# opening line and before the sign-off, where a person reading aloud would pause.
PARAGRAPH_PAUSE = 0.55
SECTION_PAUSE = 0.9

# Written forms the voice says badly, spelled the way a person would say them.
SAY = [
    (r"\bAI\b", "A.I."),
    (r"\bCI\b", "C.I."),
    (r"\bPR\b", "P.R."),
    (r"\bPRs\b", "P.R.s"),
    (r"\bSEO\b", "S.E.O."),
    (r"\bMCP\b", "M.C.P."),
    (r"\bAPI\b", "A.P.I."),
    (r"\bLLM\b", "L.L.M."),
    (r"\bLLMs\b", "L.L.M.s"),
    (r"\bCPU\b", "C.P.U."),
    (r"\bGPU\b", "G.P.U."),
    (r"\btypeof\b", "type of"),
]


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
    """One string per paragraph, with written forms respelled for the voice."""
    out = []
    for p in re.split(r"\n\s*\n", body):
        p = re.sub(r"\s+", " ", p).strip()
        for pattern, said in SAY:
            p = re.sub(pattern, said, p)
        if p:
            out.append(p)
    return out


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def load_manifest() -> dict:
    return json.loads(MANIFEST.read_text()) if MANIFEST.exists() else {}


def scripts() -> list[Path]:
    """Scripts this pipeline voices: those with front matter (a script without it is hand-written)."""
    return [s for s in sorted(PODCAST.glob("*.md")) if split_script(s.read_text())[0]]


def stale(manifest: dict) -> list[Path]:
    out = []
    for script in scripts():
        entry = manifest.get(script.stem)
        if (not entry or entry.get("script_sha256") != sha256(script.read_bytes()) or entry.get("voice") != VOICE_ID
                or not (AUDIO / f"{script.stem}.mp3").exists()):
            out.append(script)
    return out


def synthesise(pipeline, lines: list[str], speed: float):
    """The episode as one float waveform at RATE, paragraph by paragraph with pauses between."""
    import numpy as np

    beat = np.zeros(int(PARAGRAPH_PAUSE * RATE), dtype=np.float32)
    section = np.zeros(int(SECTION_PAUSE * RATE), dtype=np.float32)
    parts = []
    for i, line in enumerate(lines):
        for result in pipeline(line, voice=VOICE, speed=speed, split_pattern=None):
            if result.audio is not None:
                parts.append(result.audio.cpu().numpy() if hasattr(result.audio, "cpu") else np.asarray(result.audio))
        if i < len(lines) - 1:
            parts.append(section if i == 0 or i == len(lines) - 2 else beat)
    return np.concatenate(parts)


def voice(script: Path, pipeline, speed: float) -> dict:
    import soundfile as sf

    meta, body = split_script(script.read_text())
    mp3 = AUDIO / f"{script.stem}.mp3"
    with tempfile.TemporaryDirectory() as tmp:
        wav = Path(tmp) / "episode.wav"
        sf.write(wav, synthesise(pipeline, spoken_lines(body), speed), RATE)
        # One-pass loudness to the podcast norm, a gentle high-pass to take out rumble, mono 48 kbps.
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav),
                        "-af", "highpass=f=70,loudnorm=I=-16:TP=-1.5:LRA=11", "-ac", "1", "-ar", str(RATE),
                        "-codec:a", "libmp3lame", "-b:a", "48k",
                        "-metadata", f"title={meta.get('title', script.stem)}", "-metadata", f"artist={SHOW}",
                        "-metadata", f"album={SHOW}", "-metadata", f"date={meta.get('date', '')[:4]}",
                        "-metadata", "comment=Synthetic voice (Kokoro-82M); script written by an AI agent.",
                        str(mp3)], check=True)
    seconds = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(mp3)],
                                   check=True, capture_output=True, text=True).stdout.strip())
    data = mp3.read_bytes()
    return {"bytes": len(data), "seconds": round(seconds, 2), "sha256": sha256(data),
            "script_sha256": sha256(script.read_bytes()), "voice": VOICE_ID}


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--only", action="append", default=[], help="file stem(s) to voice")
    ap.add_argument("--force", action="store_true", help="re-voice even when the script and voice are unchanged")
    ap.add_argument("--speed", type=float, default=1.0)
    ap.add_argument("--check", action="store_true", help="list scripts without current audio; exit 1 if any")
    args = ap.parse_args(argv)

    manifest = load_manifest()
    todo = scripts() if args.force else stale(manifest)
    if args.only:
        todo = [s for s in scripts() if s.stem in args.only]
    if args.check:
        for s in todo:
            print(f"needs audio: {s.relative_to(ROOT)}")
        return 1 if todo else 0
    AUDIO.mkdir(parents=True, exist_ok=True)
    if todo:
        from kokoro import KPipeline

        pipeline = KPipeline(lang_code="a", repo_id=MODEL)
    for script in todo:
        manifest[script.stem] = voice(script, pipeline, args.speed)
        e = manifest[script.stem]
        print(f"voiced {script.stem}: {e['seconds']:.0f} s, {e['bytes'] / 1e6:.1f} MB", flush=True)
        MANIFEST.write_text(json.dumps(dict(sorted(manifest.items())), indent=2) + "\n")
    # Drop entries whose script is gone, so the manifest never names audio nobody publishes.
    live = {s.stem for s in scripts()}
    manifest = {k: v for k, v in manifest.items() if k in live}
    MANIFEST.write_text(json.dumps(dict(sorted(manifest.items())), indent=2) + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
