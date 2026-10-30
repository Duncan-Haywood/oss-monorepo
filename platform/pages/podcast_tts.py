#!/usr/bin/env python3
"""Turn podcast scripts into episode audio, once, offline, with Kokoro text to speech.

    <venv>/bin/python platform/pages/podcast_tts.py                      # voice every script without current audio
    <venv>/bin/python platform/pages/podcast_tts.py --only 2026-10-20-some-slug
    python3 platform/pages/podcast_tts.py --check                        # which scripts lack current audio

Reads `docs/podcast/<date>-<slug>.md`, writes `docs/podcast/audio/<date>-<slug>.mp3`
(mono 48 kbps MP3 at -16 LUFS, ID3-tagged) and records bytes, seconds, the audio's sha256,
the script's sha256 and the voice in `docs/podcast/audio/manifest.json`. A script
whose sha256 and voice already match the manifest is skipped, so editing a script,
or changing `VOICE`, is what re-voices it. Voicing happens once, on the machine
that makes the episode; the MP3 is committed and `podcast.mjs` publishes it, so
the site build and the listener never run a model.

The voice is Kokoro-82M (huggingface.co/hexgrad/Kokoro-82M, Apache-2.0 weights,
trained on permissively licensed and synthetic audio, so the output can be
redistributed), rendered by the shared engine in `platform/audio/narrate.py`:
sentence-level cache (an edited script re-voices only the sentences that changed),
one worker per core, designed pauses and fixed-gain loudness. It runs on a CPU at
about four times real time.

Setup (once, outside the repository): `python3 -m venv tts && tts/bin/pip install
kokoro-onnx soundfile`, plus the optional misaki install in `narrate.py`'s
docstring for Kokoro's own English pronunciation. The model files download
from huggingface.co on first use. Needs `ffmpeg` and `ffprobe` on PATH.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "platform" / "audio"))
PODCAST = ROOT / "docs" / "podcast"
AUDIO = PODCAST / "audio"
MANIFEST = AUDIO / "manifest.json"
SHOW = "Open Tools and Research podcast"

# af_heart is the voice Kokoro's own card grades highest; a warm, conversational read.
VOICE = "af_heart"
VOICE_ID = f"kokoro-82m-{VOICE}"
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


def plan(lines: list[str]) -> list:
    """The episode as a narration script: paragraphs, with a longer breath after the
    opening line and before the sign-off, where a person reading aloud would pause."""
    from narrate import Say

    last = len(lines) - 1
    return [Say(line, after=0.0 if i == last else SECTION_PAUSE if i in (0, last - 1) else PARAGRAPH_PAUSE)
            for i, line in enumerate(lines)]


def voice(script: Path, narrator) -> dict:
    from narrate import master

    meta, body = split_script(script.read_text())
    entry = master(narrator.render(plan(spoken_lines(body))), AUDIO / f"{script.stem}.mp3", bitrate="48k", metadata={
        "title": meta.get("title", script.stem), "artist": SHOW, "album": SHOW, "date": meta.get("date", "")[:4],
        "comment": "Synthetic voice (Kokoro-82M); script written by an AI agent."})
    return {**entry, "script_sha256": sha256(script.read_bytes()), "voice": VOICE_ID}


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
        from narrate import Narrator

        narrator = Narrator(voice=VOICE, lang="en-us", speed=args.speed)
    for script in todo:
        manifest[script.stem] = voice(script, narrator)
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
