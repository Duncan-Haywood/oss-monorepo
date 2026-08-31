"""Privacy-conscious, local-only usage logging.

Nothing here phones home. Events are appended to a JSONL file inside the
customer's own data directory so the portfolio can learn what a *consenting,
inspecting* user's own installation actually does, without collecting vendor
names, URLs, or page content in the log and without any network call. Set
VENDOR_WATCH_NO_TELEMETRY=1 to disable entirely.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

EVENTS_FILENAME = "usage-events.jsonl"
DISABLE_ENV_VAR = "VENDOR_WATCH_NO_TELEMETRY"

# Event names only -- never a vendor name, URL, page section, or diff.
ALLOWED_EVENTS = {
    "watch_added",
    "watch_removed",
    "check_run",
    "change_detected",
    "no_change_detected",
    "check_inconclusive",
}


def is_enabled() -> bool:
    return os.environ.get(DISABLE_ENV_VAR, "") not in ("1", "true", "True")


def record_event(data_dir: Path, event: str, timestamp: str, count: int = 1) -> None:
    if not is_enabled():
        return
    if event not in ALLOWED_EVENTS:
        raise ValueError(f"unknown event: {event}")
    data_dir.mkdir(parents=True, exist_ok=True)
    path = data_dir / EVENTS_FILENAME
    record: dict[str, Any] = {"event": event, "at": timestamp, "count": count}
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(record, sort_keys=True) + "\n")


def summarize(data_dir: Path) -> dict[str, int]:
    path = data_dir / EVENTS_FILENAME
    totals: dict[str, int] = {}
    if not path.exists():
        return totals
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        record = json.loads(line)
        totals[record["event"]] = totals.get(record["event"], 0) + record.get("count", 1)
    return totals
