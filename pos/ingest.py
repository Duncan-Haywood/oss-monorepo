"""POS ingest stub — normalize sales into SaleEvent and persist."""

from __future__ import annotations

import argparse
import json
import uuid
from datetime import datetime, timezone
from pathlib import Path


def sample_sale_event(store_id: str) -> dict:
    now = datetime.now(timezone.utc).isoformat()
    return {
        "event_id": str(uuid.uuid4()),
        "store_id": store_id,
        "basket_id": f"B-{uuid.uuid4().hex[:8]}",
        "closed_at": now,
        "currency": "EUR",
        "line_items": [
            {
                "sku": "LEATHER-BAG-01",
                "quantity": 1,
                "unit_price_cents": 28500,
                "description": "Hand-stitched shoulder bag",
            }
        ],
        "total_cents": 28500,
        "payment_class": "card",
        "pos_vendor": "stub",
        "raw_reference": "RCP-0001",
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="POS ingest (stub)")
    parser.add_argument("--store-id", default="pilot-leather-01")
    parser.add_argument(
        "--out-dir",
        type=Path,
        default=Path("data/pos/inbox"),
    )
    parser.add_argument("--sample", action="store_true")
    args = parser.parse_args()

    if args.sample:
        args.out_dir.mkdir(parents=True, exist_ok=True)
        event = sample_sale_event(args.store_id)
        path = args.out_dir / f"sale_{event['event_id']}.json"
        path.write_text(json.dumps(event, indent=2), encoding="utf-8")
        print(f"Wrote sample sale: {path}")
    else:
        print("POS ingest: drop CSV in data/pos/inbox or use --sample.")


if __name__ == "__main__":
    main()
