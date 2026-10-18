"""Settings. They live outside the repo because they name personal drives and folders."""
from __future__ import annotations

import os
import tomllib
from dataclasses import dataclass, field
from pathlib import Path

DEFAULT_PATH = Path(os.environ.get("IGMP_CONFIG", "~/.config/igmp/config.toml")).expanduser()

TEMPLATE = """\
# igmp settings. Paths are yours; nothing here is committed anywhere.

# Folders scanned for media. Files named YYYY-MM-DD_HHMMSS_Location[_Event]_Camera_Original.EXT
# are read directly; Insta360 folders are read through their _index.csv.
library_roots = ["/Volumes/PhotoDrive/2026"]

# Where previews, edits, reels and the state database go.
output_dir = "/Volumes/PhotoDrive/IG"

# "claude-code" runs `claude -p` on your Claude plan; "api" uses an Anthropic API key and batches.
backend = "claude-code"
model = "claude-opus-5-5"
parallel = 4

# Reel lengths. Three classes: short (7-15 s, several per event, each with its own hook), medium
# (30-60 s, a story arc) and long (60 s-3 min, trip and event recaps). These are the targets;
# reel_caps are the hard limits.
reel_seconds = 12.0             # short target
reel_medium_seconds = 45.0
reel_long_seconds = 120.0
# reel_caps = { short = 15.0, medium = 60.0, long = 180.0 }
beat_seconds = 0.5      # cut grid for reels without music
photo_aspect = "4:5"    # or "3:4"

# Music. "auto": every reel gets a track from music_dir, cut on its beats, mixed and loudness
# normalised for Instagram (-14 LUFS, -1 dBTP). "none": silent reels; add a sound in the app.
# An empty or missing music_dir also means silent reels.
music = "auto"
# music_dir = "/Volumes/PhotoDrive/IG/music"   # default: <output_dir>/music
# Each track needs a sidecar licence record next to it, e.g. song.mp3.license.json:
#   {"source": "...", "license": "CC0-1.0", "attribution": null, "url": "https://..."}
# Tracks without one are never used, nor are NC / ND licences. CC BY credits go in the caption.
natural_sound = true    # keep the clips' own sound under the music; loud moments duck the music
# natural_sound_db = -12  # where the clips' steady sound sits, dB under the music

# Events whose key contains one of these go to reels/_review/ (they feature other people), even
# when the critic shipped them; you approve them by hand.
# review_events = ["Wedding"]
# reel_workers = 4        # reels in progress at once (Claude calls stay within `parallel`)
# reel_render_slots = 2   # reels rendering at once (each render uses every core for its segments)
# posts_per_week = 3      # the posting queue in ready/index.csv
"""

REEL_CLASSES = ("short", "medium", "long")
# (floor, target, cap) seconds per class; the short target is Config.reel_seconds
REEL_DEFAULTS = {"short": (7.0, 12.0, 15.0), "medium": (30.0, 45.0, 60.0), "long": (60.0, 120.0, 180.0)}


@dataclass
class Config:
    library_roots: list[Path]
    output_dir: Path
    backend: str = "claude-code"
    model: str = "claude-opus-5-5"
    parallel: int = 4
    claude_cli: str = "claude"
    rawtherapee_cli: str = "/Applications/RawTherapee.app/Contents/MacOS/rawtherapee-cli"
    ffmpeg: str = "ffmpeg"
    ffprobe: str = "ffprobe"
    exiftool: str = "exiftool"
    reel_seconds: float = 12.0          # the short reel's target length (see reel_length)
    reel_medium_seconds: float = 45.0
    reel_long_seconds: float = 120.0
    reel_caps: dict = field(default_factory=dict)  # class -> hard limit (s); defaults REEL_DEFAULTS
    beat_seconds: float = 0.5
    photo_aspect: str = "4:5"
    style_guide: Path | None = None
    places: dict = field(default_factory=dict)   # location label -> city/state/country/timezone/lat/lon
    extra: dict = field(default_factory=dict)

    @property
    def state_dir(self) -> Path:
        return self.output_dir / "state"

    @property
    def db_path(self) -> Path:
        return self.state_dir / "igmp.sqlite"

    def reel_length(self, length_class: str = "short") -> tuple[float, float, float]:
        """(floor, target, cap) seconds for a reel of this class. The target is what the story pass
        aims for, the cap the hard limit snap() and the renderer hold it to, the floor its lower
        edge. reel_seconds is the short target (as it was the reel length before classes); a
        short target under the class floor (7 s) is taken as a fixed length (cap = target)."""
        if length_class not in REEL_DEFAULTS:
            raise ValueError(f"unknown reel class {length_class!r}; use one of {REEL_CLASSES}")
        floor, _, cap = REEL_DEFAULTS[length_class]
        target = {"short": self.reel_seconds, "medium": self.reel_medium_seconds,
                  "long": self.reel_long_seconds}[length_class]
        cap = float((self.reel_caps or {}).get(length_class, cap))
        if length_class == "short" and target < floor:
            return target, target, target
        target = min(target, cap)
        return min(floor, target), target, cap

    def reel_cap(self, length_class: str = "short") -> float:
        return self.reel_length(length_class)[2]

    def reel_target(self, length_class: str = "short") -> float:
        return self.reel_length(length_class)[1]

    def style_guide_text(self) -> str:
        path = self.style_guide or Path(__file__).resolve().parents[2] / "style" / "STYLE_GUIDE.md"
        return Path(path).read_text()


def find_claude_cli() -> str:
    """The newest Claude Code on this Mac: the one on PATH, or the copy the Claude desktop app
    keeps up to date (newer models need a recent Claude Code)."""
    import re
    import shutil
    import subprocess

    candidates = [p for p in [shutil.which("claude")] if p]
    app = Path("~/Library/Application Support/Claude/claude-code").expanduser()
    candidates += [str(p) for p in app.glob("*/*/claude.app/Contents/MacOS/claude")]

    def version(p: str) -> tuple[int, ...]:
        try:
            out = subprocess.run([p, "--version"], capture_output=True, text=True, timeout=20).stdout
            return tuple(int(x) for x in re.findall(r"\d+", out)[:3])
        except (OSError, subprocess.TimeoutExpired):
            return ()

    ranked = sorted(((version(p), p) for p in candidates), reverse=True)
    return ranked[0][1] if ranked and ranked[0][0] else "claude"


def load(path: Path = DEFAULT_PATH) -> Config:
    if not path.exists():
        raise FileNotFoundError(f"no settings at {path}; run `igmp init` to write a template")
    raw = tomllib.loads(path.read_text())
    known = {f for f in Config.__dataclass_fields__ if f != "extra"}
    kwargs = {k: v for k, v in raw.items() if k in known}
    kwargs["library_roots"] = [Path(p).expanduser() for p in raw.get("library_roots", [])]
    kwargs["output_dir"] = Path(raw["output_dir"]).expanduser()
    if raw.get("style_guide"):
        kwargs["style_guide"] = Path(raw["style_guide"]).expanduser()
    if "claude_cli" not in raw and kwargs.get("backend", "claude-code") == "claude-code":
        kwargs["claude_cli"] = find_claude_cli()
    return Config(**kwargs, extra={k: v for k, v in raw.items() if k not in known})


def write_template(path: Path = DEFAULT_PATH) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        path.write_text(TEMPLATE)
    return path
