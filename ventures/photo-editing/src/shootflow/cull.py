"""Standalone culling: a folder of stills in, a keeper per burst and a report out.

``shootflow cull FOLDER`` reads the photos (JPEG, PNG, TIFF and the preview
embedded in RAW files), scores each with the measured frame metrics, groups
near-identical frames by perceptual hash (single linkage, the same distance the
story planner uses, plus a crop-tolerant match for frames the camera panned or
zoomed a few percent between), and picks one keeper per group. It also flags frames that
fail on their own: blurred, badly exposed, or with a prominent closed eye when a
face detector is configured (``SHOOTFLOW_FACE_DETECTOR``, see ``faces.py``).

Safety rules, matching the rest of ShootFlow: photos are only read. Output is a
``cull_report.json`` and ``cull_report.html`` in a folder you name, and, with
``write_xmp``, a Lightroom/Bridge ``.xmp`` sidecar per photo. An existing sidecar
is never touched (it holds the photographer's edits); it is listed as skipped.

The scores are technical signals, not taste. A keeper is the sharpest, best
exposed, best framed frame of its group, not necessarily the best expression
(that needs the face detector). Nothing here has been checked against a
photographer's real picks yet; the report says so.
"""

from __future__ import annotations

import base64
import html
import json
import re
import subprocess
import tempfile
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from pathlib import Path

from shootflow.faces import FaceReport, detect_faces
from shootflow.ffmpeg_media import PHOTO_EXTENSIONS, FfmpegMediaError, FfmpegTools, find_ffmpeg_tools
from shootflow.frame_analysis import (
    FrameMetrics,
    ZoomIndex,
    analyze_media,
    crop_distance,
    fine_pack,
    fine_within,
    pan_within,
    window_pack,
    windows_within,
    zoom_distance_within,
    zoom_index,
)
from shootflow.raw_preview import RAW_EXTENSIONS, extract_preview, is_raw_path

NEAR_DUPLICATE_MAX_DISTANCE = 8
# Crop-tolerant second pass (eval/cull-crop-grouping-2026-11-17.md): two frames
# whose whole-frame hashes differ by at most CROP_CANDIDATE_MAX_DISTANCE also
# group when some pair of their 88% windows is within CROP_MAX_DISTANCE and that
# is at least CROP_MIN_GAIN closer than the whole frames. Picked on 165 tune
# photos; on 166 held-out ones it took burst-pair recall from 0.40 to 0.72 and
# added 4 false merges in 13,695 pairs of distinct photos (17 to 21).
# The gate was 24 until 2026-11-18 (eval/cull-crop-gate-2026-11-18.md): every
# 6% pan it missed had crop windows within 0-7 bits but whole frames 25-33
# apart. At 44, the wide-pan pass's gate, held-out recall rose 0.985 to 0.991
# (6% pans 0.85-0.86 to 1.00) with no added false merge in 13,695 pairs.
CROP_CANDIDATE_MAX_DISTANCE = 44
CROP_MAX_DISTANCE = 6
CROP_MIN_GAIN = 5
# Zoom pass (eval/cull-zoom-windows-2026-11-18.md): a pair up to
# ZOOM_CANDIDATE_MAX_DISTANCE apart also groups when one frame's whole hash is
# within ZOOM_MAX_DISTANCE of a zoom window of the other and that is at least
# ZOOM_MIN_GAIN closer than the whole frames. Picked on the same 165 tune photos.
ZOOM_CANDIDATE_MAX_DISTANCE = 28
ZOOM_MAX_DISTANCE = 6
ZOOM_MIN_GAIN = 6
# Wide-pan pass (eval/cull-pan-windows-2026-11-18.md): a pair up to
# PAN_CANDIDATE_MAX_DISTANCE apart also groups when two 88% windows offset
# further than the crop pass reaches are within PAN_MAX_DISTANCE and that is at
# least PAN_MIN_GAIN closer than the whole frames. Picked on the same 165 tune photos.
PAN_CANDIDATE_MAX_DISTANCE = 44
PAN_MAX_DISTANCE = 5
PAN_MIN_GAIN = 6
# Fine-offset pass (eval/cull-fine-offsets-2026-11-18.md): the crop and wide-pan
# windows sit on a 3% grid, so a pan that moves the content between its steps
# (a 10% pan moves it 11.1%) lines up 6-10 bits apart where the exact offset is
# 0-3. A pair up to FINE_CANDIDATE_MAX_DISTANCE apart also groups when a window
# pair at some whole-percent offset off that grid (frame_analysis.FINE_MARKS)
# is within FINE_MAX_DISTANCE and at least FINE_MIN_GAIN closer than the whole
# frames. Picked on the same 165 tune photos.
FINE_CANDIDATE_MAX_DISTANCE = 44
FINE_MAX_DISTANCE = 5
FINE_MIN_GAIN = 8
BLURRY_BELOW = 0.2
BAD_EXPOSURE_BELOW = 0.25
CLOSED_EYES_BELOW = 0.3
CLOSE_CALL_MARGIN = 0.03
_MAX_FILES = 20000
THUMB_WIDTH = 220
_THUMB_TIMEOUT_SECONDS = 60.0
_SIDECAR_RATING = {"keeper": 4, "alternate": 2, "reject": -1}
_SAFE_NAME = re.compile(r"[^\x20-\x7e]")

