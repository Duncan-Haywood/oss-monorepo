"""Real local media processing through ffmpeg.

This module is the only place ShootFlow builds ffmpeg command lines. Adapters in
``production_adapter`` (proxies, grading) and ``render_adapter`` (Instagram
deliverables) call it after their own trust checks, so it assumes every path it
receives is already a declared, workspace-bound input or output.

Safety rules, matching the rest of the pipeline:

- inputs are opened read-only by ffmpeg; nothing here deletes or rewrites them;
- every output is encoded into a fresh hidden temp file next to its final path
  and hard-linked into place, so an existing output is never overwritten and a
  crashed encode never leaves a half-written deliverable under its real name;
- ffmpeg runs with ``-nostdin -n`` and no shell, and inputs are passed as
  ``file:`` URLs so a file name can never be read as an option or protocol.

Throughput comes from three choices: hardware H.264/ProRes encoders when the
machine has them (VideoToolbox on a Mac), small proxies for review and
selection, and one ffmpeg process per job so the existing schedulers'
``max_concurrency`` runs jobs side by side.
"""

from __future__ import annotations

import functools
import os
import shutil
import subprocess
import sys
import uuid
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from pathlib import Path

CommandBuilder = Callable[[Path], Sequence[str]]

SHOOT_LOOK_LUT_PATH = "color/shoot_look.cube"
"""Workspace-relative 3D LUT the grade adapter applies when the file exists."""

PHOTO_EXTENSIONS = frozenset({".jpg", ".jpeg", ".png", ".tif", ".tiff"})
VIDEO_EXTENSIONS = frozenset({".mov", ".mp4", ".m4v"})

PROXY_PHOTO_LONG_EDGE = 1024
PROXY_VIDEO_LONG_EDGE = 960
REEL_SIZE = (1080, 1920)
FEED_SIZE = (1080, 1350)
REEL_FPS = 30
REEL_MAX_SECONDS = 90.0
REEL_CLIP_SECONDS = 4.0
REEL_PHOTO_SECONDS = 2.5

_DEFAULT_TIMEOUT_SECONDS = 4 * 60 * 60
_STDERR_TAIL_CHARS = 800
_IMAGE_CODECS: dict[str, tuple[str, ...]] = {
    ".jpg": ("-c:v", "mjpeg", "-q:v", "2"),
    ".jpeg": ("-c:v", "mjpeg", "-q:v", "2"),
    ".png": ("-c:v", "png"),
    ".tif": ("-c:v", "tiff"),
    ".tiff": ("-c:v", "tiff"),
}
_VIDEO_MUXERS = {".mov": "mov", ".mp4": "mp4", ".m4v": "mp4"}


class FfmpegMediaError(ValueError):
    """Raised when ffmpeg is unavailable, refuses a file, or fails an encode."""


@dataclass(frozen=True)
class FfmpegTools:
    ffmpeg: str
    h264_encoder: str
    prores_encoder: str


def find_ffmpeg_tools() -> FfmpegTools:
    """Locate ffmpeg and pick the fastest encoders this machine supports.

    ``SHOOTFLOW_FFMPEG`` overrides the binary. ``SHOOTFLOW_H264_ENCODER`` and
    ``SHOOTFLOW_PRORES_ENCODER`` override encoder selection, for example to force
    ``libx264`` when a hardware encoder misbehaves.
    """

    configured = os.environ.get("SHOOTFLOW_FFMPEG", "").strip()
    ffmpeg = configured or shutil.which("ffmpeg")
    if not ffmpeg:
        raise FfmpegMediaError(
            "ffmpeg was not found on PATH; install it (for example `brew install ffmpeg`) "
            "or set SHOOTFLOW_FFMPEG"
        )
    encoders = _available_encoders(ffmpeg)
    return FfmpegTools(
        ffmpeg=ffmpeg,
        h264_encoder=_chosen_encoder(
            "SHOOTFLOW_H264_ENCODER",
            hardware="h264_videotoolbox",
            software="libx264",
            encoders=encoders,
        ),
        prores_encoder=_chosen_encoder(
            "SHOOTFLOW_PRORES_ENCODER",
            hardware="prores_videotoolbox",
            software="prores_ks",
            encoders=encoders,
        ),
    )


def media_kind_for_path(path: str) -> str:
    """Return ``photo`` or ``video`` for formats the ffmpeg adapters handle."""

    suffix = Path(path).suffix.lower()
    if suffix in PHOTO_EXTENSIONS:
        return "photo"
    if suffix in VIDEO_EXTENSIONS:
        return "video"
    raise FfmpegMediaError(
        f"ffmpeg adapters handle JPEG/PNG/TIFF photos and MOV/MP4 video, not {suffix or 'extensionless'} "
        f"files: {path}; convert RAW files with a RAW developer first"
    )


