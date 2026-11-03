#!/usr/bin/env python3
"""Render a Sed Contra episode, offline and at $0, into every format from one script.

    python3 -m venv tts && tts/bin/pip install kokoro-onnx soundfile pillow
    tts/bin/python render.py the-first-mover            # everything
    tts/bin/python render.py the-first-mover --only audio
    node generate.mjs                                     # pages pick up media/manifest.json

From `episodes/NNN-<slug>.md` (parsed by `script.mjs`, so the site and the media
never read the script differently) it writes, under `media/`:

- `<slug>.mp3`         the podcast episode (mono, -16 LUFS, the shared engine's mastering)
- `<slug>.chapters.json` Podcasting 2.0 chapters, and `<slug>.youtube.txt`, the same
                         chapters as YouTube description timestamps
- `<slug>.vtt`         WebVTT captions, one cue per sentence, timed from the voiced audio
                         (YouTube, the page's <track> and the feed's transcript all take it)
- `<slug>.mp4`         the long-form video, 1920x1080: one typeset card per line,
                         speaker named, Thomas's words in italic with the citation,
                         the sky warming from night to dawn as the episode runs,
                         and chapter markers in the file
- `<short-id>.mp4`     each `## Short:` section as a 1080x1920 vertical video
                         under 60 seconds, with large on-screen captions

Voices are Kokoro v1.0 (Apache-2.0 weights) through `platform/audio/narrate.py`,
which caches every sentence, so editing one line re-voices that line only.
Frames are drawn with Pillow and joined with ffmpeg; no model draws anything.
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT.parents[1] / "platform" / "audio"))
import narrate  # noqa: E402

SPEED = 0.95
GAP_LINE = 0.55      # seconds after each spoken line
GAP_CHAPTER = 1.6    # seconds between chapters
SHORT_MAX = 60.0     # seconds; YouTube Shorts, Reels and TikTok all take a minute

FONT_DIRS = ["/usr/share/fonts/truetype/liberation", "/usr/share/fonts/truetype/dejavu", "/usr/share/fonts/opentype/inter"]
FONTS = {
    "serif": ["LiberationSerif-Regular.ttf", "DejaVuSerif.ttf"],
    "italic": ["LiberationSerif-Italic.ttf", "DejaVuSerif-Italic.ttf"],
    "label": ["Inter-SemiBold.otf", "DejaVuSans-Bold.ttf"],
    "small": ["Inter-Regular.otf", "DejaVuSans.ttf"],
}
# One colour per speaker role, readable on the night sky.
ACCENT = {"NARRATOR": (200, 200, 214), "READER": (232, 196, 120), "MAREN": (150, 196, 232), "TEODOR": (226, 160, 132)}
ACCENT_DEFAULT = (210, 210, 210)
NIGHT_TOP, NIGHT_LOW = np.array([10, 13, 26]), np.array([22, 28, 52])
DAWN_TOP, DAWN_LOW = np.array([34, 40, 66]), np.array([176, 112, 70])

# Words the voice reads badly, spelled as they should sound.
SAY = {"Ex. 3:14": "Exodus three, fourteen", "Obj. 1:": "Objection one.", "Obj. 2:": "Objection two.",
       "Reply Obj. 1:": "Reply to objection one.", "Reply Obj. 2:": "Reply to objection two.",
       "Enchiridion xi": "Enchiridion, chapter eleven", "per se": "per say", "Staithe": "Stayth"}


def font(kind: str, size: int) -> ImageFont.FreeTypeFont:
    for name in FONTS[kind]:
        for d in FONT_DIRS:
            p = Path(d) / name
            if p.exists():
                return ImageFont.truetype(str(p), size)
    return ImageFont.load_default(size)


def speakable(text: str) -> str:
    for k in sorted(SAY, key=len, reverse=True):
        text = text.replace(k, SAY[k])
    text = text.replace(" … ", ", ").replace("… ", "").replace(" …", ".")
    return re.sub(r"\(([^)]*)\)", r", \1,", text).replace(",,", ",")


def load(slug: str) -> dict:
    out = subprocess.run(["node", str(ROOT / "generate.mjs"), "--segments", slug], check=True, capture_output=True, text=True).stdout
    return json.loads(out)


def citation(source: str) -> str:
    m = re.match(r"^(I|I-II|II-II|III)-q(\d+)-a(\d+)$", source)
    return f"Summa Theologiae {m[1]}, q. {m[2]}, a. {m[3]}" if m else source


# --- audio -----------------------------------------------------------------------
class Voices:
    def __init__(self):
        self.by_voice: dict[str, narrate.Narrator] = {}

    def say(self, voice: str, text: str) -> np.ndarray:
        n = self.by_voice.setdefault(voice, narrate.Narrator(voice=voice, lang="en-us", speed=SPEED))
        return n.render([narrate.Say(speakable(text))])

    def warm(self, chapters: list[dict]) -> None:
        """Voice every unit up front, one parallel batch per voice."""
        per: dict[str, list[str]] = {}
        for ch in chapters:
            for s in ch["segments"]:
                per.setdefault(s["voice"], []).extend(narrate.sentences(speakable(s["text"])))
        for voice, units in per.items():
            self.by_voice.setdefault(voice, narrate.Narrator(voice=voice, lang="en-us", speed=SPEED)).voice_units(units)


def timeline(chapters: list[dict], voices: Voices) -> tuple[np.ndarray, list[dict]]:
    """The whole piece as one waveform, and each line's start and end in seconds."""
    parts, cues, t = [], [], 0.0
    for ci, ch in enumerate(chapters):
        if ci:
            parts.append(narrate.silence(GAP_CHAPTER)); t += GAP_CHAPTER
        for s in ch["segments"]:
            a = voices.say(s["voice"], s["text"])
            dur = len(a) / narrate.RATE
            cues.append({**s, "chapter": ch["id"], "chapterTitle": ch["title"], "start": t, "end": t + dur})
            parts += [a, narrate.silence(GAP_LINE)]
            t += dur + GAP_LINE
    return np.concatenate(parts), cues


