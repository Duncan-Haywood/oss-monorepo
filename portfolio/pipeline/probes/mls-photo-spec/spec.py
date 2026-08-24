"""Dated floor spec this probe checks listing photos against.

This is not a board rulebook. It is the subset of
``process/mls-compliance.ts`` that can be decided from a file header and a
filename, plus the common portal size/format floor that enhancement already
targets (``enhance.ts`` long-edge cap 2048). Board-specific extras and any
pixel-level branding check are out of this file on purpose.
"""

from __future__ import annotations

SPEC_ID = "listing-lens-floor-2026-08-24"
SPEC_DATE = "2026-08-24"

# Common portal floor. A 1024 short edge is the number enhance.ts's own
# comment ("MLS platforms commonly cap around 2048-3000px") sits above;
# we fail *below* 1024 on the long edge, not above the cap.
MIN_LONG_EDGE_PX = 1024
MAX_BYTES = 20 * 1024 * 1024
ALLOWED_FORMATS = frozenset({"jpeg", "png"})

# Width/height ratios accepted as "standard listing crop." Tolerance is
# relative, so 1024x768 (4:3) and 1200x800 (3:2) both pass.
ASPECT_RATIOS = ((4, 3), (3, 2), (16, 9), (5, 4), (1, 1))
ASPECT_TOLERANCE = 0.04

# Filename tokens that mean the file is marketing collateral, not an
# MLS-bound photo. Conservative: a false flag is a rename.
BRANDING_FILENAME_TOKENS = (
    "logo",
    "watermark",
    "branded",
    "brokerage",
    "headshot",
)

# A virtually staged derivative must keep the unaltered original beside it.
STAGING_TOKENS = ("staged", "virtually-staged", "virtual-staged")

COVERAGE = {
    "long_edge": "automated",
    "byte_size": "automated",
    "format": "automated",
    "aspect": "automated",
    "branding_filename": "automated",
    "staging_pair": "automated",
    "visual_watermark": "unimplemented",
    "burned_in_contact": "unimplemented",
    "board_specific": "unimplemented",
}
