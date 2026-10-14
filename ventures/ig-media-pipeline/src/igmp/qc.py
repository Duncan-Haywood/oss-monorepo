"""Objective pre-checks on a rendered reel, run before the Claude critic.

The critic (reels.critic_task) costs a Claude call per round. Some reasons a reel should not
ship need no taste to see: no sound, black bars, nothing moving in the first second, a picture
that sits still, the wrong size or length. Instagram says outright that it is less likely to
recommend reels that are "muted or contain borders", low-resolution, mostly text, or (for new
audiences) over 3 minutes. check_reel() measures those things; a reel that fails is revised
without spending a critic call, and the critic only sees reels that are technically fit to post.

    problems = qc.check_plan(plan)                         # before rendering: list[Finding]
    report = qc.check_reel(draft_video, cfg, band=None, allow_silent=plan.music is None, draft=True)
    if not report.passed:
        ...revise from report.summary_for_llm(), no critic call...

check_plan(plan) and check_reel(path, cfg, band=None, *, allow_silent=False, draft=False) are
the interface the renderer calls (it imports this module lazily; this module imports nothing from
render). cfg may be the package Config or None: only cfg.ffmpeg / cfg.ffprobe are read, if they
exist. summary_for_llm() lists only the failed and warned rules, one bullet each with numbers;
findings_for_llm() does the same for check_plan()'s list.

Rules (Finding.rule; severity "fail" blocks, "warn" and "info" are reported only):
  format.video       fail  a video stream exists
  format.resolution  fail  1080x1920 (720x1280 is a warn: accepted, but soft on a phone)
  format.fps         fail  29.97-60 fps
  format.pix_fmt     fail  yuv420p                          (info with draft=True)
  format.codec       fail  h264 or hevc                     (info with draft=True)
  format.bitrate     warn  video 6-25 Mb/s                  (info with draft=True)
  audio_present      fail  an audio stream exists           (warn with allow_silent=True)
  audio_silent       fail  it is not silent: max_volume > -60 dB and integrated > -60 LUFS
                           (warn with allow_silent=True: the user adds an Instagram sound)
  loudness           warn  integrated -14 +-2 LUFS
  true_peak          warn  <= -1 dBTP
  borders            fail  no letterbox/pillarbox bars (see "Borders" below)
  hook_motion        fail  real motion, or a cut, in the first second (see "Hook" below)
  frozen             fail  no stretch longer than 1.5 s without visible change
  duration_band      fail  5-180 s, and inside `band` when one is asked for; the band is reported:
                           short 7-15 or 20-30 s, medium 30-60, long 60-180
  loop               info  how far the last frame is from the first (a seamless loop rewatches)
  plan.fit_share     fail  fit-layout shots are at most 20% of the runtime       (check_plan)
  plan.fit_start     fail  no fit shot starts before 3.0 s: the hook is full-frame (check_plan)
  plan.static_photo  warn  a fill photo shot moves (zoom_from != zoom_to, or a pan) (check_plan)

One decode
----------
ffprobe gives the format facts; then ONE ffmpeg run decodes the file once:

    video -> fps 30 -> every frame of the first second, then every 2nd (15 fps)
             -> area-scale to 270x480 -> grey -> pipe -> numpy, frame by frame: the first
             second (hook), a frame every 0.5 s (borders), the last frame (loop), and each frame
             into the frozen tracker; nothing else is kept
    audio -> ebur128 (integrated loudness, true peak) -> volumedetect (max volume) -> stderr

Analysis frames are grey with the long edge at 480 px (270x480 for a reel). Nearly all the time
goes to h264 decoding and the area downscale: a 60 s reel checks in about 1.5 s more than a plain
`ffmpeg -i reel.mp4 -f null -` decode on a busy 4-core Linux VM with ffmpeg 6.1 (which runs every
filter in one thread; ffmpeg 7+ gives filters their own threads).

Borders
-------
cropdetect alone is not used: a night sky has dark edges and it would call them bars. On the 2 fps
samples each edge is read line by line from the outside in (rows for top/bottom, columns for
left/right). A line is part of a bar when it is flat along its length (std < BORDER_LINE_STD, and
no pixel more than BORDER_LINE_MAXDEV from its mean: one star breaks it) and its mean is within
BORDER_DRIFT of the outermost line's (a bar is one level all the way through; a gradient drifts).
The run of such lines must end in a hard edge within BORDER_EDGE_LOOK lines: a textured line or
a step of BORDER_STEP levels (a clean, shallow gradient just fades and is not a bar). A frame's
band counts only when its level is within BORDER_TIME_TOL of that edge's median level over the
reel (bars do not change colour from shot to shot). An edge has a border when the band is at
least 2% of the dimension in at least 80% of the sampled frames (frames flat all over, such as a
fade to black, are left out). Calibration (1080x1920, x264): black or white letterbox and
pillarbox bars measure to the pixel (656 px, 180 px, 360 px), 60 px bars (3.1%) are found and
24 px (1.25%) are not, bars around near-black content are found; a starfield (plain or vignetted),
the renderer's blurred "fit" background, noisy vertical and diagonal gradients and a clean 8-bit
gradient (still or zooming) give no band at all.

Hook
----
The first second at 30 fps. For each pair of frames: the mean absolute difference (MAD, grey
levels), the share of pixels that changed by more than FREEZE_PIX_DELTA, and an approximate
speed, 2 * MAD / (mean |d/dx| + mean |d/dy|), in analysis pixels per frame: the linearised
optical-flow magnitude, so a busy and a plain picture moving the same distance score alike (MAD
alone does not: the same push-in measures 5.2 on a busy picture and 0.4 on a hazy one). A pair
whose MAD is a spike (>= CUT_MIN_MAD and >= CUT_RATIO x the median pair) is a cut. The first
second has a hook when it has a cut, or when the other pairs' mean speed is >= HOOK_MIN_SPEED and
the change is visible (mean MAD >= HOOK_MIN_MAD, or a sparse picture such as stars with >=
HOOK_MIN_SHARE of its pixels changing). Speeds measured on render_reel output: a still 0.00; the
default Ken Burns push (zoom 1.00 -> 1.08 over 2 s) 0.24-0.29 on photos, 0.48 on a starfield
(where MAD 0.3 keeps it out): NOT a hook; a pan (focus x 0.3 -> 0.7 over 3 s) 1.31; a moving
testsrc2 clip 1.75. On synthetic clips: push 1.00 -> 1.15 over 2 s 0.43 (not a hook), 1.00 ->
1.30 over 1.5 s 0.82-0.87 (a hook), slow and fast pans 0.76-1.32, testsrc2 0.65; a hard cut
between two stills is a 35-level spike.

Frozen
------
Like ffmpeg freezedetect, every frame is compared with the FIRST frame of the current stretch, so
a slow move adds up until it shows; a stretch longer than FREEZE_MAX_S fails. freezedetect's one
test (mean difference <= -60 dB, 0.26 levels) does not work on the analysis frames, both ways:
x264 re-codes a still slightly at every keyframe (render uses a 2 s GOP), which on a detailed
picture is a 0.6-1.9 level MAD jump that splits a frozen shot in two; and stars drifting in a
night sky move almost no mean energy (0.1-0.3 levels), so a Ken Burns over a starfield read as
frozen. So a frame has changed when the means of its 4x4 blocks moved by > FREEZE_MAD on average
(keyframe noise and grain average out, moving structure does not: keyframe jumps measure
0.17/0.28/0.49 at CRF 18/23/28, a push-in on a hazy picture passes 0.6 within a quarter second),
or when, inside dark blocks (mean < FREEZE_DARK), more than FREEZE_PIX_SHARE of the pixels
changed by > FREEZE_PIX_DELTA (drifting stars: 0.18-0.7% of pixels, and 0.08-0.10% for the faint
stars of a fit shot; a low-bitrate encoder refining a photo stays under 0.02%, because that
happens on texture, not on black sky; sharp synthetic edges on black at 2 Mb/s reach 0.06%). After the first second frames are read at 15 fps, so a stretch is measured as
a lower bound (exact at 30 fps): a still held for exactly 1.5 s never reads as longer.
Calibration on render_reel output: a photo with zoom_from == zoom_to is frozen for its whole
2 s; the default push on a busy, a hazy and a night-sky photo, a fit shot of each, a pan and a
video are not. Known limit: a starfield of only very faint stars (under ~8 levels above the sky
at 270x480, no Milky Way, horizon or glow) zooming slowly can still read as frozen.

Drafts
------
The renderer checks a draft (h264_videotoolbox, 1x work scale, maybe a lower bitrate). With
draft=True the encoder's own choices (pix_fmt, codec, bitrate) are info. The picture checks were
re-run on soft, low-bitrate stand-ins (x264 without adaptive quantisation or psy tuning, strong
deblocking, 2 and 4 Mb/s, also blurred first, and CRF 35). Borders: the same bars to within 8 px,
and no bar on a starfield, a fit background or a gradient. Hook: Ken Burns pushes 0.07-0.32 on
photos (not a hook); pans 0.95-1.00, testsrc2 0.56-0.65 and cuts are hooks. Frozen: held stills and photos read frozen,
pushes and pans do not. One miss at 2 Mb/s: a held frame of sharp detail on black is refined by the
encoder in its dark blocks (0.06%) until the stretch splits at a keyframe. At 4 Mb/s it reads
frozen. A miss costs a critic call; the alternative, a frozen fail on a faint night sky, would cost a
pointless revision. So encode drafts at 4 Mb/s or more (videotoolbox: 6-8 Mb/s).

CLI: python -m igmp.qc <file-or-dir> [--band short|medium|long] [--allow-silent] [--draft] [--json]
Exit status 0 when every reel passed, 1 when one failed, 2 when one could not be read.
"""
from __future__ import annotations

