#!/usr/bin/env python3
"""Resumable Apple Photos importer for organized JPEGs and RAW files.

Keeps a SQLite manifest as the durable source of truth. Supports batch import,
intelligent error recovery, Photos health checks, and bulk duplicate preflight.
"""

from __future__ import annotations

import argparse
import json
import logging
import random
import shutil
import signal
import sqlite3
import subprocess
import sys
import time
from collections.abc import Mapping
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Iterable, TypedDict

from atomic_io import write_json_atomic
from photos_import_errors import (
    ClassifiedError,
    ErrorAction,
    ErrorCategory,
    classify_error,
    split_batch,
)

JPG_SUFFIXES = {".jpg", ".jpeg"}
RAW_SUFFIXES = {
    ".arw",
    ".cr2",
    ".cr3",
    ".dng",
    ".nef",
    ".raf",
    ".orf",
    ".rw2",
    ".pef",
    ".srw",
    ".3fr",
    ".iiq",
    ".rwl",
    ".raw",
}
MEDIA_SUFFIXES = {
    "jpeg": JPG_SUFFIXES,
    "raw": RAW_SUFFIXES,
}
IMPORTABLE_SUFFIXES = JPG_SUFFIXES | RAW_SUFFIXES
DEFAULT_PHOTOS_DB = Path.home() / "Pictures/Photos Library.photoslibrary/database/Photos.sqlite"
MAX_TRANSIENT_ATTEMPTS = 8
ICLOUD_WAIT_ATTEMPTS = 6
CIRCUIT_BREAKER_THRESHOLD = 12
PHOTOS_RELAUNCH_THRESHOLD = 5


class PhotosImportError(RuntimeError):
    def __init__(self, message: str, *, classified: ClassifiedError | None = None) -> None:
        super().__init__(message)
        self.classified = classified or classify_error(message)


@dataclass(frozen=True)
class ImportItem:
    path: Path
    status: str
    attempts: int
    last_error: str | None


@dataclass
class RuntimeStats:
    started_at: float = field(default_factory=time.monotonic)
    consecutive_failures: int = 0
    total_errors: int = 0
    last_success_at: float = field(default_factory=time.monotonic)
    last_error: str | None = None
    last_error_category: str | None = None
    current_batch_size: int = 10
    current_strategy: str = "batch"
    batches_completed: int = 0
    photos_relaunches: int = 0
    preflight_runs: int = 0


