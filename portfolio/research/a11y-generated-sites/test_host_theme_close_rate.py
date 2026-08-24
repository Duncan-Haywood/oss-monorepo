"""Shim: the host-theme close-rate job lives in the venture.

This directory already owns the committed corpus and the CI that watches
it. The product-line job in
``ventures/local-site-studio/scripts/eaa-evidence-job`` is what a
session should run; this file only makes sure a corpus or probe change
still fails here if that measurement drifts.
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

JOB = (
    Path(__file__).resolve().parents[3]
    / "ventures"
    / "local-site-studio"
    / "scripts"
    / "eaa-evidence-job"
)
if str(JOB) not in sys.path:
    sys.path.insert(0, str(JOB))

from test_close_rate import (  # noqa: E402
    CommittedResults,
    MutatedCloseRate,
    UnmodifiedPages,
)

# Re-export so `unittest discover` here runs the venture's suite.
__all__ = ["UnmodifiedPages", "MutatedCloseRate", "CommittedResults"]


if __name__ == "__main__":
    unittest.main()