import argparse
import json
import math
import re
import shutil
import subprocess
import sys
import tempfile
import time
from collections.abc import Iterable, Mapping
from dataclasses import dataclass, field
from pathlib import Path
from typing import TYPE_CHECKING, Any, Literal

import numpy as np
from pydantic import BaseModel, computed_field

from .media import MediaError

if TYPE_CHECKING:
    from .config import Config

Severity = Literal["fail", "warn", "info"]
Band = Literal["short", "medium", "long"]

# --------------------------------------------------------------------------- thresholds
# Starting points, calibrated on synthetic clips (tests/test_qc.py). Tune them on real reels:
# run `python -m igmp.qc reels/ --json` over shipped and set-aside reels and look at the values.

# render.py's output, restated so that importing qc never imports the renderer (render imports
# qc lazily, and is being refactored): 1080x1920 at 30 fps, a shot gets round(duration * 30) frames
OUT_W, OUT_H, FPS = 1080, 1920, 30

ANALYSIS_LONG_EDGE = 480      # analysis frames: grey, long edge 480 px (270x480 for a reel)
HOOK_FPS = 30                 # the first second (the hook) is read at 30 fps...
HOOK_SECONDS = 1.0
FREEZE_STEP = 2               # ...the rest at every 2nd frame (15 fps): half the scaling work
SAMPLE_FPS = 2.0              # frames kept for borders

# format (with draft=True the encoder-dependent ones, marked *, are reported as info only)
SIZE = (OUT_W, OUT_H)         # 1080x1920
SIZE_SOFT = (720, 1280)       # accepted with a warning
FPS_MIN, FPS_MAX = 29.97, 60.0
FPS_TOL = 0.01
PIX_FMT = "yuv420p"            # *
CODECS = ("h264", "hevc")     # *
BITRATE_KBPS = (6000.0, 25000.0)   # *
DRAFT_INFO_RULES = ("format.pix_fmt", "format.codec", "format.bitrate")

# sound
SILENT_MAX_DB = -60.0         # volumedetect max_volume at or below this is silence
SILENT_LUFS = -60.0           # ebur128 integrated loudness at or below this is silence
TARGET_LUFS, LUFS_TOL = -14.0, 2.0
TRUE_PEAK_MAX = -1.0          # dBTP
SILENT_NOTE = "user must add an Instagram sound when posting"

# borders (grey levels 0-255 on the analysis frames)
BORDER_MIN_FRAC = 0.02        # a bar is at least 2% of the dimension
BORDER_SCAN_FRAC = 0.45       # look this far in from each edge
BORDER_LINE_STD = 1.5         # a bar line is flat along its length...
BORDER_LINE_MAXDEV = 8.0      # ...with no pixel this far off (a bright star at 270x480 is 10-120 over the sky)
BORDER_DRIFT = 0.5            # every line of the band within this of the outermost line's mean
BORDER_STEP = 3.0             # the band ends in a hard edge: a textured line or a step this big...
BORDER_EDGE_LOOK = 3          # ...within this many lines (a gradient fades out instead)
BORDER_TIME_TOL = 3.0         # the band's level within this of its median over the reel
BORDER_FRAME_SHARE = 0.8      # in at least this share of the sampled frames
BORDER_UNIFORM_STD = 2.0      # frames flat all over (a fade to black) are left out
BORDER_MAX_FRAMES = 120       # at most this many of the 2 fps samples, evenly spaced

# hook (first second, 30 fps, analysis frames)
HOOK_MIN_SPEED = 0.5          # approx. px/frame at 270 wide (2 at 1080); default Ken Burns 0.24-0.29 (0.48 on stars)
HOOK_MIN_MAD = 1.0            # and visibly so: mean |frame difference| (grey levels)...
HOOK_MIN_SHARE = 0.003        # ...or this share of pixels changing by > FREEZE_PIX_DELTA (stars, sparse detail)
CUT_MIN_MAD = 12.0            # a cut changes the picture by at least this...
CUT_RATIO = 4.0               # ...and by this many times the typical pair