class ImportState:
    def __init__(self, db_path: Path) -> None:
        self.db_path = db_path
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self.connection = sqlite3.connect(self.db_path)
        self.connection.row_factory = sqlite3.Row
        self._create_schema()

    def _create_schema(self) -> None:
        self.connection.execute(
            """
            CREATE TABLE IF NOT EXISTS imports (
                path TEXT PRIMARY KEY,
                status TEXT NOT NULL,
                attempts INTEGER NOT NULL DEFAULT 0,
                last_error TEXT,
                first_seen_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        self.connection.commit()

    def close(self) -> None:
        self.connection.close()

    def upsert(self, path: Path, status: str) -> None:
        now = iso_now()
        self.connection.execute(
            """
            INSERT INTO imports (path, status, attempts, last_error, first_seen_at, updated_at)
            VALUES (?, ?, 0, NULL, ?, ?)
            ON CONFLICT(path) DO UPDATE SET
                status=excluded.status,
                updated_at=excluded.updated_at
            """,
            (str(path), status, now, now),
        )
        self.connection.commit()

    def mark_imported(self, path: Path) -> None:
        self._mark(path, "imported", None)

    def mark_failed(self, path: Path, error: str) -> None:
        self._mark(path, "failed", error)

    def mark_skipped_permanent(self, path: Path, error: str) -> None:
        self._mark(path, "skipped_permanent", error)

    def mark_pending(self, path: Path, error: str | None = None) -> None:
        self._mark(path, "pending", error)

    def _mark(self, path: Path, status: str, error: str | None) -> None:
        now = iso_now()
        self.connection.execute(
            """
            UPDATE imports
            SET status=?, last_error=?, updated_at=?
            WHERE path=?
            """,
            (status, error, now, str(path)),
        )
        self.connection.commit()

    def get_status(self, path: Path) -> str | None:
        row = self.connection.execute(
            "SELECT status FROM imports WHERE path=?",
            (str(path),),
        ).fetchone()
        return None if row is None else str(row["status"])

    def get_item(self, path: Path) -> ImportItem | None:
        row = self.connection.execute(
            "SELECT path, status, attempts, last_error FROM imports WHERE path=?",
            (str(path),),
        ).fetchone()
        return row_to_item(row) if row is not None else None

    def next_importable_batch(self, limit: int, max_attempts: int) -> list[ImportItem]:
        rows = self.connection.execute(
            """
            SELECT path, status, attempts, last_error
            FROM imports
            WHERE status IN ('pending', 'uncertain')
               OR (status='failed' AND attempts < ?)
            ORDER BY path
            LIMIT ?
            """,
            (max_attempts, limit),
        ).fetchall()
        return [row_to_item(row) for row in rows]

    def claim_next_batch(self, limit: int, max_attempts: int) -> list[ImportItem]:
        # Selecting via next_importable_batch() and marking 'importing' via a
        # later, separate UPDATE left a window between the two statements.
        # Nothing in this codebase locks the manifest against a
        # second process (a manual run started while the watchdog's worker is
        # still alive, a duplicate launch), so two processes could both SELECT
        # the same pending rows before either UPDATE landed, then both import
        # them with duplicate detection off (every row still looked
        # "pending" to each process) -- silently double-importing into
        # Photos. BEGIN IMMEDIATE takes SQLite's write lock before the SELECT
        # below runs, so a concurrent claimant blocks on its own BEGIN
        # IMMEDIATE until this transaction commits, then sees these rows
        # already 'importing' and excluded.
        now = iso_now()
        self.connection.execute("BEGIN IMMEDIATE")
        try:
            rows = self.connection.execute(
                """
                SELECT path, status, attempts, last_error
                FROM imports
                WHERE status IN ('pending', 'uncertain')
                   OR (status='failed' AND attempts < ?)
                ORDER BY path
                LIMIT ?
                """,
                (max_attempts, limit),
            ).fetchall()
            items = [row_to_item(row) for row in rows]
            for item in items:
                self.connection.execute(
                    """
                    UPDATE imports
                    SET status='importing', attempts=attempts + 1, last_error=NULL, updated_at=?
                    WHERE path=?
                    """,
                    (now, str(item.path)),
                )
        except BaseException:
            self.connection.rollback()
            raise
        self.connection.commit()
        return items

    def summary(self) -> dict[str, int]:
        counts = {
            status: 0
            for status in (
                "pending",
                "uncertain",
                "importing",
                "imported",
                "failed",
                "skipped_duplicate_risk",
                "skipped_permanent",
            )
        }
        for row in self.connection.execute("SELECT status, COUNT(*) AS count FROM imports GROUP BY status"):
            counts[str(row["status"])] = int(row["count"])
        counts["total"] = sum(counts.values())
        counts["remaining"] = (
            counts["pending"]
            + counts["uncertain"]
            + counts["importing"]
            + counts["failed"]
        )
        return counts

    def recover_importing(self) -> int:
        now = iso_now()
        cursor = self.connection.execute(
            """
            UPDATE imports
            SET status='pending',
                last_error='Recovered from interrupted import; will retry',
                updated_at=?
            WHERE status='importing'
            """,
            (now,),
        )
        self.connection.commit()
        return int(cursor.rowcount)

    def skip_uncertain(self, reason: str) -> int:
        now = iso_now()
        cursor = self.connection.execute(
            """
            UPDATE imports
            SET status='skipped_duplicate_risk', last_error=?, updated_at=?
            WHERE status='uncertain'
            """,
            (reason, now),
        )
        self.connection.commit()
        return int(cursor.rowcount)

    def reset_failed_transient_to_pending(self, max_attempts: int) -> int:
        now = iso_now()
        cursor = self.connection.execute(
            """
            UPDATE imports
            SET status='pending', updated_at=?
            WHERE status='failed' AND attempts < ?
            """,
            (now, max_attempts),
        )
        self.connection.commit()
        return int(cursor.rowcount)

    def ambiguous_names(self) -> set[str]:
        # Camera-generated filenames (DSC00001.JPG, IMG_0001.JPG) are not
        # globally unique, so two distinct tracked source files can share a
        # basename. Every basename-only Photos-library match in this module
        # (bulk_preflight_pending, photos_contains_file, filename_in_photos)
        # is unsafe for a name in this set: matching by name alone would mark
        # every same-named row "imported" once any one of them is, silently
        # dropping the others without ever copying their bytes.
        counts: dict[str, int] = {}
        for (path,) in self.connection.execute("SELECT path FROM imports"):
            name = Path(path).name
            counts[name] = counts.get(name, 0) + 1
        return {name for name, count in counts.items() if count > 1}

    def all_items(self) -> list[ImportItem]:
        rows = self.connection.execute(
            "SELECT path, status, attempts, last_error FROM imports ORDER BY path"
        ).fetchall()
        return [row_to_item(row) for row in rows]


def row_to_item(row: sqlite3.Row) -> ImportItem:
    return ImportItem(
        path=Path(str(row["path"])),
        status=str(row["status"]),
        attempts=int(row["attempts"]),
        last_error=None if row["last_error"] is None else str(row["last_error"]),
    )


def iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def file_is_ready(path: Path) -> bool:
    # exists() and stat() are two separate syscalls; a file that vanishes
    # between them (an iCloud placeholder evicted mid-check, a card ejected
    # early) makes the bare stat() raise OSError. That happened unguarded
    # here before this fix -- crashing the whole importer run rather than
    # just treating this one file as not-ready-yet-retry, the same failure
    # mode already closed in sd_offload.py's verification loop.
    try:
        return path.exists() and path.stat().st_size > 0
    except OSError:
        return False


class VerifyReport(TypedDict):
    """Return shape of `verify_manifest`.

    Typed as a TypedDict rather than `dict[str, object]` because the four
    fields have four different concrete types, and the CLI reads each one for
    what it actually is (`len(report["failures"])`, iteration over each
    failure dict). Under the old return annotation mypy could only see
    `object` for every value, and rightly rejected all three uses in `main()`.
    """

    checked: int
    healthy: int
    failures: list[dict[str, str]]
    status_counts: dict[str, int]


def verify_manifest(state: ImportState) -> VerifyReport:
    """Check that every manifest file still exists and can be read."""
    status_counts: dict[str, int] = {}
    failures: list[dict[str, str]] = []
    checked = 0
    for item in state.all_items():
        checked += 1
        status_counts[item.status] = status_counts.get(item.status, 0) + 1
        try:
            size = item.path.stat().st_size
            if size == 0:
                failures.append({"path": str(item.path), "reason": "empty"})
                continue
            with item.path.open("rb") as handle:
                if not handle.read(1):
                    failures.append({"path": str(item.path), "reason": "unreadable"})
        except OSError as error:
            reason = "missing" if not item.path.exists() else "unreadable"
            failures.append({"path": str(item.path), "reason": f"{reason}: {error}"})
    return {
        "checked": checked,
        "healthy": checked - len(failures),
        "failures": failures,
        "status_counts": status_counts,
    }


def manifest_db_path(state_dir: Path, media_type: str) -> Path:
    if media_type == "raw":
        return state_dir / "raw_import.sqlite3"
    return state_dir / "photos_import.sqlite3"


def suffixes_for_media_type(media_type: str) -> set[str]:
    try:
        return MEDIA_SUFFIXES[media_type]
    except KeyError as error:
        raise ValueError(f"Unsupported media type: {media_type}") from error


def discover_jpegs(root: Path) -> list[Path]:
    return discover_media(root, "jpeg")


def discover_raws(root: Path) -> list[Path]:
    return discover_media(root, "raw")


def discover_media(root: Path, media_type: str) -> list[Path]:
    suffixes = suffixes_for_media_type(media_type)
    return sorted(path for path in root.rglob("*") if path.is_file() and path.suffix.lower() in suffixes)


def discover_importable_photos(root: Path) -> list[Path]:
    return sorted(
        path for path in root.rglob("*") if path.is_file() and path.suffix.lower() in IMPORTABLE_SUFFIXES
    )


def build_manifest(
    state: ImportState,
    root: Path,
    confirmed_imported_count: int,
    uncertain_count: int,
    *,
    media_type: str = "jpeg",
) -> None:
    files = discover_media(root, media_type)
    for index, path in enumerate(files):
        if index < confirmed_imported_count:
            status = "imported"
        elif index < confirmed_imported_count + uncertain_count:
            status = "uncertain"
        else:
            status = "pending"
        if state.get_status(path) is None:
            state.upsert(path, status)


def recover_interrupted(state: ImportState) -> int:
    return state.recover_importing()


def load_photos_original_filenames(photos_db: Path) -> set[str]:
    if not photos_db.exists():
        return set()
    names: set[str] = set()
    with sqlite3.connect(f"file:{photos_db}?mode=ro", uri=True) as connection:
        for row in connection.execute(
            "SELECT ZORIGINALFILENAME FROM ZADDITIONALASSETATTRIBUTES WHERE ZORIGINALFILENAME IS NOT NULL"
        ):
            if row[0]:
                names.add(str(row[0]))
        for row in connection.execute("SELECT ZFILENAME FROM ZASSET WHERE ZFILENAME IS NOT NULL"):
            if row[0]:
                names.add(str(row[0]))
    return names


def bulk_preflight_pending(state: ImportState, photos_db: Path) -> int:
    names = load_photos_original_filenames(photos_db)
    if not names:
        return 0
    ambiguous = state.ambiguous_names()
    marked = 0
    now = iso_now()
    for path, in state.connection.execute(
        "SELECT path FROM imports WHERE status IN ('pending', 'failed', 'uncertain')"
    ):
        name = Path(path).name
        if name in ambiguous:
            continue
        if name in names:
            state.connection.execute(
                "UPDATE imports SET status='imported', last_error=NULL, updated_at=? WHERE path=?",
                (now, path),
            )
            marked += 1
    state.connection.commit()
    return marked


class PhotosImporter:
    def __init__(
        self,
        *,
        state: ImportState,
        state_dir: Path,
        event_log: Path,
        error_log: Path,
        status_path: Path,
        stop_file: Path,
        per_file_timeout_seconds: int,
        attempts: int,
        batch_size: int,
        photos_db: Path,
        use_photos_preflight: bool = False,
        scratch_dir: Path | None = None,
    ) -> None:
        self.state = state
        self.state_dir = state_dir
        self.event_log = event_log
        self.error_log = error_log
        self.status_path = status_path
        self.stop_file = stop_file
        self.per_file_timeout_seconds = per_file_timeout_seconds
        self.attempts = attempts
        self.batch_size = batch_size
        self.photos_db = photos_db
        self.use_photos_preflight = use_photos_preflight
        self.scratch_dir = scratch_dir
        self.should_stop = False
        self.stats = RuntimeStats(current_batch_size=batch_size)
        self.photos_activated = False
        self._photos_names_cache: set[str] | None = None
        self._photos_names_loaded_at = 0.0
        self._ambiguous_names_cache: set[str] | None = None
        self._ambiguous_names_loaded_at = 0.0

    def install_signal_handlers(self) -> None:
        def request_stop(_signum: int, _frame: object) -> None:
            self.should_stop = True
            print("\nStop requested. Finishing current batch, then exiting cleanly...", flush=True)

        signal.signal(signal.SIGINT, request_stop)
        signal.signal(signal.SIGTERM, request_stop)

    def run(self) -> int:
        self.install_signal_handlers()
        recovered = recover_interrupted(self.state)
        if recovered:
            self.log_event("recover_interrupted", {"count": recovered, "action": "reset_to_pending"})

        self.reset_failed_for_retry()
        preflighted = bulk_preflight_pending(self.state, self.photos_db)
        if preflighted:
            self.stats.preflight_runs += 1
            self.log_event("bulk_preflight", {"marked_imported": preflighted})

        self.ensure_photos_ready()
        summary = self.state.summary()
        print(format_summary("Starting", summary), flush=True)
        self.write_status("running")

        while not self.should_stop and not self.stop_file.exists():
            if self.stats.consecutive_failures >= CIRCUIT_BREAKER_THRESHOLD:
                self.handle_circuit_breaker()

            batch = self.prepare_batch()
            if not batch:
                # prepare_batch() claims a batch via claim_next_batch(), then
                # resolves some claimed items to a terminal status itself
                # (Photos preflight match -> mark_imported; wait_for_file()
                # timeout -> mark_skipped_permanent) without adding them to
                # `ready`. So an empty `ready` list only means "nothing to
                # import this pass" -- not "the manifest is done". Checking
                # summary()["remaining"] instead of trusting an empty batch
                # is what prevents an early "Complete" while pending items
                # (or items "importing" under another process) still exist.
                if self.state.summary()["remaining"] == 0:
                    print(format_summary("Complete", self.state.summary()), flush=True)
                    self.write_status("complete")
                    self.write_completion_report()
                    return 0
                time.sleep(1)
                continue

            if not self.check_disk_space():
                # prepare_batch() already claimed this batch (status
                # 'importing') via the atomic claim; undo that claim so
                # these items are picked up again once space frees up
                # instead of sitting stuck as 'importing' until the next
                # process restart's recover_interrupted() sweep.
                for item in batch:
                    self.state.mark_pending(item.path)
                time.sleep(30)
                continue

            try:
                self.import_batch_with_split(batch)
                self.stats.consecutive_failures = 0
                self.stats.last_success_at = time.monotonic()
                self.stats.batches_completed += 1
                if self.stats.batches_completed % 10 == 0:
                    marked = bulk_preflight_pending(self.state, self.photos_db)
                    if marked:
                        self.stats.preflight_runs += 1
                        self.log_event("periodic_preflight", {"marked_imported": marked})
            except Exception as error:
                # An exception here escaped import_batch_with_split entirely
                # (e.g. a non-PhotosImportError raised by import_paths_osascript,
                # such as osascript itself being transiently missing), so none
                # of the per-item error handling in handle_item_error ran. Every
                # item in the batch is still marked "importing" from the loop
                # above -- and next_importable_batch never selects "importing"
                # rows -- so without resetting them here they would be stuck
                # for the rest of this process's life: never retried, and
                # silently excluded from "remaining" once they run out, so the
                # run could report "Complete" while imports never happened.
                self.stats.consecutive_failures += 1
                self.stats.total_errors += 1
                self.stats.last_error = str(error)
                classified = classify_error(str(error))
                self.stats.last_error_category = classified.category.value
                for item in batch:
                    current = self.state.get_item(item.path)
                    # import_batch_with_split recurses left/right on a failing
                    # batch, so a left half already committed "imported" by a
                    # nested call is still present in this `batch` when the
                    # right half's exception escapes. Only items still
                    # "importing" were left unresolved; relabeling the rest
                    # would overwrite a genuine success and trigger a
                    # needless re-import.
                    if current is not None and current.status != "importing":
                        continue
                    attempts = current.attempts if current is not None else item.attempts
                    if classified.category == ErrorCategory.PERMANENT:
                        self.state.mark_skipped_permanent(item.path, str(error))
                    elif attempts >= MAX_TRANSIENT_ATTEMPTS:
                        self.state.mark_skipped_permanent(item.path, f"Exceeded retry limit: {error}")
                    else:
                        self.state.mark_failed(item.path, str(error))
                self.log_structured_error(
                    path=None,
                    message=str(error),
                    classified=classified,
                    attempt=0,
                    next_action="batch_abort",
                )

            self.write_status("running")

        print(format_summary("Stopped", self.state.summary()), flush=True)
        self.log_event("stopped", self.state.summary())
        self.write_status("stopped")
        return 130

    def prepare_batch(self) -> list[ImportItem]:
        items = self.state.claim_next_batch(self.stats.current_batch_size, MAX_TRANSIENT_ATTEMPTS)
        ready: list[ImportItem] = []
        for item in items:
            if self.use_photos_preflight and self.photos_contains_file(item.path):
                self.state.mark_imported(item.path)
                self.log_event("skipped_existing", {"path": str(item.path)})
                continue
            if not self.wait_for_file(item.path):
                continue
            ready.append(item)
        return ready

    def import_batch_with_split(self, batch: list[ImportItem]) -> None:
        if not batch:
            return
        if len(batch) == 1:
            self.import_single_item(batch[0])
            return

        paths = [item.path for item in batch]
        duplicate_check = any(item.status != "pending" for item in batch)
        try:
            self.import_paths_osascript(paths, duplicate_check=duplicate_check)
            for item in batch:
                self.state.mark_imported(item.path)
                self.log_event("imported", {"path": str(item.path), "mode": "batch", "batch_size": len(batch)})
            print(self.progress_line("imported", batch[-1].path), flush=True)
        except PhotosImportError as error:
            left, right = split_batch(batch)
            if len(left) == 1 and len(right) == 0:
                self.import_single_item(left[0])
                return
            self.log_structured_error(
                path=None,
                message=str(error),
                classified=error.classified,
                attempt=0,
                next_action="split_batch",
                extra={"batch_size": len(batch)},
            )
            self.import_batch_with_split(left)
            self.import_batch_with_split(right)

    def import_single_item(self, item: ImportItem) -> None:
        # scratch_path is computed up front (not read back from
        # resolve_import_path's return value) so cleanup below runs for
        # every exit from this method, including a raised PhotosImportError
        # -- staging failures, a Photos-side rejection, a timeout. Before
        # this fix, cleanup_scratch only ran after a successful import, so a
        # permanently-failed item (Photos-rejected as damaged, or one that
        # exhausted MAX_TRANSIENT_ATTEMPTS) is never retried and never gets
        # a second chance at cleanup: the copy resolve_import_path staged
        # just before the failed attempt was orphaned in scratch_dir
        # forever, an unbounded disk-space leak for every file that ever
        # fails permanently.
        scratch_path = self.scratch_dir / item.path.name if self.scratch_dir else None
        try:
            import_path = self.resolve_import_path(item.path)
            self.import_paths_osascript([import_path], duplicate_check=item.status != "pending")
            # Mark imported before cleanup: Photos already has the file at
            # this point, so a cleanup_scratch failure below must not undo
            # the bookkeeping -- that would leave the item "importing"
            # forever in this process (next_importable_batch never selects
            # that status) and hand it back to Photos again on the next
            # run, duplicate-importing a file it already has.
            self.state.mark_imported(item.path)
            self.log_event("imported", {"path": str(item.path), "mode": "single"})
            print(self.progress_line("imported", item.path), flush=True)
        except PhotosImportError as error:
            self.handle_item_error(item, error)
        finally:
            if scratch_path is not None:
                self.cleanup_scratch(scratch_path, item.path)

    def handle_item_error(self, item: ImportItem, error: PhotosImportError) -> None:
        classified = error.classified
        self.stats.consecutive_failures += 1
        self.stats.total_errors += 1
        self.stats.last_error = str(error)
        self.stats.last_error_category = classified.category.value

        if self.filename_in_photos(item.path.name):
            self.state.mark_imported(item.path)
            self.log_event(
                "recovered_already_imported",
                {"path": str(item.path), "original_error": str(error)},
            )
            self.stats.consecutive_failures = 0
            return

        # `item` is the object claim_next_batch() returned, built from the
        # manifest row *before* that same call's UPDATE incremented
        # attempts -- so item.attempts always trails the current DB value
        # by one. Using it directly here let an item exhaust its retries
        # one claim before claim_next_batch()'s own `attempts < max_attempts`
        # filter started excluding it: the retry-limit check below never
        # fired (it was still comparing last attempt's count), so the item
        # was marked "failed" one final time, then silently became
        # unclaimable -- stuck at "failed" forever, never reclassified to
        # skipped_permanent, yet still counted in summary()["remaining"]
        # since "failed" is one of the statuses that sums to it. Re-fetching
        # the current row (as the batch-exception path in run() already
        # does) reads the same post-increment value the claim query itself
        # uses, so both agree on when an item is truly exhausted.
        current = self.state.get_item(item.path)
        attempts = current.attempts if current is not None else item.attempts

        next_action = classified.action.value
        if classified.category == ErrorCategory.PERMANENT:
            self.state.mark_skipped_permanent(item.path, str(error))
            next_action = ErrorAction.SKIP_PERMANENT.value
        elif classified.action == ErrorAction.RELAUNCH_PHOTOS:
            self.relaunch_photos()
            self.state.mark_pending(item.path, str(error))
        elif attempts >= MAX_TRANSIENT_ATTEMPTS:
            self.state.mark_skipped_permanent(item.path, f"Exceeded retry limit: {error}")
            next_action = ErrorAction.SKIP_PERMANENT.value
        else:
            self.state.mark_failed(item.path, str(error))
            delay = min(2 ** min(attempts, 6), 120) + random.uniform(0, 2)
            time.sleep(delay)

        self.log_structured_error(
            path=item.path,
            message=str(error),
            classified=classified,
            attempt=attempts,
            next_action=next_action,
        )
        print(self.progress_line("failed", item.path, str(error)), flush=True)

        if self.stats.consecutive_failures >= PHOTOS_RELAUNCH_THRESHOLD:
            self.relaunch_photos()

    def handle_circuit_breaker(self) -> None:
        pause_seconds = min(60 + self.stats.consecutive_failures * 5, 300)
        self.stats.current_strategy = "circuit_breaker_pause"
        self.log_event(
            "circuit_breaker",
            {
                "consecutive_failures": self.stats.consecutive_failures,
                "pause_seconds": pause_seconds,
                "action": "preflight_then_pause",
            },
        )
        marked = bulk_preflight_pending(self.state, self.photos_db)
        if marked:
            self.stats.preflight_runs += 1
        self.relaunch_photos()
        if self.stats.current_batch_size > 1:
            self.stats.current_batch_size = max(1, self.stats.current_batch_size // 2)
        time.sleep(pause_seconds)
        self.stats.consecutive_failures = 0
        self.stats.current_strategy = "batch"

    def reset_failed_for_retry(self) -> None:
        reset = self.state.reset_failed_transient_to_pending(MAX_TRANSIENT_ATTEMPTS)
        if reset:
            self.log_event("reset_failed_for_retry", {"count": reset})

    def wait_for_file(self, path: Path) -> bool:
        if file_is_ready(path):
            return True
        for attempt in range(1, ICLOUD_WAIT_ATTEMPTS + 1):
            time.sleep(min(2 ** attempt, 30))
            if file_is_ready(path):
                self.log_event(
                    "icloud_file_ready",
                    {"path": str(path), "wait_attempts": attempt},
                )
                return True
        classified = classify_error(f"file missing after {ICLOUD_WAIT_ATTEMPTS} iCloud wait attempts")
        self.state.mark_skipped_permanent(path, classified.message)
        self.log_structured_error(
            path=path,
            message=classified.message,
            classified=classified,
            attempt=ICLOUD_WAIT_ATTEMPTS,
            next_action=ErrorAction.SKIP_PERMANENT.value,
        )
        return False

    def resolve_import_path(self, path: Path) -> Path:
        if self.scratch_dir is None:
            return path
        self.scratch_dir.mkdir(parents=True, exist_ok=True)
        scratch_path = self.scratch_dir / path.name
        try:
            if scratch_path.exists():
                scratch_path.unlink(missing_ok=True)
            shutil.copy2(path, scratch_path)
        except OSError as error:
            # A flaky read on the source (e.g. a stalled iCloud download), a
            # full/unwritable scratch volume, or a stale leftover scratch
            # file from a killed prior attempt that can't be removed (e.g. a
            # network/iCloud-backed scratch mount hiccup) must not crash
            # straight out of import_single_item -- only PhotosImportError is
            # caught there, so a bare OSError ran uncaught before this fix
            # and took down the whole batch (import_batch_with_split's
            # sequential left/right calls never reach the sibling once one
            # side raises), not just this one item, the way any other
            # per-item import failure is isolated and retried.
            raise PhotosImportError(
                f"Failed to stage {path.name} into scratch dir: {error}",
                classified=classify_error(str(error)),
            ) from error
        return scratch_path

    def cleanup_scratch(self, scratch_path: Path, original_path: Path) -> None:
        # Called from import_single_item's `finally`, so this runs on both
        # the success path (Photos already has the file) and the failure
        # path (the item is being retried, skipped, or marked permanent).
        # resolve_import_path always re-stages a fresh copy on the next
        # attempt regardless of what's already there, so nothing is lost by
        # clearing the scratch copy unconditionally after every attempt.
        if not (self.scratch_dir and scratch_path != original_path):
            return
        try:
            if scratch_path.exists():
                scratch_path.unlink(missing_ok=True)
        except OSError:
            # Best-effort: a leftover scratch file is a minor disk-space
            # nuisance, not a correctness issue. It must not raise here --
            # the caller may have already marked the item imported by this
            # point, and a failed item must still get its normal retry/skip
            # handling rather than being disrupted by a cleanup error.
            pass

    def import_paths_osascript(self, paths: list[Path], *, duplicate_check: bool) -> None:
        if not paths:
            return
        self.ensure_photos_ready()
        skip_duplicate_check = "false" if duplicate_check else "true"
        timeout = self.per_file_timeout_seconds * max(len(paths), 1) + 60
        files_clause = ", ".join(f'POSIX file "{apple_quote(str(path))}"' for path in paths)
        script = (
            f"with timeout of {timeout} seconds\n"
            'tell application "Photos"\n'
            f"import {{{files_clause}}} skip check duplicates {skip_duplicate_check}\n"
            "end tell\n"
            "end timeout\n"
        )
        try:
            result = subprocess.run(
                ["osascript"],
                input=script,
                text=True,
                capture_output=True,
                timeout=timeout,
            )
        except subprocess.TimeoutExpired as error:
            raise PhotosImportError(
                f"Timed out after {timeout}s for batch of {len(paths)}",
                classified=classify_error(f"timed out after {timeout}s"),
            ) from error

        if result.returncode != 0:
            message = (result.stderr or result.stdout or "unknown Photos import error").strip()
            raise PhotosImportError(message, classified=classify_error(message))

    def ensure_photos_ready(self) -> None:
        try:
            subprocess.run(
                ["osascript", "-e", 'tell application "Photos" to activate'],
                check=True,
                capture_output=True,
                timeout=30,
            )
            self.photos_activated = True
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as error:
            raise PhotosImportError("Photos not responding", classified=classify_error("photos not responding")) from error

    def relaunch_photos(self) -> None:
        self.log_event("relaunch_photos", {"reason": "health_recovery"})
        subprocess.run(["osascript", "-e", 'tell application "Photos" to quit'], capture_output=True, timeout=30)
        time.sleep(3)
        subprocess.run(["open", "-a", "Photos"], check=False)
        time.sleep(5)
        self.photos_activated = False
        self.stats.photos_relaunches += 1
        self.ensure_photos_ready()

    def photos_contains_file(self, path: Path) -> bool:
        name = path.name
        if name in self.get_ambiguous_names():
            return False
        return name in self.get_photos_names()

    def filename_in_photos(self, filename: str) -> bool:
        if filename in self.get_ambiguous_names():
            return False
        return filename in self.get_photos_names()

    def get_photos_names(self) -> set[str]:
        if self._photos_names_cache is None or time.monotonic() - self._photos_names_loaded_at > 300:
            self._photos_names_cache = load_photos_original_filenames(self.photos_db)
            self._photos_names_loaded_at = time.monotonic()
        return self._photos_names_cache

    def get_ambiguous_names(self) -> set[str]:
        # Same collision this venture's other basename-only Photos-library
        # matches need guarding against (see ImportState.ambiguous_names);
        # cached on the same TTL as get_photos_names since both are read on
        # every prepare_batch/handle_item_error call.
        if self._ambiguous_names_cache is None or time.monotonic() - self._ambiguous_names_loaded_at > 300:
            self._ambiguous_names_cache = self.state.ambiguous_names()
            self._ambiguous_names_loaded_at = time.monotonic()
        return self._ambiguous_names_cache

    def check_disk_space(self) -> bool:
        try:
            usage = shutil.disk_usage(self.state_dir)
        except OSError as error:
            # state_dir is typically an iCloud-synced path (see the default
            # in parse_args); a transient stat failure there -- a sync
            # hiccup, a momentarily unreachable network mount -- ran
            # unguarded here before this fix, raising straight out of
            # run()'s while loop and aborting the whole import for a
            # condition that resolves itself. Treat it the same as
            # confirmed-low disk space: skip this iteration and let the
            # loop retry rather than crash.
            self.log_event("disk_space_check_failed", {"error": str(error)})
            return False
        free_gb = usage.free / (1024 ** 3)
        if free_gb < 2:
            self.log_event("low_disk_space", {"free_gb": round(free_gb, 2)})
            return False
        return True

    def progress_line(self, action: str, path: Path, error: str | None = None) -> str:
        summary = self.state.summary()
        done = summary["imported"] + summary["skipped_duplicate_risk"] + summary.get("skipped_permanent", 0)
        total = summary["total"]
        elapsed = max(time.monotonic() - self.stats.started_at, 0.001)
        rate = done / elapsed
        remaining = total - done
        eta = "unknown" if rate <= 0 else format_duration(remaining / rate)
        suffix = f" error={error}" if error else ""
        return (
            f"{action.upper()} {done}/{total} ({done / total:.1%}) "
            f"remaining={remaining} failed={summary['failed']} batch={self.stats.current_batch_size} "
            f"rate={rate:.2f}/s eta={eta} file={path.name}{suffix}"
        )

    def write_status(self, message: str) -> None:
        summary = self.state.summary()
        elapsed = max(time.monotonic() - self.stats.started_at, 0.001)
        done = summary["imported"] + summary["skipped_duplicate_risk"] + summary.get("skipped_permanent", 0)
        rate = done / elapsed if done else 0
        remaining = summary["remaining"]
        payload = {
            "updated_at": iso_now(),
            "message": message,
            "worker_running": message == "running",
            "summary": summary,
            "progress": {
                "rate_per_second": round(rate, 3),
                "eta_seconds": int(remaining / rate) if rate > 0 else None,
                "eta_human": format_duration(remaining / rate) if rate > 0 else "unknown",
                "current_batch_size": self.stats.current_batch_size,
                "current_strategy": self.stats.current_strategy,
                "batches_completed": self.stats.batches_completed,
                "consecutive_failures": self.stats.consecutive_failures,
                "photos_relaunches": self.stats.photos_relaunches,
                "preflight_runs": self.stats.preflight_runs,
            },
            "errors": {
                "last_error": self.stats.last_error,
                "last_error_category": self.stats.last_error_category,
                "total_errors_session": self.stats.total_errors,
                "error_count_1h": count_recent_errors(self.error_log, hours=1),
            },
        }
        write_json_atomic(self.status_path, payload, sort_keys=True)

    def write_completion_report(self) -> None:
        report_path = self.state_dir / "completion_report.json"
        report = {
            "completed_at": iso_now(),
            "summary": self.state.summary(),
            "stats": {
                "batches_completed": self.stats.batches_completed,
                "photos_relaunches": self.stats.photos_relaunches,
                "preflight_runs": self.stats.preflight_runs,
                "total_errors": self.stats.total_errors,
            },
        }
        write_json_atomic(report_path, report, sort_keys=True)

    def log_event(self, event_type: str, payload: Mapping[str, object]) -> None:
        record = {"time": iso_now(), "event": event_type, **payload}
        with self.event_log.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(record, sort_keys=True) + "\n")

    def log_structured_error(
        self,
        *,
        path: Path | None,
        message: str,
        classified: ClassifiedError,
        attempt: int,
        next_action: str,
        extra: dict[str, object] | None = None,
    ) -> None:
        record = {
            "time": iso_now(),
            "path": None if path is None else str(path),
            "message": message,
            "category": classified.category.value,
            "code": classified.code,
            "action": classified.action.value,
            "attempt": attempt,
            "next_action": next_action,
            **(extra or {}),
        }
        with self.error_log.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(record, sort_keys=True) + "\n")
        self.log_event("error", record)


def count_recent_errors(error_log: Path, *, hours: int) -> int:
    if not error_log.exists():
        return 0
    cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
    count = 0
    for line in error_log.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        try:
            record = json.loads(line)
            ts = datetime.fromisoformat(str(record["time"]))
            if ts >= cutoff:
                count += 1
        except (json.JSONDecodeError, KeyError, ValueError):
            continue
    return count


def summarize_recent_errors(error_log: Path, *, limit: int = 10) -> list[dict[str, object]]:
    if not error_log.exists():
        return []
    rows: list[dict[str, object]] = []
    for line in error_log.read_text(encoding="utf-8").splitlines()[-limit:]:
        if not line.strip():
            continue
        # error_log is appended one line at a time (log_structured_error's
        # plain `handle.write(...)`, not write_json_atomic) and state_dir is
        # typically an iCloud-synced path, so a crash or forced unmount mid-
        # write can leave a torn last line -- exactly the failure mode
        # atomic_io.py exists to close for status.json. count_recent_errors
        # (reading this same file for the same status/write_status call site)
        # already guards against this; this function did not, so `status`
        # crashed on json.loads right after the kind of interrupted run an
        # operator runs `status` to diagnose.
        try:
            rows.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return rows


def apple_quote(path: str) -> str:
    return path.replace("\\", "\\\\").replace('"', '\\"')


def format_duration(seconds: float) -> str:
    seconds = int(seconds)
    hours, remainder = divmod(seconds, 3600)
    minutes, seconds = divmod(remainder, 60)
    if hours:
        return f"{hours}h{minutes:02d}m"
    if minutes:
        return f"{minutes}m{seconds:02d}s"
    return f"{seconds}s"


def format_summary(label: str, summary: dict[str, int]) -> str:
    return (
        f"{label}: total={summary['total']} imported={summary['imported']} "
        f"skipped_duplicate_risk={summary['skipped_duplicate_risk']} "
        f"skipped_permanent={summary.get('skipped_permanent', 0)} "
        f"pending={summary['pending']} uncertain={summary['uncertain']} "
        f"failed={summary['failed']} importing={summary['importing']}"
    )


def parse_args(argv: Iterable[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Resumable Apple Photos importer for JPEGs and RAW files")
    parser.add_argument("command", choices=("init", "run", "status", "skip-uncertain", "preflight", "verify"))
    parser.add_argument(
        "--media-type",
        choices=tuple(MEDIA_SUFFIXES),
        default="jpeg",
        help="Import JPEGs or RAW camera files (default: jpeg)",
    )
    parser.add_argument(
        "--root",
        type=Path,
        default=Path(
            "/Users/duncan/Library/Mobile Documents/com~apple~CloudDocs/media-assets/Photos_Organized/2026"
        ),
    )
    parser.add_argument(
        "--state-dir",
        type=Path,
        default=Path(
            "/Users/duncan/Library/Mobile Documents/com~apple~CloudDocs/media-assets/Photos_Organized/.import_state"
        ),
    )
    parser.add_argument("--confirmed-imported-count", type=int, default=0)
    parser.add_argument("--uncertain-count", type=int, default=0)
    parser.add_argument("--timeout", type=int, default=180)
    parser.add_argument("--attempts", type=int, default=3)
    parser.add_argument("--batch-size", type=int, default=10)
    parser.add_argument("--photos-db", type=Path, default=DEFAULT_PHOTOS_DB)
    parser.add_argument("--scratch-dir", type=Path, default=None)
    parser.add_argument("--photos-preflight", action="store_true")
    parser.add_argument("--json", action="store_true", help="Print verify results as JSON")
    return parser.parse_args(list(argv))


def main(argv: Iterable[str] = sys.argv[1:]) -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    args = parse_args(argv)
    manifest_path = manifest_db_path(args.state_dir, args.media_type)
    state = ImportState(manifest_path)
    error_log = args.state_dir / f"errors_{args.media_type}.jsonl"
    try:
        if args.command == "init":
            build_manifest(
                state,
                args.root,
                args.confirmed_imported_count,
                args.uncertain_count,
                media_type=args.media_type,
            )
            print(f"Media type: {args.media_type} manifest={manifest_path.name}")
            print(format_summary("Initialized", state.summary()))
            return 0
        if args.command == "status":
            recovered = recover_interrupted(state)
            if recovered:
                print(f"Recovered {recovered} interrupted file(s) to pending.")
            print(f"Media type: {args.media_type} manifest={manifest_path.name}")
            print(format_summary("Status", state.summary()))
            recent = summarize_recent_errors(error_log)
            if recent:
                print(f"Recent errors ({len(recent)}):")
                for row in recent[-5:]:
                    print(
                        f"  - [{row.get('category')}] {row.get('code')}: "
                        f"{Path(str(row.get('path') or '')).name or 'batch'} -> {row.get('next_action')}"
                    )
            status_path = args.state_dir / (
                "status_raw.json" if args.media_type == "raw" else "status.json"
            )
            if status_path.exists():
                try:
                    status = json.loads(status_path.read_text(encoding="utf-8"))
                except (OSError, json.JSONDecodeError):
                    # Status is a convenience snapshot, not the source of truth.
                    # Keep the manifest summary usable when a sync or interrupted
                    # write leaves the snapshot unavailable.
                    print("Progress snapshot unavailable; manifest summary is authoritative.")
                else:
                    progress = status.get("progress", {})
                    errors = status.get("errors", {})
                    print(
                        f"Strategy={progress.get('current_strategy')} batch={progress.get('current_batch_size')} "
                        f"eta={progress.get('eta_human')} consecutive_failures={progress.get('consecutive_failures')}"
                    )
                    if errors.get("last_error"):
                        print(f"Last error [{errors.get('last_error_category')}]: {errors.get('last_error')}")
            return 0
        if args.command == "skip-uncertain":
            skipped = state.skip_uncertain("Skipped because previous Photos timeout may already have imported these files.")
            print(f"Skipped {skipped} uncertain file(s) to avoid duplicate imports.")
            print(format_summary("Status", state.summary()))
            return 0
        if args.command == "preflight":
            marked = bulk_preflight_pending(state, args.photos_db)
            print(f"Marked {marked} file(s) as already in Photos.")
            print(format_summary("Status", state.summary()))
            return 0
        if args.command == "verify":
            report = verify_manifest(state)
            event_path = args.state_dir / f"events_{args.media_type}.jsonl"
            event_path.parent.mkdir(parents=True, exist_ok=True)
            with event_path.open("a", encoding="utf-8") as handle:
                handle.write(
                    json.dumps(
                        {
                            "time": iso_now(),
                            "event": "verify_manifest",
                            "media_type": args.media_type,
                            "checked": report["checked"],
                            "healthy": report["healthy"],
                            "failure_count": len(report["failures"]),
                        },
                        sort_keys=True,
                    )
                    + "\n"
                )
            if args.json:
                print(json.dumps(report, indent=2, sort_keys=True))
            else:
                print(
                    f"Verify: checked={report['checked']} healthy={report['healthy']} "
                    f"failed={len(report['failures'])}"
                )
                for failure in report["failures"]:
                    print(f"  - {failure['reason']}: {failure['path']}")
            return 0 if not report["failures"] else 1
        status_path = args.state_dir / (
            "status_raw.json" if args.media_type == "raw" else "status.json"
        )
        importer = PhotosImporter(
            state=state,
            state_dir=args.state_dir,
            event_log=args.state_dir / f"events_{args.media_type}.jsonl",
            error_log=error_log,
            status_path=status_path,
            stop_file=args.state_dir / "STOP",
            per_file_timeout_seconds=args.timeout,
            attempts=args.attempts,
            batch_size=args.batch_size,
            photos_db=args.photos_db,
            use_photos_preflight=args.photos_preflight,
            scratch_dir=args.scratch_dir,
        )
        return importer.run()
    finally:
        state.close()


if __name__ == "__main__":
    raise SystemExit(main())