def chapter_marks(cues: list[dict]) -> list[dict]:
    seen, marks = set(), []
    for c in cues:
        if c["chapter"] not in seen:
            seen.add(c["chapter"]); marks.append({"startTime": round(c["start"], 2), "title": c["chapterTitle"]})
    return marks


def stamp(t: float, srt: bool = False) -> str:
    h, rem = divmod(t, 3600); m, s = divmod(rem, 60)
    if srt:
        return f"{int(h):02}:{int(m):02}:{int(s):02}.{int(round((s % 1) * 1000)) % 1000:03}"
    return f"{int(h)}:{int(m):02}:{int(s):02}" if h else f"{int(m)}:{int(s):02}"


def captions(cues: list[dict]) -> str:
    """WebVTT, one cue per sentence, each line's time shared out by characters."""
    out, n = [], 0
    for c in cues:
        sents = narrate.sentences(c["text"].replace(" … ", " … "))
        total = sum(len(x) for x in sents) or 1
        t = c["start"]
        for x in sents:
            d = (c["end"] - c["start"]) * len(x) / total
            n += 1
            label = "" if c["speaker"] == "NARRATOR" else f"{c['name'].split(' (')[0].upper()}: "
            out.append(f"{stamp(t, True)} --> {stamp(t + d, True)}\n{label}{x}\n")
            t += d
    return "WEBVTT\n\n" + "\n".join(out)


# --- frames ----------------------------------------------------------------------
def wrap(draw: ImageDraw.ImageDraw, text: str, f: ImageFont.FreeTypeFont, width: int) -> list[str]:
    lines, line = [], ""
    for w in text.split():
        trial = f"{line} {w}".strip()
        if draw.textlength(trial, font=f) <= width or not line:
            line = trial
        else:
            lines.append(line); line = w
    return lines + ([line] if line else [])


def pages(draw, text: str, f, width: int, max_lines: int) -> list[str]:
    """Split a long line into screens that fit, breaking at sentence ends where possible."""
    out, cur = [], ""
    for sent in narrate.sentences(text) or [text]:
        trial = f"{cur} {sent}".strip()
        if len(wrap(draw, trial, f, width)) <= max_lines or not cur:
            cur = trial
        else:
            out.append(cur); cur = sent
    out.append(cur)
    fixed = []
    for p in out:  # a single sentence too long for one screen: cut by lines
        ls = wrap(draw, p, f, width)
        fixed += [" ".join(ls[i:i + max_lines]) for i in range(0, len(ls), max_lines)]
    return fixed