# frozen (each frame against the FIRST frame of the stretch, so slow moves accumulate)
FREEZE_BLOCK = 4              # coarse comparison on 4x4-px block means (16 px at 1080 wide)...
FREEZE_MAD = 0.6              # ...changed when their mean |difference| is over this (grey levels)
FREEZE_PIX_DELTA = 8          # or when, inside dark blocks (mean < FREEZE_DARK), more than
FREEZE_PIX_SHARE = 0.0005     # FREEZE_PIX_SHARE of all pixels moved this much (0.05%, 65 px of 270x480:
FREEZE_DARK = 48              # a few drifting stars; low-bitrate codec steps on texture stay out)
FREEZE_MAX_S = 1.5
FREEZE_REPORT_S = 1.0         # stretches this long are listed in the finding

# duration
DURATION_MIN_S, DURATION_MAX_S = 5.0, 180.0
BANDS: dict[str, tuple[tuple[float, float], ...]] = {
    "short": ((7.0, 15.0), (20.0, 30.0)),
    "medium": ((30.0, 60.0),),
    "long": ((60.0, 180.0),),
}
BAND_TOL = 0.25               # a 15.0 s reel whose container says 15.02 is still short

# plan
FIT_MAX_SHARE = 0.20
FIT_EARLIEST_S = 3.0
PHOTO_KINDS = ("photo", "photo360")

EDGES = ("top", "bottom", "left", "right")
VIDEO_EXT = (".mp4", ".mov", ".m4v")


# --------------------------------------------------------------------------- report


class Finding(BaseModel):
    rule: str
    ok: bool
    severity: Severity
    detail: str
    value: Any = None


class QCReport(BaseModel):
    path: str
    duration_s: float
    width: int
    height: int
    fps: float
    video_codec: str
    bitrate_kbps: float | None
    audio: dict[str, Any]
    findings: list[Finding]
    draft: bool = False
    elapsed_s: float = 0.0

    @computed_field
    @property
    def passed(self) -> bool:
        return not self.failures

    @property
    def failures(self) -> list[Finding]:
        return [f for f in self.findings if f.severity == "fail" and not f.ok]

    @property
    def warnings(self) -> list[Finding]:
        return [f for f in self.findings if f.severity == "warn" and not f.ok]

    def finding(self, rule: str) -> Finding | None:
        return next((f for f in self.findings if f.rule == rule), None)

    def notes(self, warnings: bool = False) -> list[str]:
        """One line per failed rule (and warning), for the revision prompt."""
        bad = self.failures + (self.warnings if warnings else [])
        return [f"{f.rule}: {f.detail}" for f in bad]

    def summary_for_llm(self) -> str:
        """The failed and warned rules only, one bullet each with its numbers, under a one-line
        head: for pasting into a revision prompt as facts. Info findings are left out."""
        bad = self.failures + self.warnings
        head = (f"Reel QC {'passed' if self.passed else 'FAILED'}: {len(self.failures)} failed, "
                f"{len(self.warnings)} warned ({self.width}x{self.height}, {self.duration_s:.2f} s, "
                f"{self.fps:g} fps{', draft' if self.draft else ''})")
        return head if not bad else head + "\n" + findings_for_llm(bad)

    def summary(self) -> str:
        head = (f"{'PASS' if self.passed else 'FAIL'}  {self.path}  {self.width}x{self.height} "
                f"{self.fps:.2f} fps {self.duration_s:.2f} s  ({self.elapsed_s:.1f} s)")
        lines = [head]
        for f in self.findings:
            mark = "ok  " if f.ok else {"fail": "FAIL", "warn": "warn", "info": "info"}[f.severity]
            lines.append(f"  {mark} {f.rule:<18} {f.detail}")
        return "\n".join(lines)


def frames_for(seconds: float) -> int:
    """Frames a shot of this length gets at 30 fps (at least one): render.frames_for."""
    return max(1, round(seconds * FPS))


def parse_ebur128(stderr: str) -> tuple[float, float]:
    """(integrated LUFS, true peak dBTP) from ebur128's summary: render.parse_ebur128."""
    summary = stderr[stderr.rfind("Summary:"):]
    i = re.search(r"I:\s+(-?[\d.]+|-inf) LUFS", summary)
    tp = re.search(r"Peak:\s+(-?[\d.]+|-?inf) dBFS", summary)
    if not i or not tp:
        raise RuntimeError("no ebur128 summary in ffmpeg output")
    return float(i.group(1)), float(tp.group(1))


def _f(rule: str, ok: bool, severity: Severity, detail: str, value: Any = None) -> Finding:
    return Finding(rule=rule, ok=ok, severity=severity, detail=detail, value=value)


def findings_for_llm(findings: Iterable[Finding]) -> str:
    """Bullets for the failed and warned findings, failures first ("" when there are none). Works
    on check_plan()'s list as well as on QCReport.findings."""
    bad = [f for f in findings if not f.ok and f.severity in ("fail", "warn")]
    bad.sort(key=lambda f: f.severity != "fail")
    return "\n".join(f"- {f.severity.upper()} {f.rule}: {f.detail}" for f in bad)


# --------------------------------------------------------------------------- probing


def _tools(cfg: Any) -> tuple[str, str]:
    """ffmpeg and ffprobe: cfg.ffmpeg / cfg.ffprobe when cfg has them (the package Config does),
    else from PATH or Homebrew. No other config field is read."""
    def find(name: str) -> str:
        given = getattr(cfg, name, None)
        if given:
            return str(given)
        return shutil.which(name) or next(
            (p for p in (f"/opt/homebrew/bin/{name}", f"/usr/local/bin/{name}") if Path(p).exists()), name)
    return find("ffmpeg"), find("ffprobe")


def _run(cmd: list[str], what: str, timeout: float = 600) -> subprocess.CompletedProcess:
    try:
        res = subprocess.run(cmd, capture_output=True, check=False, timeout=timeout)
    except FileNotFoundError as e:
        raise MediaError(f"{cmd[0]} not found ({what})") from e
    except subprocess.TimeoutExpired as e:
        raise MediaError(f"{what}: timed out after {timeout:.0f} s") from e
    if res.returncode != 0:
        err = res.stderr.decode(errors="replace").strip().splitlines()
        raise MediaError(f"{what}: {err[-1] if err else 'exit ' + str(res.returncode)}")
    return res


def _ratio(text: str | None) -> float:
    num, _, den = (text or "0/1").partition("/")
    try:
        n, d = float(num), float(den or 1)
    except ValueError:
        return 0.0
    return n / d if d else 0.0


def _num(v: Any) -> float | None:
    try:
        x = float(v)
    except (TypeError, ValueError):
        return None
    return x if math.isfinite(x) else None


