"""Evidence, not warranties, for whether a scheduled backup actually worked."""

from .report import build_history_report, build_trend, classify_run

__all__ = ["build_history_report", "build_trend", "classify_run"]