def proxy_command(tools: FfmpegTools, source: Path, output: Path) -> list[str]:
    """Build a small review/selection proxy in the source's own format."""

    if media_kind_for_path(output.name) == "photo":
        edge = PROXY_PHOTO_LONG_EDGE
        return [
            *_base_command(tools),
            "-i",
            _file_url(source),
            "-frames:v",
            "1",
            "-update",
            "1",
            "-vf",
            f"scale='min({edge},iw)':'min({edge},ih)':force_original_aspect_ratio=decrease",
            *_image_codec(output),
            "-f",
            "image2",
            str(output),
        ]
    edge = PROXY_VIDEO_LONG_EDGE
    return [
        *_base_command(tools),
        "-i",
        _file_url(source),
        "-map",
        "0:v:0",
        "-map",
        "0:a:0?",
        "-vf",
        (
            f"scale='min({edge},iw)':'min({edge},ih)':force_original_aspect_ratio=decrease"
            ":force_divisible_by=2,format=yuv420p"
        ),
        *_h264_args(tools, quality="proxy"),
        "-c:a",
        "aac",
        "-b:a",
        "96k",
        *_video_muxer_args(output),
        str(output),
    ]


def grade_command(
    tools: FfmpegTools,
    source: Path,
    output: Path,
    *,
    lut_path: str | None,
) -> list[str]:
    """Build a full-resolution graded master, applying the shoot LUT if given.

    ``lut_path`` must be a plain workspace-relative path; ffmpeg runs with the
    workspace as its working directory so the filter argument needs no escaping.
    """

    filters = []
    if lut_path is not None:
        _validate_filter_path(lut_path)
        filters.append(f"lut3d=file={lut_path}")
    if media_kind_for_path(output.name) == "photo":
        return [
            *_base_command(tools),
            "-i",
            _file_url(source),
            "-frames:v",
            "1",
            "-update",
            "1",
            *(("-vf", ",".join(filters)) if filters else ()),
            *_image_codec(output),
            "-f",
            "image2",
            str(output),
        ]
    if output.suffix.lower() == ".mov":
        video_args = _prores_args(tools)
        audio_args: tuple[str, ...] = ("-c:a", "pcm_s16le")
    else:
        filters.append("format=yuv420p")
        video_args = _h264_args(tools, quality="master")
        audio_args = ("-c:a", "aac", "-b:a", "320k")
    return [
        *_base_command(tools),
        "-i",
        _file_url(source),
        "-map",
        "0:v:0",
        "-map",
        "0:a:0?",
        *(("-vf", ",".join(filters)) if filters else ()),
        *video_args,
        *audio_args,
        *_video_muxer_args(output),
        str(output),
    ]


def feed_image_command(tools: FfmpegTools, source: Path, output: Path) -> list[str]:
    """Build one 4:5 feed JPEG (carousel slide or photo-set image)."""

    width, height = FEED_SIZE
    return [
        *_base_command(tools),
        "-i",
        _file_url(source),
        "-frames:v",
        "1",
        "-update",
        "1",
        "-vf",
        _cover_filter(width, height),
        *_image_codec(output),
        "-f",
        "image2",
        str(output),
    ]


def reel_command(tools: FfmpegTools, sources: Sequence[Path], output: Path) -> list[str]:
    """Build a 9:16 H.264 reel that cuts the selected clips/photos together.

    Each video contributes up to ``REEL_CLIP_SECONDS`` from its start and each
    photo is held for ``REEL_PHOTO_SECONDS``, both shortened when needed to keep
    the reel within Instagram's ``REEL_MAX_SECONDS``. Audio is left out: music
    and voice-over are an editorial choice made after the cut.
    """

    if not sources:
        raise FfmpegMediaError("reel needs at least one graded input")
    budget = REEL_MAX_SECONDS / len(sources)
    clip_seconds = min(REEL_CLIP_SECONDS, budget)
    photo_seconds = min(REEL_PHOTO_SECONDS, budget)
    width, height = REEL_SIZE
    input_args: list[str] = []
    filter_parts: list[str] = []
    for index, source in enumerate(sources):
        normalize = f"{_cover_filter(width, height)},fps={REEL_FPS},format=yuv420p"
        if media_kind_for_path(source.name) == "photo":
            input_args += ["-loop", "1", "-t", _seconds(photo_seconds), "-i", _file_url(source)]
            filter_parts.append(f"[{index}:v:0]{normalize}[v{index}]")
        else:
            input_args += ["-i", _file_url(source)]
            filter_parts.append(
                f"[{index}:v:0]trim=duration={_seconds(clip_seconds)},setpts=PTS-STARTPTS,"
                f"{normalize}[v{index}]"
            )
    labels = "".join(f"[v{index}]" for index in range(len(sources)))
    filter_parts.append(f"{labels}concat=n={len(sources)}:v=1:a=0[reel]")
    return [
        *_base_command(tools),
        *input_args,
        "-filter_complex",
        ";".join(filter_parts),
        "-map",
        "[reel]",
        "-an",
        *_h264_args(tools, quality="delivery"),
        "-movflags",
        "+faststart",
        "-f",
        "mp4",
        str(output),
    ]