def probe_reel(path: str | Path, ffprobe: str) -> dict:
    """Format facts from ffprobe: video (display size, fps, codec, pix_fmt, bitrate, duration,
    stream index) and audio (codec, channels, rate, index), either None when absent."""
    out = _run([ffprobe, "-v", "error", "-print_format", "json", "-show_format", "-show_streams",
                str(path)], f"ffprobe {Path(path).name}", timeout=60).stdout
    data = json.loads(out or b"{}")
    streams, fmt = data.get("streams", []), data.get("format", {})
    vids = [s for s in streams if s.get("codec_type") == "video"
            and not (s.get("disposition") or {}).get("attached_pic")]
    auds = [s for s in streams if s.get("codec_type") == "audio"]
    facts: dict[str, Any] = {"format_duration": _num(fmt.get("duration")) or 0.0,
                             "format_bitrate": _num(fmt.get("bit_rate")), "video": None, "audio": None}
    if auds:
        a = auds[0]
        facts["audio"] = {"index": int(a["index"]), "codec": a.get("codec_name", ""),
                          "channels": a.get("channels"), "sample_rate": int(_num(a.get("sample_rate")) or 0),
                          "bitrate": _num(a.get("bit_rate")), "duration": _num(a.get("duration"))}
    if vids:
        v = vids[0]
        rot = 0
        for sd in v.get("side_data_list") or []:
            if "rotation" in sd:
                rot = round(float(sd["rotation"]))
        rot = rot or int(float((v.get("tags") or {}).get("rotate", 0) or 0))
        w, h = int(v.get("width") or 0), int(v.get("height") or 0)
        if rot % 180:
            w, h = h, w
        fps = _ratio(v.get("avg_frame_rate")) or _ratio(v.get("r_frame_rate"))
        nb = int(_num(v.get("nb_frames")) or 0)
        dur = _num(v.get("duration")) or (nb / fps if nb and fps else None) or facts["format_duration"]
        rate = _num(v.get("bit_rate"))
        if rate is None and facts["format_bitrate"]:
            rate = facts["format_bitrate"] - ((facts["audio"] or {}).get("bitrate") or 0)
        facts["video"] = {"index": int(v["index"]), "width": w, "height": h, "fps": fps,
                          "codec": v.get("codec_name", ""), "pix_fmt": v.get("pix_fmt", ""),
                          "bitrate": rate, "duration": dur, "frames": nb}
    return facts


def analysis_size(w: int, h: int, long_edge: int = ANALYSIS_LONG_EDGE) -> tuple[int, int]:
    """Analysis frame size: long edge = long_edge (never upscaled), both sides even."""
    s = min(1.0, long_edge / max(w, h, 1))
    return max(2, round(w * s / 2) * 2), max(2, round(h * s / 2) * 2)


# --------------------------------------------------------------------------- the one decode


@dataclass
class Decoded:
    size: tuple[int, int]                              # analysis (w, h)
    frames: int = 0                                    # analysis frames read (see frame_time)
    hook: np.ndarray | None = None                     # (n, h, w) uint8, the first second
    samples: np.ndarray | None = None                  # (n, h, w) uint8, every 1/SAMPLE_FPS s
    last: np.ndarray | None = None                     # (h, w) uint8
    freezes: list[tuple[float, float]] = field(default_factory=list)   # (start, end) s, >= FREEZE_REPORT_S
    lufs: float | None = None
    true_peak: float | None = None
    max_volume: float | None = None
    mean_volume: float | None = None
    audio_error: str | None = None


_VOL_RE = {k: re.compile(rf"{k}:\s*(-?[\d.]+|-?inf) dB") for k in ("max_volume", "mean_volume")}


def parse_volumedetect(stderr: str) -> tuple[float | None, float | None]:
    """(max_volume, mean_volume) in dB from volumedetect's log (the last report); -inf -> None."""
    vals = []
    for k in ("max_volume", "mean_volume"):
        m = _VOL_RE[k].findall(stderr)
        vals.append(_num(m[-1]) if m else None)
    return vals[0], vals[1]