Analyzer = Callable[[Path], tuple[FrameMetrics, FaceReport | None]]


class CullError(ValueError):
    """Raised when the folder cannot be culled."""


@dataclass(frozen=True)
class CullItem:
    path: str
    group: int
    role: str  # keeper | alternate | reject
    score: float
    reasons: tuple[str, ...]
    sharpness: float
    exposure: float
    eyes_open: float | None
    dhash: str
    # Same-name files folded into this frame (a RAW beside its JPEG), so one
    # shot is one decision and one sidecar.
    companions: tuple[str, ...] = ()
    # Keepers only: score lead over the best alternate in the burst, None when
    # the keeper has no rival. Under CLOSE_CALL_MARGIN the pick is a toss-up
    # worth a human glance.
    margin: float | None = None

    @property
    def close_call(self) -> bool:
        return self.margin is not None and self.margin < CLOSE_CALL_MARGIN


@dataclass(frozen=True)
class CullResult:
    folder: str
    items: tuple[CullItem, ...]
    unreadable: tuple[tuple[str, str], ...]
    sidecars_written: tuple[str, ...]
    sidecars_skipped: tuple[str, ...]

    @property
    def group_count(self) -> int:
        return len({item.group for item in self.items})

    def count(self, role: str) -> int:
        return sum(1 for item in self.items if item.role == role)


def scan_photos(folder: Path, *, recursive: bool = False) -> list[Path]:
    if not folder.is_dir():
        raise CullError(f"not a folder: {folder}")
    suffixes = PHOTO_EXTENSIONS | RAW_EXTENSIONS
    pattern = "**/*" if recursive else "*"
    found = sorted(
        path
        for path in folder.glob(pattern)
        if path.is_file() and not path.is_symlink() and path.suffix.lower() in suffixes
        and not path.name.startswith(".")
    )
    if len(found) > _MAX_FILES:
        raise CullError(f"{len(found)} photos is over the {_MAX_FILES} limit; cull a sub-folder")
    return found


def collapse_pairs(photos: Sequence[Path], root: Path) -> tuple[list[Path], dict[Path, tuple[str, ...]]]:
    """Fold RAW+JPEG pairs (same folder, same stem) into one shot.

    Cameras shooting RAW+JPEG write IMG_1.CR2 and IMG_1.JPG. Scored apart they
    land in one burst group, one is demoted to alternate, and both would fight
    over the single IMG_1.xmp sidecar Lightroom reads for the pair. The JPEG
    (full size, no preview extraction) stands for the shot; the others are
    listed as its companions.
    """

    by_stem: dict[tuple[Path, str], list[Path]] = {}
    for path in photos:
        by_stem.setdefault((path.parent, path.stem.lower()), []).append(path)
    kept: list[Path] = []
    companions: dict[Path, tuple[str, ...]] = {}
    for members in by_stem.values():
        members.sort(key=lambda p: (is_raw_path(p), str(p)))
        kept.append(members[0])
        if len(members) > 1:
            companions[members[0]] = tuple(_rel(p, root) for p in members[1:])
    return sorted(kept), companions


def default_analyzer(tools: FfmpegTools) -> Analyzer:
    def analyze(path: Path) -> tuple[FrameMetrics, FaceReport | None]:
        return analyze_media(tools, path, media_type="photo"), detect_faces(path)

    return analyze


def cull_folder(
    folder: Path | str,
    *,
    recursive: bool = False,
    analyzer: Analyzer | None = None,
) -> CullResult:
    root = Path(folder)
    photos = scan_photos(root, recursive=recursive)
    photos, companion_map = collapse_pairs(photos, root)
    if not photos:
        raise CullError(f"no photos found in {root}")
    analyze = analyzer or default_analyzer(find_ffmpeg_tools())
    scored: list[tuple[Path, FrameMetrics, FaceReport | None]] = []
    unreadable: list[tuple[str, str]] = []
    for path in photos:
        try:
            metrics, faces = analyze(path)
        except (FfmpegMediaError, OSError) as exc:
            unreadable.append((_rel(path, root), str(exc)[:200]))
            continue
        scored.append((path, metrics, faces))
    groups = _group(scored)
    items: list[CullItem] = []
    for number, members in enumerate(groups, start=1):
        ranked = sorted(members, key=lambda m: (-_score(m[1], m[2]), str(m[0])))
        keeper_taken = False
        passing = [m for m in ranked if not _failures(m[1], m[2])]
        margin = (
            round(_score(passing[0][1], passing[0][2]) - _score(passing[1][1], passing[1][2]), 4)
            if len(passing) > 1 else None
        )
        for path, metrics, faces in ranked:
            reasons = _failures(metrics, faces)
            if reasons:
                role = "reject"
            elif not keeper_taken:
                role, keeper_taken = "keeper", True
            else:
                role = "alternate"
            items.append(
                CullItem(
                    path=_rel(path, root),
                    group=number,
                    role=role,
                    score=round(_score(metrics, faces), 4),
                    reasons=reasons,
                    sharpness=round(metrics.sharpness, 4),
                    exposure=round(metrics.exposure, 4),
                    eyes_open=faces.worst_eyes_open if faces else None,
                    dhash=metrics.dhash,
                    companions=companion_map.get(path, ()),
                    margin=margin if role == "keeper" else None,
                )
            )
    items.sort(key=lambda item: (item.group, item.path))
    return CullResult(str(root), tuple(items), tuple(unreadable), (), ())


