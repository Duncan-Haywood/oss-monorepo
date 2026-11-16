"""argparse types shared by platform/ci scripts.

`float()` accepts "nan" and "inf", and a NaN threshold compares False both
ways, so it silently switches a check off (check_finite_thresholds.py).
"""
import argparse
import math


def finite_nonneg(text):
    """A finite number >= 0, for --max-*/--min-* threshold flags."""
    try:
        value = float(text)
    except ValueError:
        raise argparse.ArgumentTypeError(f"not a number: {text!r}") from None
    if not math.isfinite(value) or value < 0:
        raise argparse.ArgumentTypeError(f"must be a finite number >= 0, got {text!r}")
    return value
