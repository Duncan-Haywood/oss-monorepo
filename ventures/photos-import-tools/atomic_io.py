#!/usr/bin/env python3
"""Atomic JSON writes for the observability records this tooling emits."""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any


def write_json_atomic(path: Path, payload: Any, *, sort_keys: bool = False) -> None:
    """Write ``payload`` as pretty JSON to ``path`` without a torn-write window.

    The whole document is serialized in memory first, so a serialization
    error never truncates an existing record. The bytes then land in a sibling
    temp file and are moved into place with ``os.replace``, which is atomic on
    a single filesystem. A reader (the watchdog polls ``status.json`` while the
    importer rewrites it) or a crash mid-write therefore sees either the
    previous complete file or the new one -- never a half-written JSON that
    ``json.loads`` would reject and the watchdog would read as an empty status.
    """
    text = json.dumps(payload, indent=2, sort_keys=sort_keys) + "\n"
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f"{path.name}.{os.getpid()}.tmp")
    try:
        tmp.write_text(text, encoding="utf-8")
        os.replace(tmp, path)
    finally:
        tmp.unlink(missing_ok=True)
