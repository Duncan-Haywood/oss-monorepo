"""Error taxonomy and classification for Apple Photos imports."""

from __future__ import annotations

import re
from dataclasses import dataclass
from enum import Enum


class ErrorCategory(str, Enum):
    TRANSIENT = "transient"
    PERMANENT = "permanent"
    UNKNOWN = "unknown"


class ErrorAction(str, Enum):
    RETRY_BACKOFF = "retry_backoff"
    RETRY_SPLIT_BATCH = "retry_split_batch"
    SKIP_ALREADY_IMPORTED = "skip_already_imported"
    SKIP_PERMANENT = "skip_permanent"
    RELAUNCH_PHOTOS = "relaunch_photos"
    RUN_PREFLIGHT = "run_preflight"
    PAUSE_CIRCUIT_BREAKER = "pause_circuit_breaker"


@dataclass(frozen=True)
class ClassifiedError:
    category: ErrorCategory
    action: ErrorAction
    code: str
    message: str


_TRANSIENT_PATTERNS: list[tuple[str, str, ErrorAction]] = [
    # This pattern must stay ahead of the generic "timed out|timeout" entry
    # below: "duplicate preflight timed out" itself contains "timed out", so
    # placed after it, it would be permanently unreachable -- every message
    # this pattern is meant to catch matches the generic one first and is
    # misclassified as a plain photos_timeout/RETRY_BACKOFF instead of
    # triggering RUN_PREFLIGHT. re.search checks patterns in list order and
    # returns on the first match, so specificity has to be encoded as order.
    (r"duplicate preflight timed out", "preflight_timeout", ErrorAction.RUN_PREFLIGHT),
    (r"timed out|timeout", "photos_timeout", ErrorAction.RETRY_BACKOFF),
    (r"photos.*not responding|application.*not running|connection is invalid", "photos_unresponsive", ErrorAction.RELAUNCH_PHOTOS),
    (r"osascript.*error|-1712|-1728", "osascript_busy", ErrorAction.RETRY_BACKOFF),
    (r"file.*(busy|locked)|resource busy", "file_busy", ErrorAction.RETRY_BACKOFF),
    (r"no such file|does not exist|can't get", "icloud_unavailable", ErrorAction.RETRY_BACKOFF),
]

_PERMANENT_PATTERNS: list[tuple[str, str, ErrorAction]] = [
    (r"permission denied|operation not permitted|not authorized", "permission_denied", ErrorAction.SKIP_PERMANENT),
    (r"damaged|corrupt|invalid image|not a valid", "file_corrupt", ErrorAction.SKIP_PERMANENT),
    (r"file missing after.*retries|permanently unavailable", "file_missing", ErrorAction.SKIP_PERMANENT),
]


def classify_error(message: str) -> ClassifiedError:
    normalized = message.strip().lower()
    for pattern, code, action in _TRANSIENT_PATTERNS:
        if re.search(pattern, normalized):
            return ClassifiedError(ErrorCategory.TRANSIENT, action, code, message)
    for pattern, code, action in _PERMANENT_PATTERNS:
        if re.search(pattern, normalized):
            return ClassifiedError(ErrorCategory.PERMANENT, action, code, message)
    return ClassifiedError(ErrorCategory.UNKNOWN, ErrorAction.RETRY_BACKOFF, "unknown", message)


def split_batch(paths: list) -> tuple[list, list]:
    if len(paths) <= 1:
        return paths, []
    mid = len(paths) // 2
    return paths[:mid], paths[mid:]


def is_retryable_status(status: str, attempts: int, max_attempts: int) -> bool:
    if status == "pending":
        return True
    if status == "uncertain":
        return True
    if status == "failed" and attempts < max_attempts:
        return True
    return False