def make_thumbnail(tools: FfmpegTools, path: Path) -> bytes:
    """A small JPEG of one photo (RAW: its embedded preview), read through ffmpeg; never written to disk."""

    def run(source: Path) -> bytes:
        command = [
            tools.ffmpeg, "-v", "error", "-nostdin", "-i", str(source),
            "-frames:v", "1", "-vf", f"scale='min({THUMB_WIDTH},iw)':-2",
            "-q:v", "5", "-f", "image2pipe", "-c:v", "mjpeg", "-",
        ]
        try:
            done = subprocess.run(
                command, stdin=subprocess.DEVNULL, capture_output=True,
                timeout=_THUMB_TIMEOUT_SECONDS, check=False,
            )
        except (OSError, subprocess.TimeoutExpired) as exc:
            raise FfmpegMediaError(f"thumbnail failed for {source.name}: {exc}") from exc
        if done.returncode != 0 or not done.stdout:
            raise FfmpegMediaError(f"thumbnail failed for {path.name}")
        return done.stdout

    if is_raw_path(path):
        preview = extract_preview(path)
        if preview is None:
            raise FfmpegMediaError(f"no embedded preview in {path.name}")
        with tempfile.TemporaryDirectory(prefix="shootflow-thumb-") as scratch:
            jpeg = Path(scratch) / "preview.jpg"
            jpeg.write_bytes(preview)
            return run(jpeg)
    return run(path)


def thumbnail_data_uris(
    result: CullResult, tools: FfmpegTools | None = None, maker: Callable[[Path], bytes] | None = None
) -> dict[str, str]:
    """``data:`` URIs by relative path; a photo whose thumbnail fails is left out, not fatal."""

    ff = tools or find_ffmpeg_tools()
    make = maker or (lambda p: make_thumbnail(ff, p))
    root = Path(result.folder)
    uris: dict[str, str] = {}
    for item in result.items:
        try:
            data = make(root / item.path)
        except (FfmpegMediaError, OSError):
            continue
        uris[item.path] = "data:image/jpeg;base64," + base64.b64encode(data).decode("ascii")
    return uris


def _score(metrics: FrameMetrics, faces: FaceReport | None) -> float:
    # Culling leans on technical quality more than the story planner does.
    base = 0.6 * metrics.technical_score + 0.4 * metrics.story_score
    return base + (faces.story_adjustment if faces else 0.0)


def _failures(metrics: FrameMetrics, faces: FaceReport | None) -> tuple[str, ...]:
    reasons: list[str] = []
    if metrics.sharpness < BLURRY_BELOW:
        reasons.append("blurry")
    if metrics.exposure < BAD_EXPOSURE_BELOW:
        reasons.append("bad exposure")
    if faces and faces.worst_eyes_open is not None and faces.worst_eyes_open < CLOSED_EYES_BELOW:
        reasons.append("closed eyes")
    return tuple(reasons)


def crop_match(distance: int, crops_a: Sequence[int], crops_b: Sequence[int]) -> bool:
    """The crop-tolerant second pass for a pair whose whole-frame hashes are ``distance`` apart."""

    if distance > CROP_CANDIDATE_MAX_DISTANCE:
        return False
    shifted = crop_distance(crops_a, crops_b)
    return shifted <= CROP_MAX_DISTANCE and shifted <= distance - CROP_MIN_GAIN


def zoom_match(distance: int, hash_a: int, index_a: ZoomIndex, hash_b: int, index_b: ZoomIndex) -> bool:
    """The zoom pass for a pair whose whole-frame hashes are ``distance`` apart (``zoom_index`` of each)."""

    if distance > ZOOM_CANDIDATE_MAX_DISTANCE:
        return False
    limit = min(ZOOM_MAX_DISTANCE, distance - ZOOM_MIN_GAIN)
    if limit < 0:
        return False
    return zoom_distance_within(hash_a, index_a, hash_b, index_b, limit) <= limit


def pan_match(distance: int, pans_a: tuple[int, ...], pans_b: tuple[int, ...]) -> bool:
    """The wide-pan pass (8-10% pans) for a pair ``distance`` apart on the whole frame (``pan_pack`` of each)."""

    if distance > PAN_CANDIDATE_MAX_DISTANCE:
        return False
    return pan_within(pans_a, pans_b, min(PAN_MAX_DISTANCE, distance - PAN_MIN_GAIN))


def window_match(distance: int, windows_a: tuple[int, ...], windows_b: tuple[int, ...]) -> bool:
    """``crop_match or pan_match`` in one packed check (``window_pack`` of each frame)."""

    crop_limit = min(CROP_MAX_DISTANCE, distance - CROP_MIN_GAIN) if distance <= CROP_CANDIDATE_MAX_DISTANCE else -1
    pan_limit = min(PAN_MAX_DISTANCE, distance - PAN_MIN_GAIN) if distance <= PAN_CANDIDATE_MAX_DISTANCE else -1
    return windows_within(windows_a, windows_b, crop_limit, pan_limit)