def sky(w: int, h: int, progress: float) -> Image.Image:
    top = NIGHT_TOP + (DAWN_TOP - NIGHT_TOP) * progress
    low = NIGHT_LOW + (DAWN_LOW - NIGHT_LOW) * progress ** 1.5
    ramp = np.linspace(0, 1, h)[:, None] ** 2.2
    col = top[None, :] * (1 - ramp) + low[None, :] * ramp
    return Image.fromarray(np.repeat(col[:, None, :], w, axis=1).astype(np.uint8))


class Layout:
    def __init__(self, w: int, h: int):
        self.w, self.h = w, h
        tall = h > w
        u = w / 1920 if not tall else w / 1080
        self.margin = int((140 if not tall else 80) * u)
        self.body = font("serif", int((54 if not tall else 66) * u))
        self.quote = font("italic", int((54 if not tall else 66) * u))
        self.label = font("label", int((30 if not tall else 38) * u))
        self.small = font("small", int((26 if not tall else 32) * u))
        self.lines = 8 if not tall else 11
        self.lead = int((78 if not tall else 92) * u)


def card(lay: Layout, show: str, chapter: str, cue: dict, text: str, progress: float) -> Image.Image:
    img = sky(lay.w, lay.h, progress)
    d = ImageDraw.Draw(img)
    m = lay.margin
    d.text((m, m * 0.6), show.upper(), font=lay.label, fill=(232, 196, 120))
    d.text((m, m * 0.6 + lay.lead * 0.6), chapter, font=lay.small, fill=(190, 190, 205))
    quote = cue["speaker"] == "READER"
    f = lay.quote if quote else lay.body
    ls = wrap(d, ("“" + text + "”") if quote else text, f, lay.w - 2 * m)
    block = len(ls) * lay.lead
    y = (lay.h - block) / 2
    accent = ACCENT.get(cue["speaker"], ACCENT_DEFAULT)
    d.text((m, y - lay.lead * 0.95), cue["name"].upper(), font=lay.label, fill=accent)
    if quote:
        d.rectangle([m - int(28 * lay.w / 1920) - 6, y, m - int(28 * lay.w / 1920), y + block - lay.lead * 0.2], fill=accent)
    for i, line in enumerate(ls):
        d.text((m, y + i * lay.lead), line, font=f, fill=(244, 240, 232))
    if quote and cue.get("source"):
        d.text((m, y + block + lay.lead * 0.3), f"{citation(cue['source'])}, tr. English Dominican Province (1920)",
               font=lay.small, fill=(200, 190, 170))
    d.text((m, lay.h - m * 0.6 - lay.lead * 0.5), "AI-written fiction around Thomas's own words · CC BY-SA 4.0",
           font=lay.small, fill=(170, 170, 185))
    bar = lay.h - int(m * 0.25)
    d.rectangle([0, bar, lay.w, bar + 6], fill=(40, 44, 66))
    d.rectangle([0, bar, int(lay.w * progress), bar + 6], fill=(232, 196, 120))
    return img


