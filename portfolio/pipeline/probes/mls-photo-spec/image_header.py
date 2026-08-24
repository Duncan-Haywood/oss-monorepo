"""Read width, height, format, and byte size from a JPEG or PNG header."""

from __future__ import annotations

import struct
from pathlib import Path
from typing import NamedTuple


class ImageInfo(NamedTuple):
    path: Path
    format: str | None
    width: int | None
    height: int | None
    nbytes: int
    unreadable: str | None


def read_header(path: Path) -> ImageInfo:
    data = path.read_bytes()
    nbytes = len(data)
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        if len(data) < 24:
            return ImageInfo(path, "png", None, None, nbytes, "png-header-truncated")
        width, height = struct.unpack(">II", data[16:24])
        return ImageInfo(path, "png", width, height, nbytes, None)
    if data.startswith(b"\xff\xd8"):
        parsed = _jpeg_size(data)
        if parsed is None:
            return ImageInfo(path, "jpeg", None, None, nbytes, "jpeg-sof-missing")
        width, height = parsed
        return ImageInfo(path, "jpeg", width, height, nbytes, None)
    return ImageInfo(path, None, None, None, nbytes, "unrecognised-magic")


def _jpeg_size(data: bytes) -> tuple[int, int] | None:
    i = 2
    end = len(data)
    while i + 4 <= end:
        if data[i] != 0xFF:
            return None
        marker = data[i + 1]
        if marker in {0xD8, 0xD9}:
            i += 2
            continue
        if marker == 0xDA:
            return None
        seglen = struct.unpack(">H", data[i + 2 : i + 4])[0]
        if marker in {0xC0, 0xC1, 0xC2} and seglen >= 8 and i + 4 + 5 <= end:
            height, width = struct.unpack(">HH", data[i + 5 : i + 9])
            return width, height
        i += 2 + seglen
    return None