def fine_match(distance: int, fine_a: tuple[int, ...], fine_b: tuple[int, ...]) -> bool:
    """The fine-offset pass for a pair ``distance`` apart on the whole frame (``fine_pack`` of each)."""

    if distance > FINE_CANDIDATE_MAX_DISTANCE:
        return False
    return fine_within(fine_a, fine_b, min(FINE_MAX_DISTANCE, distance - FINE_MIN_GAIN))


def burst_match(
    distance: int,
    hash_a: int, crops_a: Sequence[int], index_a: ZoomIndex,
    hash_b: int, crops_b: Sequence[int], index_b: ZoomIndex,
    windows_a: tuple[int, ...] | None = None, windows_b: tuple[int, ...] | None = None,
    fine_a: tuple[int, ...] = (), fine_b: tuple[int, ...] = (),
) -> bool:
    """Whether two frames ``distance`` apart on the whole frame belong to one burst.

    ``windows_a`` / ``windows_b`` are ``window_pack`` of the crops, computed here when not given.
    ``fine_a`` / ``fine_b`` are ``fine_pack`` of each frame; the fine pass is skipped when either is empty.
    """

    return (
        distance <= NEAR_DUPLICATE_MAX_DISTANCE
        or window_match(
            distance,
            window_pack(crops_a) if windows_a is None else windows_a,
            window_pack(crops_b) if windows_b is None else windows_b,
        )
        or zoom_match(distance, hash_a, index_a, hash_b, index_b)
        or fine_match(distance, fine_a, fine_b)
    )


# Exact candidate index for the burst grouping (2026-11-18,
# eval/cull-grouping-index-2026-11-18.md). Every way two frames can link needs
# some pair of 64-bit hashes within a few bits: the whole frames within
# NEAR_DUPLICATE_MAX_DISTANCE (8); one frame's centre window within
# CROP_MAX_DISTANCE (6) of any crop window of the other; one frame's whole hash
# within ZOOM_MAX_DISTANCE (6) of any zoom window of the other; or a wide-pan
# window pair within PAN_MAX_DISTANCE (5); or a fine-offset window pair within
# FINE_MAX_DISTANCE (2026-11-18, the same per-a-window tables). Cut a hash into three chunks and two
# hashes r bits apart differ in some chunk by at most r // 3 bits (pigeonhole),
# so looking up each chunk with every flip of up to r // 3 of its bits finds
# every pair that can link, and only those reach ``burst_match``. The partition
# is the same as the all-pairs scan's (``_linked_pairs_all``), which a test
# pins; on 2,000 frames the scan made about 2M packed window checks.
_INDEX_MIN_FRAMES = 200  # below this the plain scan is as quick (tied at 500 frames before the fine pass, near 200 after)


def _chunks(count: int) -> tuple[tuple[int, int, int], ...]:
    """(shift, mask, bits) of ``count`` chunks covering all 64 bits, as even as can be."""

    out, shift = [], 0
    for k in range(count):
        bits = (64 - shift) // (count - k)
        out.append((shift, (1 << bits) - 1, bits))
        shift += bits
    return tuple(out)


def _flips(bits: int, most: int) -> tuple[int, ...]:
    """Every mask of ``bits`` bits with at most ``most`` (0-2) bits set."""

    out = [0]
    if most >= 1:
        out += [1 << a for a in range(bits)]
    if most >= 2:
        out += [(1 << a) | (1 << b) for a in range(bits) for b in range(a + 1, bits)]
    if most >= 3:
        raise ValueError("more than 2 flips per chunk is not needed by any limit here")
    return tuple(out)


class _ChunkIndex:
    """Frames by the chunks of the hashes inserted for them, for lookups within ``radius`` bits.

    Two hashes ``radius`` apart differ by at most ``radius // count`` bits in
    their closest chunk, so ``near`` flips up to that many bits per chunk.
    """

    def __init__(self, radius: int, count: int = 3) -> None:
        self.chunks = _chunks(count)
        most = radius // count
        self.flips = tuple(_flips(bits, most) for _shift, _mask, bits in self.chunks)
        self.tables: tuple[dict[int, list[int]], ...] = tuple({} for _ in self.chunks)

    def add(self, frame: int, values: Sequence[int]) -> None:
        for table, (shift, mask, _bits) in zip(self.tables, self.chunks):
            for key in {(v >> shift) & mask for v in values}:
                hit = table.get(key)
                if hit is None:
                    table[key] = [frame]
                else:
                    hit.append(frame)

    def near(self, value: int, out: set[int]) -> None:
        """Add to ``out`` every frame with an inserted hash that may be within the radius of ``value``."""

        for table, (shift, mask, _bits), flips in zip(self.tables, self.chunks, self.flips):
            # map() keeps the lookups in C.
            out.update(*filter(None, map(table.get, map(((value >> shift) & mask).__xor__, flips))))


