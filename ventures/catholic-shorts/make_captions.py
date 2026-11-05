#!/usr/bin/env python3
"""Write WebVTT captions for every rendered short, offline and at $0.

    python3 make_captions.py            # all videos in video/manifest.json
    python3 make_captions.py the-last-pew
    node generate.mjs                   # adds <track> to pages that have a .vtt

The narration is the script (`## Script` in shorts/NNN-slug.md). The voice
speaks it at an even pace with a fixed pause between paragraphs, so each cue's
time is the sentence's share of the speech window. The window is measured from
the finished MP4 with ffmpeg `silencedetect` (first sound to last sound), not
guessed. Cue times are therefore close, not frame exact; the full text is also
on the page as a transcript.
"""
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PAUSE = 0.45          # make_video.py: Say(after=0.45) between paragraphs
MAX_CUE = 80          # characters per cue, two short lines on a phone


def paragraphs(path: Path) -> list[str]:
    body = path.read_text().split("## Script", 1)[1].split("\n## ", 1)[0]
    return [re.sub(r"\s+", " ", p).strip() for p in re.split(r"\n\s*\n", body) if p.strip()]


def chunks(paragraph: str) -> list[str]:
    """Split a paragraph at sentence ends, then at commas, into cues of at most MAX_CUE characters."""
    out = []
    for sentence in re.split(r"(?<=[.!?])\s+", paragraph):
        parts, cur = [], ""
        for piece in re.split(r"(?<=[,;:])\s+", sentence):
            if cur and len(cur) + 1 + len(piece) > MAX_CUE:
                parts.append(cur)
                cur = piece
            else:
                cur = f"{cur} {piece}".strip()
        if cur:
            parts.append(cur)
        out += parts
    return out


def speech_window(mp4: Path) -> tuple[float, float]:
    """First and last moment of sound, from ffmpeg silencedetect."""
    err = subprocess.run(
        ["ffmpeg", "-i", str(mp4), "-af", "silencedetect=noise=-40dB:d=0.3", "-f", "null", "-"],
        capture_output=True, text=True, check=True,
    ).stderr
    spans = re.findall(r"silence_start: (-?[\d.]+)(?:.*?silence_end: ([\d.]+))?", err, re.S)
    total = float(re.findall(r"time=(\d+):(\d+):([\d.]+)", err)[-1][2]) + 60 * float(re.findall(r"time=(\d+):(\d+):([\d.]+)", err)[-1][1])
    begin = 0.0
    if spans and float(spans[0][0]) <= 0.01 and spans[0][1]:
        begin = float(spans[0][1])
    # The audio is padded with silence to the end of the end card: the last speech is where that final silence starts.
    end = float(spans[-1][0]) if spans else total
    return begin, end


def stamp(t: float) -> str:
    h, rem = divmod(t, 3600)
    m, s = divmod(rem, 60)
    return f"{int(h):02d}:{int(m):02d}:{s:06.3f}"


def vtt(paras: list[str], begin: float, end: float) -> str:
    cues = [(c, len(c)) for p in paras for c in chunks(p)]
    gaps = (len(paras) - 1) * PAUSE
    spoken = max(end - begin - gaps, 1.0)
    per_char = spoken / sum(n for _, n in cues)
    lines, t, i = ["WEBVTT", ""], begin, 0
    for p in paras:
        for cue in chunks(p):
            dur = len(cue) * per_char
            i += 1
            lines += [str(i), f"{stamp(t)} --> {stamp(t + dur)}", cue, ""]
            t += dur
        t += PAUSE
    return "\n".join(lines)


def short_path(slug: str) -> Path:
    found = sorted((ROOT / "shorts").glob(f"[0-9][0-9][0-9]-{slug}.md"))
    if not found:
        raise SystemExit(f"no shorts/NNN-{slug}.md")
    return found[0]


def main() -> None:
    slugs = sys.argv[1:] or sorted(json.loads((ROOT / "video" / "manifest.json").read_text()))
    out = ROOT / "captions"
    out.mkdir(exist_ok=True)
    for slug in slugs:
        begin, end = speech_window(ROOT / "video" / f"{slug}.mp4")
        (out / f"{slug}.vtt").write_text(vtt(paragraphs(short_path(slug)), begin, end))
        print(f"{slug}: speech {begin:.2f}s to {end:.2f}s")


if __name__ == "__main__":
    main()