def encode_new_output(
    workspace_root: Path,
    output: str,
    *,
    build_command: CommandBuilder,
    timeout_seconds: float | None = None,
) -> None:
    """Encode one declared output atomically without overwriting anything."""

    encode_new_outputs(workspace_root, ((output, build_command),), timeout_seconds=timeout_seconds)


def encode_new_outputs(
    workspace_root: Path,
    jobs: Sequence[tuple[str, CommandBuilder]],
    *,
    timeout_seconds: float | None = None,
) -> None:
    """Encode every declared output of one task, then commit them together.

    Each job is ``(output, build_command)``; ``build_command`` receives the
    absolute temp path to encode into and returns the ffmpeg argv. All encodes
    finish before any file appears under its real name, so a failure part-way
    through a carousel leaves no committed slides behind to block the retry.
    Commit is a hard link, so an output that already exists is refused rather
    than replaced: a rerun never overwrites a deliverable someone may have
    reviewed or posted.
    """

    root = Path(workspace_root)
    staged: list[tuple[str, Path, Path]] = []
    try:
        for output, build_command in jobs:
            output_path = root / output
            _reject_symlinks_under(output_path.parent, root)
            if output_path.exists() or output_path.is_symlink():
                raise FfmpegMediaError(f"Refusing to overwrite existing output: {output}")
            try:
                output_path.parent.mkdir(parents=True, exist_ok=True)
            except OSError as exc:
                raise FfmpegMediaError(f"Unable to create output directory: {output_path.parent}") from exc
            _reject_symlinks_under(output_path.parent, root)
            # Hidden, unique, and still ending in the real extension so the
            # command builder picks the right codec for the final file.
            temp_path = output_path.with_name(
                f".{output_path.stem}.{os.getpid()}.{uuid.uuid4().hex}.tmp{output_path.suffix}"
            )
            staged.append((output, output_path, temp_path))
            run_ffmpeg(build_command(temp_path), cwd=root, timeout_seconds=timeout_seconds)
            if not temp_path.is_file() or temp_path.is_symlink() or temp_path.stat().st_size == 0:
                raise FfmpegMediaError(f"ffmpeg produced no output for: {output}")
        for output, output_path, temp_path in staged:
            try:
                os.link(temp_path, output_path)
            except FileExistsError as exc:
                raise FfmpegMediaError(f"Refusing to overwrite existing output: {output}") from exc
            except OSError as exc:
                raise FfmpegMediaError(f"Unable to commit output: {output}") from exc
    finally:
        for _output, _output_path, temp_path in staged:
            try:
                temp_path.unlink()
            except FileNotFoundError:
                pass


def run_ffmpeg(
    command: Sequence[str],
    *,
    cwd: Path,
    timeout_seconds: float | None = None,
) -> None:
    """Run ffmpeg without a shell and raise with the stderr tail on failure."""

    timeout = timeout_seconds if timeout_seconds is not None else _timeout_from_environment()
    try:
        completed = subprocess.run(
            list(command),
            cwd=cwd,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
            timeout=timeout,
            check=False,
        )
    except FileNotFoundError as exc:
        raise FfmpegMediaError(f"ffmpeg executable not found: {command[0]}") from exc
    except subprocess.TimeoutExpired as exc:
        raise FfmpegMediaError(f"ffmpeg timed out after {timeout:g} seconds") from exc
    if completed.returncode != 0:
        detail = completed.stderr.decode("utf-8", errors="replace").strip()
        if len(detail) > _STDERR_TAIL_CHARS:
            detail = "..." + detail[-_STDERR_TAIL_CHARS:]
        raise FfmpegMediaError(f"ffmpeg exited with status {completed.returncode}: {detail or 'no stderr'}")


def require_workspace_file(workspace_root: Path, relative_path: str, *, label: str) -> Path:
    """Return a regular, non-symlinked file inside the workspace."""

    root = Path(workspace_root)
    relative = Path(relative_path)
    if relative.is_absolute() or ".." in relative.parts or not relative.parts:
        raise FfmpegMediaError(f"Unsafe {label} path: {relative_path}")
    path = root / relative
    _reject_symlinks_under(path, root)
    if not path.is_file():
        raise FfmpegMediaError(f"Missing {label}: {relative_path}")
    return path


