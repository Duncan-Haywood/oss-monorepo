"""Simple daily funnel report from SQLite."""

from __future__ import annotations

import argparse
from datetime import date
from pathlib import Path

from analytics.db import DEFAULT_DB, connect


def daily_summary(db_path: Path, day: str) -> dict:
    with connect(db_path) as conn:
        entries = conn.execute(
            """
            SELECT COALESCE(SUM(value), 0) FROM aggregate_events
            WHERE metric = 'entry' AND date(bucket_start) = ?
            """,
            (day,),
        ).fetchone()[0]
        bounces = conn.execute(
            """
            SELECT COALESCE(SUM(value), 0) FROM aggregate_events
            WHERE metric = 'bounce' AND date(bucket_start) = ?
            """,
            (day,),
        ).fetchone()[0]
        sales = conn.execute(
            """
            SELECT COUNT(*) FROM sale_events
            WHERE date(closed_at) = ?
            """,
            (day,),
        ).fetchone()[0]
    conversion = (sales / entries) if entries else 0.0
    return {
        "date": day,
        "entries": entries,
        "bounces": bounces,
        "purchases": sales,
        "conversion_rate": round(conversion, 4),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--db", type=Path, default=DEFAULT_DB)
    parser.add_argument("--date", default="today")
    args = parser.parse_args()
    day = date.today().isoformat() if args.date == "today" else args.date
    summary = daily_summary(args.db, day)
    print("Daily funnel summary")
    for k, v in summary.items():
        print(f"  {k}: {v}")


if __name__ == "__main__":
    main()
