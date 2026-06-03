"""
Edge ingest stub — door line-crossing and aggregate emission.

Production: attach to RTSP, run detector, write AggregateEvent to local DB.
Pilot default: no raw frame storage.
"""

from __future__ import annotations

import argparse
import json
import uuid
from datetime import datetime, timezone
from pathlib import Path


def emit_sample_aggregate(store_id: str, out_dir: Path) -> Path:
    """Write one sample aggregate for integration testing."""
    out_dir.mkdir(parents=True, exist_ok=True)
    now = datetime.now(timezone.utc)
    event = {
        "event_id": str(uuid.uuid4()),
        "store_id": store_id,
        "source": "door_cv",
        "metric": "entry",
        "zone_id": "door_main",
        "bucket_start": now.replace(minute=0, second=0, microsecond=0).isoformat(),
        "bucket_end": now.isoformat(),
        "value": 1,
        "unit": "count",
        "metadata": {"model": "stub", "version": "0.1.0"},
    }
    path = out_dir / f"aggregate_{event['event_id']}.json"
    path.write_text(json.dumps(event, indent=2), encoding="utf-8")
    return path


def main() -> None:
    parser = argparse.ArgumentParser(description="Edge ingest (stub)")
    parser.add_argument("--store-id", default="pilot-leather-01")
    parser.add_argument(
        "--out-dir",
        type=Path,
        default=Path("data/aggregates/outbox"),
    )
    parser.add_argument(
        "--sample",
        action="store_true",
        help="Emit one sample AggregateEvent JSON file",
    )
    args = parser.parse_args()
    if args.sample:
        path = emit_sample_aggregate(args.store_id, args.out_dir)
        print(f"Wrote sample aggregate: {path}")
    else:
        print("Edge ingest not yet connected to RTSP. Use --sample for a test event.")


if __name__ == "__main__":
    main()
