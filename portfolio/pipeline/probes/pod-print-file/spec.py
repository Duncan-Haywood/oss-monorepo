"""Dated floor spec this probe checks print files against.

This is not a print-lab rulebook. It is the subset of common POD upload
floors that can be decided from a file header and a filename (named
print size versus pixel count). Lab-specific extras, colour-managed
proofing, and bleed-margin vision are out of this file on purpose.
"""

from __future__ import annotations

SPEC_ID = "print-atelier-floor-2026-08-24"
SPEC_DATE = "2026-08-24"

# 150 DPI is the public floor several POD labs publish for a "standard"
# print. 300 DPI is the number they recommend. We fail *below* 150 on the
# implied DPI when a size token is present, and we apply a 1500px short-edge
# floor (~10" at 150 DPI) when the filename names no size.
MIN_IMPLIED_DPI = 150
PIXEL_FLOOR_SHORT_EDGE = 1500
MAX_BYTES = 50 * 1024 * 1024
ALLOWED_FORMATS = frozenset({"jpeg", "png"})
ASPECT_TOLERANCE = 0.04

# Filename tokens that mean the file is a web export, not a print master.
# Conservative: a false flag is a rename.
WEB_FILENAME_TOKENS = (
    "web",
    "thumbnail",
    "lowres",
    "instagram",
    "facebook",
)

# Named print sizes in inches. Portrait or landscape of the same pair.
PRINT_SIZES_IN = {
    "5x7": (5, 7),
    "8x10": (8, 10),
    "11x14": (11, 14),
    "12x16": (12, 16),
    "16x20": (16, 20),
    "18x24": (18, 24),
    "24x36": (24, 36),
}

COVERAGE = {
    "format": "automated",
    "byte_size": "automated",
    "implied_dpi": "automated",
    "pixel_floor": "automated",
    "web_filename": "automated",
    "named_aspect": "automated",
    "bleed_margin": "unimplemented",
    "cmyk_icc": "unimplemented",
    "pdf_fonts": "unimplemented",
    "lab_specific": "unimplemented",
}