def video(cues: list[dict], audio_mp3: Path, out: Path, size: tuple[int, int], show: str, marks: list[dict]) -> dict:
    lay = Layout(*size)
    total = cues[-1]["end"] + GAP_LINE
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        probe = ImageDraw.Draw(Image.new("RGB", (8, 8)))
        frames: list[tuple[Path, float]] = []
        cursor = 0.0
        for c in cues:
            f = lay.quote if c["speaker"] == "READER" else lay.body
            screens = pages(probe, c["text"], f, lay.w - 2 * lay.margin, lay.lines)
            chars = sum(len(s) for s in screens) or 1
            t = c["start"]
            for s in screens:
                end = t + (c["end"] - c["start"]) * len(s) / chars
                p = tmp / f"{len(frames):05}.png"
                card(lay, show, c["chapterTitle"], c, s, min(1.0, t / total)).save(p)
                # the screen stays up from where the last one ended (the gap after a line keeps its card)
                frames.append((p, end - cursor)); cursor = end
                t = end
        frames[-1] = (frames[-1][0], frames[-1][1] + (total - cursor))
        listing = "".join(f"file '{p}'\nduration {d:.3f}\n" for p, d in frames) + f"file '{frames[-1][0]}'\n"
        (tmp / "list.txt").write_text(listing)
        meta = ";FFMETADATA1\n" + "".join(
            f"[CHAPTER]\nTIMEBASE=1/1000\nSTART={int(mk['startTime'] * 1000)}\nEND={int((marks[i + 1]['startTime'] if i + 1 < len(marks) else total) * 1000)}\ntitle={mk['title']}\n"
            for i, mk in enumerate(marks))
        (tmp / "meta.txt").write_text(meta)
        out.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(tmp / "list.txt"),
                        "-i", str(audio_mp3), "-i", str(tmp / "meta.txt"), "-map", "0:v", "-map", "1:a", "-map_metadata", "2",
                        "-map_chapters", "2", "-vf", "fps=12,format=yuv420p", "-c:v", "libx264", "-preset", "slow",
                        "-tune", "stillimage", "-crf", "28", "-c:a", "aac", "-b:a", "64k", "-movflags", "+faststart",
                        "-shortest", str(out)], check=True)
    secs = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(out)],
                                check=True, capture_output=True, text=True).stdout)
    return {"file": out.name, "bytes": out.stat().st_size, "seconds": round(secs, 1), "width": size[0], "height": size[1]}


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("slug")
    ap.add_argument("--only", choices=["audio", "video", "shorts"], help="render one part (audio is needed before video)")
    args = ap.parse_args()
    ep = load(args.slug)
    media = ROOT / "media"
    manifest_path = media / "manifest.json"
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
    entry = manifest.get(args.slug, {})
    voices = Voices()
    show = f"Sed Contra · {ep['title']}"
    voice_names = sorted({s["voice"] for ch in ep["chapters"] + ep["shorts"] for s in ch["segments"]})

    if args.only in (None, "audio", "video"):
        voices.warm(ep["chapters"])
        pcm, cues = timeline(ep["chapters"], voices)
        marks = chapter_marks(cues)
        mp3 = media / f"{args.slug}.mp3"
        if args.only != "video" or not mp3.exists():
            a = narrate.master(pcm, mp3, bitrate="48k", metadata={
                "title": f"Sed Contra {ep['title']}", "artist": "Claude (AI) for Sed Contra", "copyright": "CC BY-SA 4.0"})
            entry["audio"] = {"file": mp3.name, "bytes": a["bytes"], "seconds": a["seconds"]}
        (media / f"{args.slug}.chapters.json").write_text(json.dumps({"version": "1.2.0", "chapters": marks}, indent=2) + "\n")
        (media / f"{args.slug}.youtube.txt").write_text("".join(f"{stamp(m['startTime'])} {m['title']}\n" for m in marks))
        (media / f"{args.slug}.vtt").write_text(captions(cues))
        if args.only != "audio":
            entry["video"] = video(cues, mp3, media / f"{args.slug}.mp4", (1920, 1080), show, marks)

    if args.only in (None, "shorts"):
        voices.warm(ep["shorts"])
        entry["shorts"] = {}
        for sh in ep["shorts"]:
            pcm, cues = timeline([sh], voices)
            secs = len(pcm) / narrate.RATE
            if secs > SHORT_MAX:
                sys.exit(f"{sh['id']}: {secs:.1f} s is over the {SHORT_MAX:.0f} s a short may run; cut the script")
            mp3 = Path(tempfile.mkdtemp()) / f"{sh['id']}.mp3"
            narrate.master(pcm, mp3, bitrate="64k")
            entry["shorts"][sh["id"]] = {**video(cues, mp3, media / f"{sh['id']}.mp4", (1080, 1920), "Sed Contra", chapter_marks(cues)),
                                          "title": sh["title"]}
    entry["voices"] = [f"kokoro-v1.0 {v}" for v in voice_names]
    manifest[args.slug] = entry
    manifest_path.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n")
    print(json.dumps(entry, indent=2))


if __name__ == "__main__":
    main()