class FreezeTracker:
    """Stretches without visible change, fed one analysis frame at a time with its time. As in
    ffmpeg freezedetect, each frame is compared with the FIRST frame of the current stretch, so a
    slow move adds up until it shows. Two tests instead of freezedetect's one mean difference:
    block means (codec noise, such as the small jump at every keyframe of a still, and grain
    average out; structure that moves does not), and a count of pixels that changed a lot inside
    dark blocks (stars drifting in a night sky move almost no mean energy; counting only dark
    blocks keeps a low-bitrate encoder's refinement of textured detail out).

    A stretch runs from its first frame to the last frame that still matched, plus one 30 fps
    frame: with frames sampled every 1/15 s that is a lower bound, exact at 30 fps, so a still
    held for exactly 1.5 s never measures longer."""

    def __init__(self) -> None:
        self.ref: np.ndarray | None = None              # uint8 frame (kept, not copied: do not modify)
        self.ref_blocks: np.ndarray | None = None
        self.ref_dark: np.ndarray | None = None          # blocks dark enough for the sparse test
        self.ref_t = 0.0
        self.same_t = 0.0                               # time of the last frame that matched ref
        self.frames = 0
        self.stretches: list[tuple[float, float]] = []

    @staticmethod
    def blocks(frame: np.ndarray) -> np.ndarray:
        """Sums of FREEZE_BLOCK x FREEZE_BLOCK pixel blocks (uint16; strided adds are ~10x faster
        than a reshaped mean, and this runs on every frame)."""
        b = FREEZE_BLOCK
        x = frame[: frame.shape[0] // b * b, : frame.shape[1] // b * b].astype(np.uint16)
        x = sum(x[i::b] for i in range(b))
        return sum(x[:, i::b] for i in range(b))

    def changed(self, frame: np.ndarray, blocks: np.ndarray) -> bool:
        mad = np.abs(blocks.astype(np.int32) - self.ref_blocks).mean() / FREEZE_BLOCK ** 2
        if mad > FREEZE_MAD:
            return True
        if not self.ref_dark.any():
            return False
        diff = np.maximum(frame, self.ref) - np.minimum(frame, self.ref)    # |a - b| in uint8
        moved = self.blocks(diff > FREEZE_PIX_DELTA)                        # per block
        return int(moved[self.ref_dark].sum()) > FREEZE_PIX_SHARE * frame.size

    def _close(self) -> None:
        end = self.same_t + 1 / HOOK_FPS
        if end - self.ref_t >= FREEZE_REPORT_S - 1e-9:
            self.stretches.append((round(self.ref_t, 4), round(end, 4)))

    def add(self, frame: np.ndarray, t: float) -> None:
        blocks = self.blocks(frame)
        if self.ref is None or self.changed(frame, blocks):
            if self.ref is not None:
                self._close()
            self.ref, self.ref_blocks, self.ref_t = frame, blocks, t
            self.ref_dark = blocks < FREEZE_DARK * FREEZE_BLOCK ** 2
        self.same_t = t
        self.frames += 1

    def finish(self, end_s: float | None = None) -> list[tuple[float, float]]:
        """Close the last stretch; nothing changed after it, so it runs to end_s (the video's
        duration) when that is known."""
        if self.ref is not None:
            if end_s is not None:
                self.same_t = max(self.same_t, end_s - 1 / HOOK_FPS)
            self._close()
            self.ref = None
        return self.stretches


def freezes(frames: Iterable[np.ndarray], fps: float = HOOK_FPS) -> list[tuple[float, float]]:
    """Stretches of at least FREEZE_REPORT_S without visible change, as (start, end) seconds,
    for frames at a steady 30 fps (or every 1/fps s)."""
    t = FreezeTracker()
    for i, f in enumerate(frames):
        t.add(np.array(f, np.uint8), i / fps)
    return t.finish()


def frame_time(k: int) -> float:
    """Time of the k-th analysis frame: every 30 fps frame of the first second, then every other."""
    first = int(HOOK_SECONDS * HOOK_FPS)
    return (k if k < first else first + FREEZE_STEP * (k - first)) / HOOK_FPS


def decode(path: str | Path, facts: dict, ffmpeg: str) -> Decoded:
    """The single ffmpeg pass described in the module docstring: the picture comes back on a
    pipe as grey analysis frames at 30 fps and is measured as it streams (only the first second,
    the 2 fps samples and the last frame are kept); the sound is measured in the same run."""
    v, a = facts["video"], facts["audio"]
    dec = Decoded(size=analysis_size(v["width"], v["height"]) if v else (0, 0))
    if not v and not a:
        return dec
    w, h = dec.size
    parts, outs = [], []
    if v:
        first = int(HOOK_SECONDS * HOOK_FPS)
        parts.append(f"[0:{v['index']}]setpts=PTS-STARTPTS,fps={HOOK_FPS},"
                     f"select='lt(n,{first})+not(mod(n-{first},{FREEZE_STEP}))',"
                     f"scale={w}:{h}:flags=area,format=gray[pic]")
        outs += ["-map", "[pic]", "-fps_mode", "passthrough", "-f", "rawvideo", "-pix_fmt", "gray", "pipe:1"]
    if a:
        parts.append(f"[0:{a['index']}]ebur128=peak=true:framelog=verbose,volumedetect[snd]")
        outs += ["-map", "[snd]", "-f", "null", "-"]
    cmd = [ffmpeg, "-nostdin", "-hide_banner", "-nostats", "-v", "info", "-i", str(path),
           "-filter_complex", ";".join(parts)] + outs
    what = f"analysing {Path(path).name}"
    hook, samples, last = [], [], None
    freeze = FreezeTracker()
    next_sample = 0.0
    size = w * h
    with tempfile.TemporaryFile() as errf:
        try:
            proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=errf)
        except FileNotFoundError as e:
            raise MediaError(f"{ffmpeg} not found ({what})") from e
        try:
            k = 0
            while v:
                chunk = proc.stdout.read(size)              # a new bytes object per frame
                if len(chunk) < size:
                    break
                f = np.frombuffer(chunk, np.uint8).reshape(h, w)
                t = frame_time(k)
                if t < HOOK_SECONDS - 1e-9:
                    hook.append(f)
                if t >= next_sample - 1e-9:
                    samples.append(f)
                    next_sample += 1 / SAMPLE_FPS
                freeze.add(f, t)
                last, k = f, k + 1
            proc.stdout.read()
            rc = proc.wait(timeout=600)
        except subprocess.TimeoutExpired as e:
            raise MediaError(f"{what}: ffmpeg did not finish") from e
        finally:
            if proc.poll() is None:
                proc.kill()
                proc.wait()
        errf.seek(0)
        err = errf.read().decode(errors="replace")
    if rc != 0:
        lines = err.strip().splitlines()
        raise MediaError(f"{what}: {lines[-1] if lines else 'exit ' + str(rc)}")
    if v:
        dec.frames = freeze.frames
        dec.hook = np.stack(hook) if hook else np.zeros((0, h, w), np.uint8)
        dec.samples = np.stack(samples) if samples else np.zeros((0, h, w), np.uint8)
        dec.last = last
        dec.freezes = freeze.finish(v["duration"])
    if a:
        try:
            dec.lufs, tp = parse_ebur128(err)
            dec.true_peak = _num(tp)
        except RuntimeError as e:
            dec.audio_error = str(e)
        dec.max_volume, dec.mean_volume = parse_volumedetect(err)
    return dec


# --------------------------------------------------------------------------- measurements (numpy)


def _line_stats(frames: np.ndarray, edge: str, depth: int) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Mean, std and largest |pixel - mean| of the first `depth` lines in from `edge` (rows for
    top/bottom, columns for left/right), each (n, depth). Reduced in memory order: no transposes."""
    if edge in ("top", "bottom"):
        band, axis = (frames if edge == "top" else frames[:, ::-1, :])[:, :depth, :], 2
    else:
        band, axis = (frames if edge == "left" else frames[:, :, ::-1])[:, :, :depth], 1
    f = band.astype(np.float32)
    mean = f.mean(axis=axis)
    std = np.sqrt(np.maximum(np.square(f).mean(axis=axis) - np.square(mean), 0))
    maxdev = np.maximum(band.max(axis=axis) - mean, mean - band.min(axis=axis))
    return mean, std, maxdev


def _band_thickness(frames: np.ndarray, edge: str, depth: int) -> tuple[np.ndarray, np.ndarray]:
    """Per frame: how many lines in from `edge` form a bar (0 when the run of flat lines does not
    end in a hard edge), and the outermost line's level."""
    mean, std, maxdev = _line_stats(frames, edge, depth)
    textured = (std >= BORDER_LINE_STD) | (maxdev > BORDER_LINE_MAXDEV)
    step = np.abs(mean - mean[:, :1])
    flat = ~textured & (step <= BORDER_DRIFT)
    thick = np.where(flat.all(axis=1), depth, flat.argmin(axis=1))
    # a bar ends in a hard edge (texture, or a step in level) within a few lines; a gradient that
    # merely drifted past BORDER_DRIFT does not
    edge_line = textured | (step >= BORDER_STEP)
    rows = np.arange(len(thick))
    hard = np.zeros(len(thick), bool)
    for j in range(BORDER_EDGE_LOOK):
        hard |= edge_line[rows, np.minimum(thick + j, depth - 1)] & (thick + j < depth)
    return np.where((thick >= depth) | hard, thick, 0), mean[:, 0]


def border_bands(frames: np.ndarray) -> dict[str, dict[str, Any]]:
    """Per edge: the bar thickness (analysis px) found in >= BORDER_FRAME_SHARE of the frames,
    the share of frames with a band at least that thick, its grey level, and whether it counts
    as a border (>= BORDER_MIN_FRAC of the dimension). See the module docstring."""
    frames = np.asarray(frames)
    out: dict[str, dict[str, Any]] = {}
    if frames.ndim != 3 or not len(frames):
        return {e: {"lines": 0, "min_lines": 0, "share": 0.0, "level": None, "border": False} for e in EDGES}
    if len(frames) > BORDER_MAX_FRAMES:                            # long reels: evenly spaced
        frames = frames[np.linspace(0, len(frames) - 1, BORDER_MAX_FRAMES).round().astype(int)]
    flat_all = frames[:, ::4, ::4].reshape(len(frames), -1).std(axis=1) < BORDER_UNIFORM_STD
    use = frames[~flat_all]
    for edge in EDGES:
        dim = frames.shape[1] if edge in ("top", "bottom") else frames.shape[2]
        min_lines = max(2, math.ceil(BORDER_MIN_FRAC * dim))
        if not len(use):
            out[edge] = {"lines": 0, "min_lines": min_lines, "share": 0.0, "level": None, "border": False}
            continue
        # a quick look just past the minimum; only an edge that may have a bar is read in full
        full = max(min_lines + 1, int(BORDER_SCAN_FRAC * dim))
        quick = min(full, min_lines + BORDER_EDGE_LOOK + 1)
        thick, outer = _band_thickness(use, edge, quick)
        if quick < full and (thick >= quick - BORDER_EDGE_LOOK).any():
            thick, outer = _band_thickness(use, edge, full)
        level = float(np.median(outer))
        thick = np.where(np.abs(outer - level) <= BORDER_TIME_TOL, thick, 0)
        n = len(thick)
        k = int(np.sort(thick)[math.floor(round((1 - BORDER_FRAME_SHARE) * n, 6))])
        share = float((thick >= max(k, min_lines)).mean())
        out[edge] = {"lines": k, "min_lines": min_lines, "share": round(share, 3),
                     "level": round(level, 1), "border": k >= min_lines}
    return out