def _base_command(tools: FfmpegTools) -> list[str]:
    return [tools.ffmpeg, "-hide_banner", "-loglevel", "error", "-nostdin", "-n"]


def _file_url(path: Path) -> str:
    return f"file:{path.absolute()}"


def _image_codec(output: Path) -> tuple[str, ...]:
    try:
        return _IMAGE_CODECS[output.suffix.lower()]
    except KeyError as exc:
        raise FfmpegMediaError(f"Unsupported image output format: {output.name}") from exc


def _video_muxer_args(output: Path) -> tuple[str, ...]:
    try:
        muxer = _VIDEO_MUXERS[output.suffix.lower()]
    except KeyError as exc:
        raise FfmpegMediaError(f"Unsupported video output format: {output.name}") from exc
    if muxer == "mp4":
        return ("-movflags", "+faststart", "-f", muxer)
    return ("-f", muxer)


def _cover_filter(width: int, height: int) -> str:
    return (
        f"scale={width}:{height}:force_original_aspect_ratio=increase,"
        f"crop={width}:{height},setsar=1"
    )


def _h264_args(tools: FfmpegTools, *, quality: str) -> tuple[str, ...]:
    if tools.h264_encoder == "libx264":
        settings = {
            "proxy": ("-preset", "veryfast", "-crf", "28"),
            "delivery": ("-preset", "veryfast", "-crf", "20"),
            "master": ("-preset", "medium", "-crf", "16"),
        }[quality]
        return ("-c:v", "libx264", *settings, "-pix_fmt", "yuv420p")
    bitrate = {"proxy": "3M", "delivery": "12M", "master": "50M"}[quality]
    return ("-c:v", tools.h264_encoder, "-b:v", bitrate, "-pix_fmt", "yuv420p")


def _prores_args(tools: FfmpegTools) -> tuple[str, ...]:
    if tools.prores_encoder == "prores_videotoolbox":
        return ("-c:v", "prores_videotoolbox", "-profile:v", "hq")
    return ("-c:v", tools.prores_encoder, "-profile:v", "3", "-pix_fmt", "yuv422p10le")


def _seconds(value: float) -> str:
    return f"{value:.3f}"


def _validate_filter_path(path: str) -> None:
    if not path or any(not (char.isalnum() or char in "/._-") for char in path) or path.startswith("/"):
        raise FfmpegMediaError(f"LUT path must be a plain workspace-relative path: {path}")


def _reject_symlinks_under(path: Path, root: Path) -> None:
    current = path
    while True:
        if current.is_symlink():
            raise FfmpegMediaError(f"Refusing symlinked path: {current}")
        if current == root or current.absolute() == root.absolute() or current.parent == current:
            return
        current = current.parent


def _timeout_from_environment() -> float:
    raw = os.environ.get("SHOOTFLOW_FFMPEG_TIMEOUT_SECONDS", "").strip()
    if not raw:
        return float(_DEFAULT_TIMEOUT_SECONDS)
    try:
        value = float(raw)
    except ValueError as exc:
        raise FfmpegMediaError("SHOOTFLOW_FFMPEG_TIMEOUT_SECONDS must be a number") from exc
    if value <= 0:
        raise FfmpegMediaError("SHOOTFLOW_FFMPEG_TIMEOUT_SECONDS must be positive")
    return value


def _chosen_encoder(
    environment_key: str,
    *,
    hardware: str,
    software: str,
    encoders: frozenset[str],
) -> str:
    configured = os.environ.get(environment_key, "").strip()
    if configured:
        if configured not in encoders:
            raise FfmpegMediaError(f"{environment_key}={configured} is not an encoder this ffmpeg provides")
        return configured
    if sys.platform == "darwin" and hardware in encoders:
        return hardware
    if software not in encoders:
        raise FfmpegMediaError(f"This ffmpeg build lacks the {software} encoder")
    return software


@functools.lru_cache(maxsize=8)
def _available_encoders(ffmpeg: str) -> frozenset[str]:
    try:
        completed = subprocess.run(
            [ffmpeg, "-hide_banner", "-nostdin", "-encoders"],
            stdin=subprocess.DEVNULL,
            capture_output=True,
            timeout=30,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise FfmpegMediaError(f"Unable to run ffmpeg: {ffmpeg}") from exc
    if completed.returncode != 0:
        raise FfmpegMediaError(f"ffmpeg -encoders failed: {ffmpeg}")
    names = set()
    for line in completed.stdout.decode("utf-8", errors="replace").splitlines():
        parts = line.split()
        if len(parts) >= 2 and len(parts[0]) == 6 and parts[0][0] in "VAS":
            names.add(parts[1])
    return frozenset(names)
