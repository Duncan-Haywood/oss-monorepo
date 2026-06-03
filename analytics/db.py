"""SQLite persistence for pilot aggregates and sales."""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path

DEFAULT_DB = Path("data/pilot.db")

SCHEMA = """
CREATE TABLE IF NOT EXISTS aggregate_events (
    event_id TEXT PRIMARY KEY,
    store_id TEXT NOT NULL,
    source TEXT NOT NULL,
    metric TEXT NOT NULL,
    zone_id TEXT,
    sku TEXT,
    bucket_start TEXT NOT NULL,
    bucket_end TEXT NOT NULL,
    value REAL NOT NULL,
    unit TEXT DEFAULT 'count',
    payload JSON NOT NULL
);

CREATE TABLE IF NOT EXISTS sale_events (
    event_id TEXT PRIMARY KEY,
    store_id TEXT NOT NULL,
    basket_id TEXT NOT NULL,
    closed_at TEXT NOT NULL,
    currency TEXT NOT NULL,
    total_cents INTEGER,
    payment_class TEXT,
    payload JSON NOT NULL
);
"""


def connect(db_path: Path = DEFAULT_DB) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def init_db(db_path: Path = DEFAULT_DB) -> None:
    with connect(db_path) as conn:
        conn.executescript(SCHEMA)
        conn.commit()


def insert_aggregate(conn: sqlite3.Connection, event: dict) -> None:
    conn.execute(
        """
        INSERT OR REPLACE INTO aggregate_events
        (event_id, store_id, source, metric, zone_id, sku,
         bucket_start, bucket_end, value, unit, payload)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            event["event_id"],
            event["store_id"],
            event["source"],
            event["metric"],
            event.get("zone_id"),
            event.get("sku"),
            event["bucket_start"],
            event["bucket_end"],
            event["value"],
            event.get("unit", "count"),
            json.dumps(event),
        ),
    )


def insert_sale(conn: sqlite3.Connection, event: dict) -> None:
    conn.execute(
        """
        INSERT OR REPLACE INTO sale_events
        (event_id, store_id, basket_id, closed_at, currency,
         total_cents, payment_class, payload)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            event["event_id"],
            event["store_id"],
            event["basket_id"],
            event["closed_at"],
            event["currency"],
            event.get("total_cents"),
            event.get("payment_class"),
            json.dumps(event),
        ),
    )


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=["init"])
    parser.add_argument("--db", type=Path, default=DEFAULT_DB)
    args = parser.parse_args()
    if args.command == "init":
        init_db(args.db)
        print(f"Initialized {args.db}")


if __name__ == "__main__":
    main()
