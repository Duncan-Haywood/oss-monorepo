#!/usr/bin/env python3
"""Render a short to a vertical MP4, offline and at $0, and record it in
video/manifest.json so the pages pick it up.

    python3 -m venv tts && tts/bin/pip install kokoro-onnx soundfile   # once
    tts/bin/python3 make_video.py is-the-eucharist-just-a-symbol
    node generate.mjs

Voice: the shared engine `platform/audio/narrate.py` (Kokoro v1.0, Apache 2.0).
Frames: `make_frames.mjs` (the hook card, one card per on-screen beat, an end
card) screenshotted with the pre-installed Playwright Chromium. ffmpeg joins
them: 720x1280, 30 fps, H.264 still-image tuning, AAC 64 kbps, so a minute is
well under a megabyte and loads fast on a phone.
"""
import argparse
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT.parents[1] / "platform" / "audio"))
import narrate  # noqa: E402

VOICE = "am_michael"
SPEED = 1.0
HOOK_SECONDS = 2.5
END_SECONDS = 3.0

# Words the voice reads badly, spelled the way they should sound.
SAY = {
    "Lemaître": "Le-metra",
    "Maccabeus": "Macca-bee-us",
    "Maccabees": "Macca-bees",
    "Smyrnaeans": "Smir-nee-ans",
    "Porres": "Porr-es",
}


def short_path(slug: str) -> Path:
    matches = sorted((ROOT / "shorts").glob(f"[0-9][0-9][0-9]-{slug}.md"))
    if not matches:
        raise SystemExit(f"no shorts/NNN-{slug}.md")
    return matches[0]


def script_paragraphs(path: Path) -> list[str]:
    text = path.read_text()
    body = text.split("## Script", 1)[1].split("\n## ", 1)[0]
    return [re.sub(r"\s+", " ", p).strip() for p in re.split(r"\n\s*\n", body) if p.strip()]


def speakable(text: str) -> str:
    for word, said in SAY.items():
        text = re.sub(rf"\b{re.escape(word)}\b", said, text)
    return text


def render(slug: str, models: Path) -> dict:
    narrator = narrate.Narrator(voice=VOICE, lang="en-us", speed=SPEED, models=models)
    plan = [narrate.Gap(0.3)] + [narrate.Say(speakable(p), after=0.45) for p in script_paragraphs(short_path(slug))]
    out = ROOT / "video" / f"{slug}.mp4"
    out.parent.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        voice = narrate.master(narrator.render(plan), tmp / "voice.mp3", bitrate="64k")
        subprocess.run(["node", str(ROOT / "make_frames.mjs"), slug, str(tmp / "frames")], check=True)
        frames = sorted((tmp / "frames").glob("frame-*.png"))
        beats = len(frames) - 2
        spoken = voice["seconds"]
        each = max(1.5, (spoken - HOOK_SECONDS) / max(beats, 1))
        durations = [HOOK_SECONDS] + [each] * beats + [END_SECONDS]
        lines = []
        for frame, seconds in zip(frames, durations):
            lines += [f"file '{frame}'", f"duration {seconds:.3f}"]
        lines.append(f"file '{frames[-1]}'")  # the concat demuxer drops the last duration otherwise
        (tmp / "list.txt").write_text("\n".join(lines) + "\n")
        total = sum(durations)
        subprocess.run([
            "ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(tmp / "list.txt"),
            "-i", str(tmp / "voice.mp3"), "-af", f"apad=whole_dur={total:.3f}",
            "-vf", "fps=30,format=yuv420p", "-c:v", "libx264", "-tune", "stillimage", "-crf", "28", "-preset", "veryslow",
            "-c:a", "aac", "-b:a", "64k", "-t", f"{total:.3f}", "-movflags", "+faststart",
            "-metadata", f"title={slug}", "-metadata", "comment=Written by an AI and read by a synthetic voice (Kokoro). CC BY-SA 4.0",
            str(out),
        ], check=True)
    return {"bytes": out.stat().st_size, "seconds": round(total, 1), "voice": f"kokoro-v1.0 {VOICE}"}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("slugs", nargs="+")
    parser.add_argument("--models", type=Path, default=Path.home() / ".cache" / "kokoro")
    args = parser.parse_args()
    manifest_path = ROOT / "video" / "manifest.json"
    for slug in args.slugs:
        entry = render(slug, args.models)
        manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
        manifest[slug] = entry
        manifest_path.write_text(json.dumps(dict(sorted(manifest.items())), indent=2) + "\n")
        print(slug, entry)


if __name__ == "__main__":
    main()
