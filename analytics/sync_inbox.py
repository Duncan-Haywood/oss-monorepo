"""Load JSON events from edge/pos outbox directories into SQLite."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from analytics.db import DEFAULT_DB, connect, init_db, insert_aggregate, insert_sale


def sync_directory(conn, directory: Path, kind: str) -> int:
    count = 0
    if not directory.exists():
        return 0
    for path in sorted(directory.glob("*.json")):
        event = json.loads(path.read_text(encoding="utf-8"))
        if kind == "aggregate":
            insert_aggregate(conn, event)
        else:
            insert_sale(conn, event)
        count += 1
    return count


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--db", type=Path, default=DEFAULT_DB)
    parser.add_argument(
        "--aggregates",
        type=Path,
        default=Path("data/aggregates/outbox"),
    )
    parser.add_argument("--sales", type=Path, default=Path("data/pos/inbox"))
    args = parser.parse_args()

    init_db(args.db)
    with connect(args.db) as conn:
        n_agg = sync_directory(conn, args.aggregates, "aggregate")
        n_sale = sync_directory(conn, args.sales, "sale")
        conn.commit()
    print(f"Synced {n_agg} aggregates, {n_sale} sales into {args.db}")


if __name__ == "__main__":
    main()