def _candidate_pairs(
    hashes: Sequence[int], crops: Sequence[tuple[int, ...]], zooms: Sequence[tuple[int, ...]],
    fines: Sequence[tuple[int, ...]] | None = None,
) -> tuple[list[set[int]], list[set[int]], list[set[int]], list[set[int]]]:
    """(near, windows, zoom, fine) candidates: for each frame i, the frames j > i each pass could link it to.

    A superset of the pairs the pass links: ``near`` for the whole-frame
    distance, ``windows`` for ``window_match`` (crop and wide-pan windows),
    ``zoom`` for ``zoom_match``, ``fine`` for ``fine_match`` (``fines`` holds
    each frame's fine hashes; empty sets when not given).
    """

    from shootflow.frame_analysis import _CROP_CENTRE, _FINE_GRID, _PAN_PAIRS, CROP_STEPS

    n, full = len(hashes), CROP_STEPS * CROP_STEPS
    fines = fines if fines is not None else [()] * n
    # Pan lanes pair window a of the earlier frame with window b of the later
    # one. Lanes sharing an a window share a table of their b windows, so each
    # frame makes 21 pan queries rather than 56.
    pan_lanes: dict[int, list[int]] = {}
    for a, b in _PAN_PAIRS:
        pan_lanes.setdefault(a, []).append(b)
    # Fine lanes pair nearly every window with nearly every other (544 lanes
    # over 49 windows), so one table of all 49 windows per frame stands in for
    # them: any fine lane within the limit has its two windows in it. Per-window
    # tables like the pan ones cost 3x the time on 2,000 frames.
    whole = _ChunkIndex(NEAR_DUPLICATE_MAX_DISTANCE)
    windows = _ChunkIndex(CROP_MAX_DISTANCE)
    zoom_windows = _ChunkIndex(ZOOM_MAX_DISTANCE)
    pan_b = {a: _ChunkIndex(PAN_MAX_DISTANCE) for a in pan_lanes}
    fine_windows = _ChunkIndex(FINE_MAX_DISTANCE)
    grid: list[tuple[int, ...]] = []
    for i, h in enumerate(hashes):
        whole.add(i, (h,))
        if len(crops[i]) == full:
            windows.add(i, crops[i])
            for a, bs in pan_lanes.items():
                pan_b[a].add(i, [crops[i][b] for b in bs])
        if zooms[i]:
            zoom_windows.add(i, zooms[i])
        cells = (*crops[i], *fines[i]) if len(crops[i]) == full and fines[i] else ()
        grid.append(cells)
        if len(cells) == len(_FINE_GRID):
            fine_windows.add(i, cells)
    near: list[set[int]] = [set() for _ in range(n)]
    win: list[set[int]] = [set() for _ in range(n)]
    zoom: list[set[int]] = [set() for _ in range(n)]
    fine: list[set[int]] = [set() for _ in range(n)]

    def keep(i: int, found: set[int], into: list[set[int]]) -> None:
        # Crop and zoom lookups are one-sided (this frame's centre or whole
        # hash against the other's windows), so a hit on an earlier frame is
        # stored under that frame.
        into[i].update(j for j in found if j > i)
        for j in found:
            if j < i:
                into[j].add(i)

    for i, h in enumerate(hashes):
        found: set[int] = set()
        whole.near(h, found)
        near[i].update(j for j in found if j > i)  # symmetric: the later frame finds it too
        found = set()
        zoom_windows.near(h, found)  # this whole frame inside another's zoom window
        keep(i, found, zoom)
        if len(crops[i]) == full:
            found = set()
            windows.near(crops[i][_CROP_CENTRE], found)
            keep(i, found, win)
            found = set()
            for a, table in pan_b.items():
                table.near(crops[i][a], found)
            win[i].update(j for j in found if j > i)  # pan lanes are ordered: this frame on the a side
        if len(grid[i]) == len(_FINE_GRID):
            found = set()
            for cell in grid[i]:
                fine_windows.near(cell, found)
            fine[i].update(j for j in found if j > i)  # symmetric: the later frame finds it too
    return near, win, zoom, fine


def _linked_pairs_all(hashes, crops, zooms, windows, fines=None):
    """Every linked pair (i < j) by the plain all-pairs scan: the reference the index must match."""

    fines = fines if fines is not None else [()] * len(hashes)
    for i in range(len(hashes)):
        hi = hashes[i]
        for j in range(i + 1, len(hashes)):
            distance = (hi ^ hashes[j]).bit_count()
            if distance <= NEAR_DUPLICATE_MAX_DISTANCE or burst_match(
                distance, hi, crops[i], zooms[i], hashes[j], crops[j], zooms[j], windows[i], windows[j],
                fines[i], fines[j],
            ):
                yield i, j


def _linked_pairs_indexed(hashes, crops, zooms, zoom_hashes, windows, fine_hashes=None, fines=None):
    """The same pairs as ``_linked_pairs_all``, checking only the candidates each pass could link.

    ``fine_hashes`` are each frame's fine hashes (ints) for the index, ``fines`` their ``fine_pack``.
    """

    near, win, zoom, fine = _candidate_pairs(hashes, crops, zoom_hashes, fine_hashes)
    for i in range(len(hashes)):
        hi = hashes[i]
        for j in sorted(near[i] | win[i] | zoom[i] | fine[i]):
            distance = (hi ^ hashes[j]).bit_count()
            if (
                distance <= NEAR_DUPLICATE_MAX_DISTANCE
                or (j in win[i] and window_match(distance, windows[i], windows[j]))
                or (j in zoom[i] and zoom_match(distance, hi, zooms[i], hashes[j], zooms[j]))
                or (j in fine[i] and fines is not None and fine_match(distance, fines[i], fines[j]))
            ):
                yield i, j


