"""Write the tiny synthetic fixture photos the accuracy corpus names."""

from __future__ import annotations

import struct
import zlib
from pathlib import Path


def png_bytes(width: int, height: int, rgb: tuple[int, int, int] = (80, 80, 80)) -> bytes:
    def chunk(tag: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    raw = b"".join(b"\x00" + bytes(rgb) * width for _ in range(height))
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )


def jpeg_bytes(width: int, height: int) -> bytes:
    jfif = b"JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00"
    sof = struct.pack(">BHHB", 8, height, width, 3) + b"\x01\x11\x00\x02\x11\x00\x03\x11\x00"
    return (
        b"\xff\xd8"
        + b"\xff\xe0"
        + struct.pack(">H", len(jfif) + 2)
        + jfif
        + b"\xff\xc0"
        + struct.pack(">H", len(sof) + 2)
        + sof
        + b"\xff\xd9"
    )


def write(folder: Path) -> None:
    folder.mkdir(parents=True, exist_ok=True)
    (folder / "living-1024x768.png").write_bytes(png_bytes(1024, 768))
    (folder / "kitchen-1200x800.jpg").write_bytes(jpeg_bytes(1200, 800))
    (folder / "too-small-64x48.png").write_bytes(png_bytes(64, 48))
    (folder / "wide-banner-1600x400.png").write_bytes(png_bytes(1600, 400))
    (folder / "agent-logo-1200x800.png").write_bytes(png_bytes(1200, 800))
    (folder / "living-staged.png").write_bytes(png_bytes(1024, 768))
    (folder / "notes.txt").write_text("not a photo\n", encoding="utf-8")


if __name__ == "__main__":
    write(Path(__file__).resolve().parent / "fixtures")