def _grad(f: np.ndarray) -> float:
    return float(np.abs(np.diff(f, axis=1)).mean() + np.abs(np.diff(f, axis=0)).mean())


def hook_motion(frames: np.ndarray) -> dict[str, Any]:
    """Motion in the first second (frames at 30 fps): mean MAD, mean approximate speed and mean
    share of pixels changing by > FREEZE_PIX_DELTA over the frame pairs that are not cuts, the
    cut found (pair index, time, MAD), and whether it is a hook. See the module docstring."""
    f = np.asarray(frames, np.float32)
    if f.ndim != 3 or len(f) < 2:
        return {"mad": 0.0, "speed": 0.0, "share": 0.0, "cut": None, "hook": False, "pairs": 0}
    diff = np.abs(np.diff(f, axis=0))
    mads = diff.mean(axis=(1, 2))
    shares = (diff > FREEZE_PIX_DELTA).mean(axis=(1, 2))
    grads = np.array([_grad(x) for x in f])
    speeds = 2 * mads / np.maximum((grads[1:] + grads[:-1]) / 2, 1e-3)
    typical = float(np.median(mads))
    cuts = np.flatnonzero((mads >= CUT_MIN_MAD) & (mads >= CUT_RATIO * max(typical, 0.25)))
    keep = np.ones(len(mads), bool)
    keep[cuts] = False
    mad, speed, share = ((float(x[keep].mean()) if keep.any() else 0.0) for x in (mads, speeds, shares))
    cut = None
    if len(cuts):
        i = int(cuts[np.argmax(mads[cuts])])
        cut = {"pair": i, "t": round((i + 1) / HOOK_FPS, 3), "mad": round(float(mads[i]), 2)}
    moving = speed >= HOOK_MIN_SPEED and (mad >= HOOK_MIN_MAD or share >= HOOK_MIN_SHARE)
    return {"mad": round(mad, 3), "speed": round(speed, 3), "share": round(share, 4), "cut": cut,
            "hook": bool(cut is not None or moving), "pairs": len(mads)}


def loop_distance(first: np.ndarray, last: np.ndarray) -> dict[str, float]:
    """How far the last frame is from the first: MAD in grey levels, and the total-variation
    distance between their 32-bin histograms (0 same tones, 1 disjoint)."""
    a, b = np.asarray(first, np.float32), np.asarray(last, np.float32)
    mad = float(np.abs(a - b).mean())
    ha = np.histogram(a, bins=32, range=(0, 256))[0] / a.size
    hb = np.histogram(b, bins=32, range=(0, 256))[0] / b.size
    return {"mad": round(mad, 2), "hist": round(float(np.abs(ha - hb).sum() / 2), 3)}


def duration_band(seconds: float) -> str | None:
    """The playbook band a duration falls in: short (7-15 or 20-30 s), medium (30-60), long
    (60-180), or None (under 7, 15-20, over 180), with BAND_TOL of slack at every edge."""
    for name, spans in BANDS.items():
        if any(lo - BAND_TOL <= seconds <= hi + BAND_TOL for lo, hi in spans):
            return name
    return None


def _in_band(seconds: float, band: str) -> bool:
    return any(lo - BAND_TOL <= seconds <= hi + BAND_TOL for lo, hi in BANDS[band])


# --------------------------------------------------------------------------- rules


def _format_findings(v: dict | None, draft: bool = False) -> list[Finding]:
    if not v:
        return [_f("format.video", False, "fail", "no video stream")]
    out = _format_rules(v)
    if draft:      # a draft's encoder (videotoolbox, lower bitrate) is not the final one
        out = [f.model_copy(update={"severity": "info", "detail": f.detail + ("" if f.ok else " (draft)")})
               if f.rule in DRAFT_INFO_RULES else f for f in out]
    return out


def _format_rules(v: dict) -> list[Finding]:
    out = [_f("format.video", True, "fail", f"{v['codec']} video stream")]
    size = (v["width"], v["height"])
    if size == SIZE:
        out.append(_f("format.resolution", True, "fail", f"{size[0]}x{size[1]}", list(size)))
    elif size == SIZE_SOFT:
        out.append(_f("format.resolution", False, "warn",
                      f"{size[0]}x{size[1]}: accepted, but render 1080x1920 for a sharp reel", list(size)))
    else:
        out.append(_f("format.resolution", False, "fail",
                      f"{size[0]}x{size[1]}; Instagram reels are 1080x1920 (9:16)", list(size)))
    fps = v["fps"]
    ok = FPS_MIN - FPS_TOL <= fps <= FPS_MAX + FPS_TOL
    out.append(_f("format.fps", ok, "fail", f"{fps:.3f} fps" + ("" if ok else f"; needs {FPS_MIN}-{FPS_MAX:g}"),
                  round(fps, 3)))
    ok = v["pix_fmt"] == PIX_FMT
    out.append(_f("format.pix_fmt", ok, "fail", v["pix_fmt"] + ("" if ok else f"; needs {PIX_FMT}"), v["pix_fmt"]))
    ok = v["codec"] in CODECS
    out.append(_f("format.codec", ok, "fail", v["codec"] + ("" if ok else "; needs h264 or hevc"), v["codec"]))
    kbps = v["bitrate"] / 1000 if v["bitrate"] else None
    if kbps is None:
        out.append(_f("format.bitrate", True, "info", "video bitrate unknown"))
    else:
        lo, hi = BITRATE_KBPS
        ok = lo <= kbps <= hi
        out.append(_f("format.bitrate", ok, "warn", f"{kbps / 1000:.1f} Mb/s"
                      + ("" if ok else f"; Instagram does best with {lo / 1000:g}-{hi / 1000:g} Mb/s"), round(kbps)))
    return out