def _group(
    scored: Sequence[tuple[Path, FrameMetrics, FaceReport | None]],
    *,
    index: bool | str | None = None,
) -> list[list[tuple[Path, FrameMetrics, FaceReport | None]]]:
    """Single-linkage burst groups.

    ``index``: None (default) runs the C helper (``cull_native``) when it builds, else the Python
    candidate index from ``_INDEX_MIN_FRAMES`` frames and the all-pairs scan below that; True / False
    force the Python index / scan; ``"native"`` forces the C helper (an error when it cannot build).
    """

    ordered = sorted(scored, key=lambda row: str(row[0]))
    parent = list(range(len(ordered)))

    def find(i: int) -> int:
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    # Parse each hash once: the inner step must be a bare XOR and popcount.
    hashes = [int(row[1].dhash, 16) for row in ordered]
    crops = [tuple(int(h, 16) for h in getattr(row[1], "dhash_crops", ())) for row in ordered]
    zoom_hashes = [tuple(int(h, 16) for h in getattr(row[1], "dhash_zooms", ())) for row in ordered]
    fine_hashes = [tuple(int(h, 16) for h in getattr(row[1], "dhash_fine", ())) for row in ordered]
    links = None
    if index is None or index == "native":
        # The C index and exact checks (2026-11-18, eval/cull-grouping-native-2026-11-18.md): the same
        # pairs as both Python paths below, which stay as the reference and the fallback.
        from shootflow import cull_native

        links = cull_native.linked_pairs(hashes, crops, zoom_hashes, fine_hashes)
        if links is None and index == "native":
            raise RuntimeError("the C grouping helper is not available (no C compiler, or SHOOTFLOW_NATIVE=0)")
    if links is None:
        zooms = [zoom_index(z) for z in zoom_hashes]
        windows = [window_pack(c) for c in crops]
        fines = [fine_pack(c, f) for c, f in zip(crops, fine_hashes)]
        use_index = len(ordered) >= _INDEX_MIN_FRAMES if index is None else index
        links = (
            _linked_pairs_indexed(hashes, crops, zooms, zoom_hashes, windows, fine_hashes, fines)
            if use_index else _linked_pairs_all(hashes, crops, zooms, windows, fines)
        )
    for i, j in links:
        a, b = find(i), find(j)
        if a != b:
            parent[max(a, b)] = min(a, b)
    grouped: dict[int, list[tuple[Path, FrameMetrics, FaceReport | None]]] = {}
    for i, row in enumerate(ordered):
        grouped.setdefault(find(i), []).append(row)
    return [grouped[key] for key in sorted(grouped)]


def _label(item: CullItem) -> str:
    return item.path + (" + " + ", ".join(item.companions) if item.companions else "")


def _rel(path: Path, root: Path) -> str:
    return path.relative_to(root).as_posix()


def xmp_sidecar(item: CullItem) -> str:
    rating = _SIDECAR_RATING[item.role]
    label = {"keeper": "Green", "reject": "Red"}.get(item.role)
    label_attr = f' xmp:Label="{label}"' if label else ""
    return (
        '<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>\n'
        '<x:xmpmeta xmlns:x="adobe:ns:meta/">\n'
        ' <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">\n'
        '  <rdf:Description rdf:about="" xmlns:xmp="http://ns.adobe.com/xap/1.0/"'
        f' xmp:Rating="{rating}"{label_attr}/>\n'
        " </rdf:RDF>\n</x:xmpmeta>\n<?xpacket end=\"w\"?>\n"
    )


def write_sidecars(result: CullResult) -> CullResult:
    """Write ``photo.xmp`` beside each photo; never replace one that exists."""

    root = Path(result.folder)
    written: list[str] = []
    skipped: list[str] = []
    for item in result.items:
        sidecar = (root / item.path).with_suffix(".xmp")
        if sidecar.exists() or sidecar.is_symlink():
            skipped.append(sidecar.relative_to(root).as_posix())
            continue
        try:
            with sidecar.open("x", encoding="utf-8") as handle:
                handle.write(xmp_sidecar(item))
        except FileExistsError:
            skipped.append(sidecar.relative_to(root).as_posix())
            continue
        written.append(sidecar.relative_to(root).as_posix())
    return CullResult(result.folder, result.items, result.unreadable, tuple(written), tuple(skipped))


