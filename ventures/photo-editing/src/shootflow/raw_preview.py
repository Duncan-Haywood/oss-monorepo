"""Pull the embedded full-size JPEG preview out of a camera RAW file.

Almost every RAW container (Canon CR2/CR3, Nikon NEF, Sony ARW, Adobe DNG,
Olympus ORF, Fuji RAF, Panasonic RW2) carries a camera-rendered JPEG next to
the sensor data. Reading that preview lets ``frame_analysis`` score RAW stills
from real pixels without a RAW developer. The preview is the camera's own
rendering, so sharpness, exposure and framing are right; it is not the
developed master and is never used as one.

No parsing of any maker format: the file is scanned for JPEG start markers and
each candidate is walked segment by segment to find where it really ends, then
the candidate with the most pixels wins. Thumbnails lose to the preview.
"""

from __future__ import annotations

import mmap
import struct
from pathlib import Path

RAW_EXTENSIONS = frozenset({".arw", ".cr2", ".cr3", ".dng", ".nef", ".orf", ".raf", ".rw2"})
MIN_PREVIEW_PIXELS = 160 * 120
_SOI = b"\xff\xd8\xff"
_SOF = frozenset(set(range(0xC0, 0xD0)) - {0xC4, 0xC8, 0xCC})


def is_raw_path(path: Path) -> bool:
    return path.suffix.lower() in RAW_EXTENSIONS


def extract_preview(path: Path) -> bytes | None:
    """Return the largest embedded JPEG in ``path``, or None if there is none."""

    try:
        with path.open("rb") as handle:
            if path.stat().st_size == 0:
                return None
            with mmap.mmap(handle.fileno(), 0, access=mmap.ACCESS_READ) as data:
                return _largest_jpeg(data)
    except (OSError, ValueError):
        return None


def _largest_jpeg(data: "mmap.mmap | bytes") -> bytes | None:
    best: tuple[int, int, int] | None = None  # (pixels, start, end)
    position = data.find(_SOI)
    while position != -1:
        parsed = _walk_jpeg(data, position)
        if parsed is not None:
            pixels, end = parsed
            if pixels >= MIN_PREVIEW_PIXELS and (best is None or pixels > best[0]):
                best = (pixels, position, end)
            position = data.find(_SOI, end)
        else:
            position = data.find(_SOI, position + 3)
    if best is None:
        return None
    return bytes(data[best[1] : best[2]])


def _walk_jpeg(data: "mmap.mmap | bytes", start: int) -> tuple[int, int] | None:
    """Return ``(pixels, end_offset)`` for a well-formed JPEG at ``start``."""

    size = len(data)
    pos = start + 2
    pixels = 0
    while pos + 4 <= size:
        if data[pos] != 0xFF:
            return None
        marker = data[pos + 1]
        if marker == 0xFF:  # fill byte
            pos += 1
            continue
        if marker == 0xDA:  # start of scan: entropy-coded data until EOI
            if not pixels:
                return None
            (length,) = struct.unpack(">H", data[pos + 2 : pos + 4])
            pos += 2 + length
            while True:
                pos = data.find(b"\xff", pos)
                if pos == -1 or pos + 2 > size:
                    return None
                following = data[pos + 1]
                if following == 0xD9:
                    return pixels, pos + 2
                if following == 0x00 or 0xD0 <= following <= 0xD7 or following == 0xFF:
                    pos += 2 if following != 0xFF else 1
                    continue
                break  # another table/scan segment (progressive): resume the walk
            continue
        if marker == 0xD9:
            return (pixels, pos + 2) if pixels else None
        (length,) = struct.unpack(">H", data[pos + 2 : pos + 4])
        if length < 2 or pos + 2 + length > size:
            return None
        if marker in _SOF and length >= 8:
            height, width = struct.unpack(">HH", data[pos + 5 : pos + 9])
            pixels = width * height
        pos += 2 + length
    return None