def _audio_findings(a: dict | None, dec: Decoded, allow_silent: bool) -> tuple[list[Finding], dict]:
    soft: Severity = "warn" if allow_silent else "fail"
    info: dict[str, Any] = {"present": a is not None}
    if a is None:
        detail = "no audio stream" + (f": {SILENT_NOTE}" if allow_silent else "; reels without sound are muted")
        return [_f("audio_present", False, soft, detail),
                _f("audio_silent", False, soft, "no sound", None),
                _f("loudness", True, "info", "no sound to measure"),
                _f("true_peak", True, "info", "no sound to measure")], info
    info.update(codec=a["codec"], channels=a["channels"], sample_rate=a["sample_rate"],
                integrated_lufs=dec.lufs, true_peak_dbtp=dec.true_peak,
                max_volume_db=dec.max_volume, mean_volume_db=dec.mean_volume)
    out = [_f("audio_present", True, soft, f"{a['codec']} {a['channels']} ch {a['sample_rate']} Hz")]
    if dec.audio_error or dec.lufs is None:
        info["silent"] = None
        out.append(_f("audio_silent", False, "fail", f"the sound could not be measured: {dec.audio_error}"))
        return out, info
    max_db = dec.max_volume if dec.max_volume is not None else -math.inf
    silent = max_db <= SILENT_MAX_DB or dec.lufs <= SILENT_LUFS
    info["silent"] = silent
    measured = f"integrated {dec.lufs:.1f} LUFS, max {max_db:.1f} dB"
    if silent:
        detail = f"silent ({measured})" + (f": {SILENT_NOTE}" if allow_silent
                                           else "; muted reels are recommended less: add music or natural sound")
        out.append(_f("audio_silent", False, soft, detail, round(dec.lufs, 1)))
        out.append(_f("loudness", True, "info", "silent; loudness not checked", round(dec.lufs, 1)))
        out.append(_f("true_peak", True, "info", "silent; true peak not checked", dec.true_peak))
        return out, info
    out.append(_f("audio_silent", True, soft, measured, round(dec.lufs, 1)))
    ok = abs(dec.lufs - TARGET_LUFS) <= LUFS_TOL
    out.append(_f("loudness", ok, "warn", f"{dec.lufs:.1f} LUFS integrated"
                  + ("" if ok else f"; target {TARGET_LUFS:g} +-{LUFS_TOL:g}"), round(dec.lufs, 1)))
    tp = dec.true_peak
    ok = tp is None or tp <= TRUE_PEAK_MAX
    out.append(_f("true_peak", ok, "warn", ("no peak" if tp is None else f"{tp:.1f} dBTP")
                  + ("" if ok else f"; over {TRUE_PEAK_MAX:g} dBTP, Instagram's encoder may clip it"), tp))
    return out, info


def _border_finding(dec: Decoded, width: int, height: int) -> Finding:
    if dec.samples is None or not len(dec.samples):
        return _f("borders", False, "fail", "no frames decoded")
    bands = border_bands(dec.samples)
    aw, ah = dec.size
    found = {}
    for edge, b in bands.items():
        if b["border"]:
            scale = height / ah if edge in ("top", "bottom") else width / aw
            dim = height if edge in ("top", "bottom") else width
            px = round(b["lines"] * scale)
            found[edge] = {"px": px, "frac": round(px / dim, 3), "share": b["share"], "level": b["level"]}
    if not found:
        return _f("borders", True, "fail", f"no bars on any edge ({len(dec.samples)} frames sampled)", {})
    kind = []
    if "top" in found or "bottom" in found:
        kind.append("letterbox")
    if "left" in found or "right" in found:
        kind.append("pillarbox")
    sides = ", ".join(f"{e} {d['px']} px ({d['frac']:.0%}, grey {d['level']:g}, {d['share']:.0%} of frames)"
                      for e, d in found.items())
    return _f("borders", False, "fail",
              f"{' + '.join(kind)}: {sides}; Instagram recommends reels with borders less: "
              "fill the 9:16 frame (crop, or a fit shot over its blurred copy)", found)


def _hook_finding(dec: Decoded) -> Finding:
    if dec.hook is None or len(dec.hook) < 2:
        return _f("hook_motion", False, "fail", "under two frames in the first second")
    m = hook_motion(dec.hook)
    nums = f"speed {m['speed']:.2f} px/frame, MAD {m['mad']:.2f}, changed {m['share']:.1%}"
    if m["cut"]:
        detail = f"cut at {m['cut']['t']:.2f} s ({nums})"
    elif m["hook"]:
        detail = f"moving ({nums})"
    else:
        detail = (f"nothing moves enough in the first second ({nums}; needs speed >= {HOOK_MIN_SPEED:g} and "
                  f"MAD >= {HOOK_MIN_MAD:g}, or a cut): open on a moving video shot, a pan or a stronger "
                  "push, or cut inside the first second")
    return _f("hook_motion", m["hook"], "fail", detail, m)


def _frozen_finding(dec: Decoded) -> Finding:
    longest = max(dec.freezes, key=lambda s: s[1] - s[0], default=None)
    stretches = [[round(s, 2), round(e, 2)] for s, e in dec.freezes]
    if longest is None or longest[1] - longest[0] <= FREEZE_MAX_S + 1e-3:     # times are rounded to 0.1 ms
        return _f("frozen", True, "fail", f"no still stretch over {FREEZE_MAX_S:g} s", stretches)
    s, e = longest
    return _f("frozen", False, "fail",
              f"no visible change {s:.2f}-{e:.2f} s ({e - s:.2f} s): give that shot a move "
              f"(zoom_from != zoom_to, or a pan) or shorten it", stretches)


def _duration_finding(seconds: float, band: str | None) -> Finding:
    got = duration_band(seconds)
    value = {"seconds": round(seconds, 3), "band": got}
    if seconds > DURATION_MAX_S + BAND_TOL:
        return _f("duration_band", False, "fail",
                  f"{seconds:.1f} s: over {DURATION_MAX_S:g} s is not recommended to new audiences", value)
    if seconds < DURATION_MIN_S - BAND_TOL:
        return _f("duration_band", False, "fail", f"{seconds:.1f} s: under {DURATION_MIN_S:g} s", value)
    if band is not None:
        spans = " or ".join(f"{lo:g}-{hi:g}" for lo, hi in BANDS[band])
        ok = _in_band(seconds, band)
        return _f("duration_band", ok, "fail", f"{seconds:.1f} s"
                  + (f", {band}" if ok else f"; the {band} band is {spans} s"), value)
    return _f("duration_band", True, "info", f"{seconds:.1f} s, " + (got or "between bands"), value)


def _loop_finding(dec: Decoded) -> Finding:
    if dec.hook is None or not len(dec.hook) or dec.last is None:
        return _f("loop", True, "info", "first or last frame missing")
    d = loop_distance(dec.hook[0], dec.last)
    return _f("loop", True, "info", f"last vs first frame: MAD {d['mad']:.1f}, histogram distance {d['hist']:.2f}",
              d["mad"])


# --------------------------------------------------------------------------- plan


def _get(obj: Any, name: str, default: Any = None) -> Any:
    if isinstance(obj, Mapping):
        return obj.get(name, default)
    return getattr(obj, name, default)


def _xy(p: Any) -> tuple[float, float] | None:
    if p is None:
        return None
    return float(_get(p, "x", 0.5)), float(_get(p, "y", 0.5))