@dataclass(frozen=True)
class PickScore:
    """How the cull compares with a photographer's own picks."""

    picks: int
    matched: int
    unmatched: tuple[str, ...]
    groups_with_a_pick: int
    keeper_hits: int  # groups with a pick whose keeper is one of the picks
    picks_rejected: tuple[str, ...]  # the costly miss: a frame you wanted, flagged reject
    picks_kept: int  # picks the cull left as keeper or alternate
    reject_reasons: tuple[tuple[str, int], ...] = ()  # why picks were rejected: which threshold to loosen
    # Groups with a pick where the keeper is not a pick, and the keeper's margin in each
    # (None: no rival, so no margin could flag it). Checks CLOSE_CALL_MARGIN against real picks.
    keeper_miss_margins: tuple[float | None, ...] = ()

    @property
    def keeper_misses(self) -> int:
        return len(self.keeper_miss_margins)

    @property
    def misses_flagged_close(self) -> int:
        return sum(1 for m in self.keeper_miss_margins if m is not None and m < CLOSE_CALL_MARGIN)

    @property
    def margin_to_flag_all_misses(self) -> float | None:
        """Smallest threshold that would flag every miss; None if any miss had no margin."""
        if not self.keeper_miss_margins or None in self.keeper_miss_margins:
            return None
        return round(max(m for m in self.keeper_miss_margins if m is not None) + 0.0001, 4)

    @property
    def keeper_hit_rate(self) -> float | None:
        return self.keeper_hits / self.groups_with_a_pick if self.groups_with_a_pick else None

    @property
    def false_reject_rate(self) -> float | None:
        return len(self.picks_rejected) / self.matched if self.matched else None


def read_picks(path: Path | str) -> list[str]:
    """One file name or relative path per line; blank lines and ``#`` comments are ignored."""

    lines = Path(path).read_text(encoding="utf-8").splitlines()
    return [line.strip() for line in lines if line.strip() and not line.strip().startswith("#")]


def score_against_picks(result: CullResult, picks: Sequence[str]) -> PickScore:
    """Match picks to photos by relative path, else by file name or stem (case-insensitive)."""

    by_path = {i.path.lower(): i for i in result.items}
    by_name: dict[str, list[CullItem]] = {}
    for item in result.items:
        for member in (item.path, *item.companions):
            name = member.lower().rsplit("/", 1)[-1]
            by_name.setdefault(name, []).append(item)
            stem = name.rsplit(".", 1)[0]
            if item not in by_name.get(stem, []):
                by_name.setdefault(stem, []).append(item)
            by_path.setdefault(member.lower(), item)
    matched: dict[str, CullItem] = {}
    unmatched: list[str] = []
    for pick in picks:
        key = pick.replace("\\", "/").lstrip("./").lower()
        found = by_path.get(key)
        if found is None:
            candidates = by_name.get(key.rsplit("/", 1)[-1], [])
            found = candidates[0] if len(candidates) == 1 else None  # ambiguous names do not match
        if found is None:
            unmatched.append(pick)
        else:
            matched[found.path] = found
    picked_groups = {item.group for item in matched.values()}
    keepers = {i.group: i.path for i in result.items if i.role == "keeper"}
    hits = sum(1 for g in picked_groups if keepers.get(g) in matched)
    rejected = tuple(sorted(p for p, i in matched.items() if i.role == "reject"))
    reasons: dict[str, int] = {}
    for item in matched.values():
        if item.role == "reject":
            for reason in item.reasons or ("lost to a better frame",):
                reasons[reason] = reasons.get(reason, 0) + 1
    margins = {i.group: i.margin for i in result.items if i.role == "keeper"}
    miss_margins = tuple(sorted(
        (margins.get(g) for g in picked_groups if keepers.get(g) not in matched),
        key=lambda m: (m is None, m or 0.0),
    ))
    return PickScore(
        keeper_miss_margins=miss_margins,
        reject_reasons=tuple(sorted(reasons.items(), key=lambda kv: (-kv[1], kv[0]))),
        picks=len(picks), matched=len(matched), unmatched=tuple(unmatched),
        groups_with_a_pick=len(picked_groups), keeper_hits=hits, picks_rejected=rejected,
        picks_kept=len(matched) - len(rejected),
    )


def pick_score_to_dict(score: PickScore) -> dict[str, object]:
    return {
        "picks": score.picks, "matched": score.matched, "unmatched": list(score.unmatched),
        "groups_with_a_pick": score.groups_with_a_pick, "keeper_hits": score.keeper_hits,
        "keeper_hit_rate": score.keeper_hit_rate, "picks_rejected": list(score.picks_rejected),
        "false_reject_rate": score.false_reject_rate, "picks_kept": score.picks_kept,
        "reject_reasons": dict(score.reject_reasons),
        "keeper_misses": score.keeper_misses,
        "misses_flagged_close": score.misses_flagged_close,
        "keeper_miss_margins": list(score.keeper_miss_margins),
        "margin_to_flag_all_misses": score.margin_to_flag_all_misses,
    }


def result_to_dict(result: CullResult, score: PickScore | None = None) -> dict[str, object]:
    return {
        **({"against_your_picks": pick_score_to_dict(score)} if score else {}),
        "schema_version": 1,
        "folder": result.folder,
        "summary": {
            "photos": len(result.items),
            "groups": result.group_count,
            "keepers": result.count("keeper"),
            "alternates": result.count("alternate"),
            "rejects": result.count("reject"),
            "unreadable": len(result.unreadable),
            "close_calls": sum(1 for i in result.items if i.close_call),
        },
        "items": [
            {
                "path": i.path, "group": i.group, "role": i.role, "score": i.score,
                "reasons": list(i.reasons), "sharpness": i.sharpness, "exposure": i.exposure,
                "eyes_open": i.eyes_open, "dhash": i.dhash, "companions": list(i.companions),
                "margin": i.margin, "close_call": i.close_call,
            }
            for i in result.items
        ],
        "unreadable": [{"path": p, "error": e} for p, e in result.unreadable],
        "sidecars_written": list(result.sidecars_written),
        "sidecars_skipped_existing": list(result.sidecars_skipped),
        "caveat": (
            "Technical scores only (sharpness, exposure, framing, grain, tilt; closed eyes only "
            "with SHOOTFLOW_FACE_DETECTOR). Not yet checked against a photographer's real picks."
        ),
    }


