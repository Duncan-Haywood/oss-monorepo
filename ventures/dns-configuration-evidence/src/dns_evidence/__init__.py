"""Portable, resolver-aware DNS evidence records."""

from .capture import capture_snapshot, load_plan, query_resolver
from .report import build_report, load_snapshot

__all__ = ["build_report", "capture_snapshot", "load_plan", "load_snapshot", "query_resolver"]
