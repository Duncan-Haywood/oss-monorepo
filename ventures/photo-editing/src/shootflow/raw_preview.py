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

Only 8-bit lossy JPEGs count as pictures. CR2 stores the sensor data itself as
a lossless JPEG (SOF3, 12 to 14 bit, two or four interleaved Bayer components)
and DNG usually stores it as lossless JPEG tiles or strips. Those are real JPEG
streams, often with more "pixels" than the preview, and ffmpeg decodes them, so
counting them would score a Bayer mosaic as the photo (found 2026-11-10 with a
real ffmpeg ``ljpeg`` stream beside a baseline preview; tests/test_raw_preview.py).
"""

from __future__ import annotations

import mmap
import struct
from pathlib import Path

# Every raw format a card holds (``ingest.RAW_PHOTO_EXTENSIONS``, kept equal by a test):
# cull reads each one's embedded preview. Only the formats below with a reader develop.
RAW_EXTENSIONS = frozenset(
    {".3fr", ".arw", ".cr2", ".cr3", ".crw", ".dcr", ".dng", ".erf", ".fff", ".gpr", ".iiq", ".kdc", ".mef", ".mos",
     ".mrw", ".nef", ".nrw", ".orf", ".pef", ".raf", ".raw", ".rw2", ".rwl", ".sr2", ".srf", ".srw", ".x3f"}
)
MIN_PREVIEW_PIXELS = 160 * 120
_SOI = b"\xff\xd8\xff"
_SOF = frozenset(set(range(0xC0, 0xD0)) - {0xC4, 0xC8, 0xCC})
# Baseline, extended, progressive (Huffman or arithmetic): the frame types a
# camera writes for a picture meant to be shown. Lossless (C3, C7, CB, CF) and
# hierarchical (C5-C7, CD-CF) frames are sensor data or exotic, never previews.
_PICTURE_SOF = frozenset({0xC0, 0xC1, 0xC2, 0xC9, 0xCA})
_PICTURE_PRECISION = 8


def is_raw_path(path: Path) -> bool:
    return path.suffix.lower() in RAW_EXTENSIONS


def is_dng_path(path: Path) -> bool:
    """True for a .dng file, the one RAW format ``raw_develop`` renders."""

    return path.suffix.lower() == ".dng"


def is_cr2_path(path: Path) -> bool:
    return path.suffix.lower() == ".cr2"


def is_cr3_path(path: Path) -> bool:
    return path.suffix.lower() == ".cr3"


def is_crw_path(path: Path) -> bool:
    """Canon's CIFF raw (EOS D30, D60, 10D, 300D; PowerShot G2 to G6, Pro1, S30 to S70)."""

    return path.suffix.lower() == ".crw"


def is_arw_path(path: Path) -> bool:
    return path.suffix.lower() == ".arw"


def is_nef_path(path: Path) -> bool:
    """Nikon NEF, and the Coolpix NRW (the same TIFF layout under another name)."""

    return path.suffix.lower() in (".nef", ".nrw")


def is_orf_path(path: Path) -> bool:
    return path.suffix.lower() == ".orf"


def is_rw2_path(path: Path) -> bool:
    """Panasonic RW2, and Leica's RWL: the D-LUX, V-LUX and C-LUX are Lumix bodies and
    write the same file (two real RWLs read sensel for sensel as LibRaw does,
    eval/leica-rwl-and-card-formats-2026-11-16.md)."""

    return path.suffix.lower() in (".rw2", ".rwl")


def is_srw_path(path: Path) -> bool:
    return path.suffix.lower() == ".srw"


def is_pef_path(path: Path) -> bool:
    return path.suffix.lower() == ".pef"


def is_raf_path(path: Path) -> bool:
    return path.suffix.lower() == ".raf"


def is_mrw_path(path: Path) -> bool:
    """Minolta and Konica Minolta MRW (DiMAGE 7, 7i, 7Hi, A1, A2, A200; Dynax / Maxxum / Alpha-7 Digital)."""

    return path.suffix.lower() == ".mrw"


def is_dcr_path(path: Path) -> bool:
    """Kodak DCR (DCS Pro SLR/n, SLR/c, Pro 14n and 14nx; Kodak compression 65000)."""

    return path.suffix.lower() == ".dcr"


def is_3fr_path(path: Path) -> bool:
    """Hasselblad 3FR (H3D, H4D, X1D, X1D II, X2D, CF and CFV backs) and Phocus's ``.fff`` export of one. Both
    carry their own colour matrix (or ``hasselblad.OWN_MATRICES`` holds the body's), so like a DNG they develop
    without a camera profile. An Imacon/FlexColor scanner ``.fff`` (RGB, no CFA image) is refused by the
    reader with the reason."""

    return path.suffix.lower() in (".3fr", ".fff")


def is_iiq_path(path: Path) -> bool:
    """Phase One IIQ (P+ and IQ backs, the H 25, iXU and iXM bodies). It carries its own colour matrix, so it
    develops without a camera profile, like a DNG; a ``.dcp`` given for it is used (``camera_profiles``)."""

    return path.suffix.lower() == ".iiq"


def needs_profile_path(path: Path) -> bool:
    """True for the RAW formats that carry no colour matrix and develop with a camera profile (CRW, CR2, CR3, ARW, NEF, ORF, RW2, SRW, PEF, RAF, MRW, DCR)."""

    return is_crw_path(path) or is_cr2_path(path) or is_cr3_path(path) or is_arw_path(path) or is_nef_path(path) or is_orf_path(path) or is_rw2_path(path) or is_srw_path(path) or is_pef_path(path) or is_raf_path(path) or is_mrw_path(path) or is_dcr_path(path)


def is_developable_path(path: Path) -> bool:
    """True for the RAW formats ``raw_develop`` reads from sensor data: DNG, and
    Hasselblad 3FR and Phase One IIQ (their own colour matrices), and Canon CRW, CR2 and CR3, Sony ARW, Nikon NEF, Olympus ORF, Panasonic RW2, Samsung SRW, Pentax PEF, Fujifilm RAF, Minolta MRW and Kodak DCR given a camera profile (``camera_profiles``)."""

    return is_dng_path(path) or is_3fr_path(path) or is_iiq_path(path) or needs_profile_path(path)


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
            if marker not in _PICTURE_SOF or data[pos + 4] != _PICTURE_PRECISION:
                return None  # lossless or high-precision: sensor data, not a preview
            height, width = struct.unpack(">HH", data[pos + 5 : pos + 9])
            pixels = width * height
        pos += 2 + length
    return None