def check_plan(plan: Any, *, kinds: Mapping[str, Any] | None = None) -> list[Finding]:
    """Checks on a ReelPlan (or anything with .shots[*].layout / .duration_s): fit shots at most
    FIT_MAX_SHARE of the runtime and none starting before FIT_EARLIEST_S; a warning for a fill
    photo shot that does not move. kinds maps asset_id to a kind ("photo", "video", ...) or to
    an Asset; without it a shot's own .kind is used, and a still shot of unknown kind is info."""
    shots = list(_get(plan, "shots", []) or [])
    frames = [frames_for(float(_get(s, "duration_s", 0) or 0)) for s in shots]
    total = sum(frames) / FPS
    starts, t = [], 0
    for n in frames:
        starts.append(t / FPS)
        t += n
    fit = [i for i, s in enumerate(shots) if _get(s, "layout", "fill") == "fit"]
    fit_s = sum(frames[i] for i in fit) / FPS
    share = fit_s / total if total else 0.0
    out = [_f("plan.fit_share", share <= FIT_MAX_SHARE + 1e-9, "fail",
              f"fit shots {fit_s:.2f} s of {total:.2f} s ({share:.0%})"
              + ("" if share <= FIT_MAX_SHARE + 1e-9 else f"; at most {FIT_MAX_SHARE:.0%}: crop some to fill"),
              round(share, 3))]
    early = [i for i in fit if starts[i] < FIT_EARLIEST_S - 1e-9]
    out.append(_f("plan.fit_start", not early, "fail",
                  "no fit shot before 3 s" if not early else
                  "fit shot(s) " + ", ".join(f"#{i} at {starts[i]:.2f} s" for i in early)
                  + f" start before {FIT_EARLIEST_S:g} s: the hook must fill the frame",
                  [{"shot": i, "start_s": round(starts[i], 3)} for i in early]))
    still, unknown = [], []
    for i, s in enumerate(shots):
        if _get(s, "layout", "fill") != "fill":
            continue
        zf, zt = _get(s, "zoom_from"), _get(s, "zoom_to")
        if zf is None or zt is None or abs(float(zf) - float(zt)) > 1e-6:
            continue
        f0, f1 = _xy(_get(s, "focus")), _xy(_get(s, "focus_to"))
        if f1 is not None and f0 is not None and f1 != f0:
            continue                                            # a pan moves
        aid = _get(s, "asset_id")
        k = kinds.get(aid) if kinds is not None and aid in kinds else _get(s, "kind")
        k = _get(k, "kind", k) if k is not None and not isinstance(k, str) else k
        if k in PHOTO_KINDS:
            still.append(i)
        elif k is None:
            unknown.append(i)
    if still:
        out.append(_f("plan.static_photo", False, "warn",
                      "photo shot(s) " + ", ".join(f"#{i}" for i in still)
                      + " have zoom_from == zoom_to and no pan: give each a move", still))
    elif unknown:
        out.append(_f("plan.static_photo", True, "info",
                      "shot(s) " + ", ".join(f"#{i}" for i in unknown)
                      + " have no move; static if they are stills (pass kinds= to check)", unknown))
    else:
        out.append(_f("plan.static_photo", True, "warn", "every fill photo shot moves", []))
    return out


# --------------------------------------------------------------------------- entry points


def check_reel(path: str | Path, cfg: Config | None = None, band: Band | None = None, *,
               allow_silent: bool = False, draft: bool = False, plan: Any = None,
               kinds: Mapping[str, Any] | None = None) -> QCReport:
    """Run every rule on a rendered reel (read-only; temp files go to a private temp dir).
    cfg: the package Config or None; only its ffmpeg/ffprobe paths are read, if present.
    band: "short" | "medium" | "long" to require that duration band. allow_silent: silence (or
    no audio stream) is a warning, for reels whose sound is added in the Instagram app.
    draft: a draft render (h264_videotoolbox, 1x work scale, maybe a lower bitrate): pix_fmt,
    codec and bitrate findings become info. plan / kinds: also run check_plan() and add its
    findings. Raises MediaError when the file cannot be read at all."""
    if band is not None and band not in BANDS:
        raise ValueError(f"band must be one of {', '.join(BANDS)}")
    t0 = time.perf_counter()
    p = Path(path)
    ffmpeg, ffprobe = _tools(cfg)
    facts = probe_reel(p, ffprobe)
    v = facts["video"]
    dec = decode(p, facts, ffmpeg)
    findings = _format_findings(v, draft)
    audio_findings, audio = _audio_findings(facts["audio"], dec, allow_silent)
    findings += audio_findings
    duration = (v["duration"] if v else None) or facts["format_duration"]
    if v:
        findings += [_border_finding(dec, v["width"], v["height"]), _hook_finding(dec), _frozen_finding(dec)]
    findings.append(_duration_finding(duration, band))
    if v:
        findings.append(_loop_finding(dec))
    if plan is not None:
        findings += check_plan(plan, kinds=kinds)
    return QCReport(path=str(p), duration_s=round(duration, 3), width=v["width"] if v else 0,
                    height=v["height"] if v else 0, fps=round(v["fps"], 3) if v else 0.0,
                    video_codec=v["codec"] if v else "",
                    bitrate_kbps=round(v["bitrate"] / 1000, 1) if v and v["bitrate"] else None,
                    audio=audio, findings=findings, draft=draft,
                    elapsed_s=round(time.perf_counter() - t0, 3))


def _targets(arg: Path) -> list[Path]:
    if arg.is_dir():
        return sorted(p for p in arg.iterdir()
                      if p.suffix.lower() in VIDEO_EXT and not p.name.startswith(".") and p.is_file())
    return [arg]


def main(argv: Iterable[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="python -m igmp.qc",
                                 description="Objective pre-checks on rendered Instagram reels.")
    ap.add_argument("path", type=Path, help="a reel, or a folder of reels (not recursive)")
    ap.add_argument("--band", choices=list(BANDS), help="require this duration band")
    ap.add_argument("--allow-silent", action="store_true",
                    help="silence is a warning (a sound is added in the Instagram app)")
    ap.add_argument("--draft", action="store_true", help="a draft render: pix_fmt, codec and bitrate are info")
    ap.add_argument("--json", action="store_true", help="print JSON reports")
    args = ap.parse_args(list(argv) if argv is not None else None)
    targets = _targets(args.path)
    if not targets:
        print(f"no reels in {args.path}", file=sys.stderr)
        return 2
    reports, status = [], 0
    for t in targets:
        try:
            r = check_reel(t, None, args.band, allow_silent=args.allow_silent, draft=args.draft)
        except (MediaError, OSError) as e:
            print(f"ERROR {t}: {e}", file=sys.stderr)
            status = 2
            continue
        reports.append(r)
        if not r.passed:
            status = max(status, 1)
        if not args.json:
            print(r.summary())
    if args.json:
        data = [r.model_dump(mode="json") for r in reports]
        print(json.dumps(data[0] if args.path.is_file() and data else data, indent=2))
    return status


if __name__ == "__main__":
    sys.exit(main())