def render_html(
    result: CullResult, score: PickScore | None = None, thumbs: dict[str, str] | None = None
) -> str:
    summary = result_to_dict(result)["summary"]
    assert isinstance(summary, dict)
    rows = []
    for item in result.items:
        reasons = ", ".join(item.reasons) or ("close call" if item.close_call else "")
        rows.append(
            f'<tr class="{item.role}"><td>{item.group}</td><td>{html.escape(_label(item))}</td>'
            f"<td>{item.role}</td><td>{item.score:.2f}</td><td>{item.sharpness:.2f}</td>"
            f"<td>{item.exposure:.2f}</td><td>{html.escape(reasons)}</td></tr>"
        )
    sheet = _contact_sheet(result, thumbs) if thumbs else ""
    pick_html = ""
    if score:
        rate = lambda v: "n/a" if v is None else f"{v:.0%}"  # noqa: E731
        pick_html = (
            f"<h2>Against your picks</h2><p>{score.matched} of {score.picks} picks found. "
            f"The keeper was one of your picks in {score.keeper_hits} of {score.groups_with_a_pick} groups "
            f"({rate(score.keeper_hit_rate)}). Picks flagged reject: {len(score.picks_rejected)} "
            f"({rate(score.false_reject_rate)}).</p>"
        )
        if score.keeper_misses:
            need = score.margin_to_flag_all_misses
            pick_html += (
                f"<p>Keeper missed in {score.keeper_misses} groups; {score.misses_flagged_close} of those were "
                f"flagged close calls (lead under {CLOSE_CALL_MARGIN})"
                + (f"; a margin of {need} would flag them all." if need is not None else ".")
                + "</p>"
            )
        if score.picks_rejected:
            pick_html += "<p>Rejected but picked: " + html.escape(", ".join(score.picks_rejected)) + "</p>"
        if score.unmatched:
            pick_html += "<p>Not found in the folder: " + html.escape(", ".join(score.unmatched[:50])) + "</p>"
    return (
        '<!doctype html><html lang="en"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1"><title>Cull report</title>'
        "<style>body{font:15px system-ui;margin:24px;max-width:960px}table{border-collapse:collapse;width:100%}"
        "td,th{padding:4px 8px;border-bottom:1px solid #8884;text-align:left}"
        "tr.keeper td{background:#2a82}tr.reject td{background:#d222}.burst{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 14px;padding:8px;border:1px solid #8884;border-radius:6px}figure{margin:0;width:220px;font-size:12px}figure img{display:block;width:220px;border:4px solid #8884;box-sizing:border-box}figure.keeper img{border-color:#2a8}figure.reject img{border-color:#d33}figure.alternate img{opacity:.75}</style></head><body>"
        f"<h1>Cull report</h1><p>{summary['photos']} photos in {summary['groups']} groups: "
        f"{summary['keepers']} keepers, {summary['alternates']} alternates, {summary['rejects']} rejects. "
        f"{summary['close_calls']} keeper picks are close calls (lead under {CLOSE_CALL_MARGIN}); look at those first.</p>"
        + pick_html + sheet +
        "<table><tr><th>Group</th><th>Photo</th><th>Role</th><th>Score</th><th>Sharp</th><th>Exposure</th>"
        "<th>Why rejected / note</th></tr>" + "".join(rows) + "</table>"
        "<p>Technical scores only; not checked against a photographer's real picks. "
        "Scores are computed on your machine; no photo leaves it.</p></body></html>"
    )


def _contact_sheet(result: CullResult, thumbs: dict[str, str]) -> str:
    bursts: dict[int, list[CullItem]] = {}
    for item in result.items:
        bursts.setdefault(item.group, []).append(item)
    parts = ["<h2>Contact sheet</h2><p>Green border: keeper. Red: reject. Faded: alternate.</p>"]
    for number, members in bursts.items():
        figs = []
        for item in members:
            uri = thumbs.get(item.path)
            img = f'<img src="{uri}" alt="{html.escape(item.path)}">' if uri else "<p>(no preview)</p>"
            why = f" ({html.escape(', '.join(item.reasons))})" if item.reasons else ""
            figs.append(
                f'<figure class="{item.role}">{img}<figcaption>{html.escape(item.path)}<br>'
                f"{item.role}{why}, {item.score:.2f}</figcaption></figure>"
            )
        parts.append(f'<div class="burst" title="group {number}">' + "".join(figs) + "</div>")
    return "".join(parts)


def write_report(
    result: CullResult,
    out_dir: Path | str,
    score: PickScore | None = None,
    thumbs: dict[str, str] | None = None,
) -> tuple[Path, Path]:
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    json_path, html_path = out / "cull_report.json", out / "cull_report.html"
    json_path.write_text(json.dumps(result_to_dict(result, score), indent=2, sort_keys=True) + "\n", encoding="utf-8")
    html_path.write_text(render_html(result, score, thumbs), encoding="utf-8")
    return json_path, html_path
