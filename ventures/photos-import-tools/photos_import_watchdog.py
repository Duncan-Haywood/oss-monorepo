#!/usr/bin/env python3
"""Watchdog for unattended Apple Photos imports."""

from __future__ import annotations

import argparse
import json
import os
import signal
import sqlite3
import subprocess
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

from atomic_io import write_json_atomic


@dataclass(frozen=True)
class ImportPhase:
    media_type: str
    db_path: Path
    status_path: Path
    batch_size: int
    timeout_seconds: int


def iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def read_summary(db_path: Path) -> dict[str, int]:
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
    if not db_path.exists():
        return {
            **counts,
            "total": 0,
            "remaining": 0,
            "accounted_for": 0,
        }
    with sqlite3.connect(db_path) as connection:
        for status, count in connection.execute("SELECT status, COUNT(*) FROM imports GROUP BY status"):
            counts[str(status)] = int(count)
    counts["total"] = sum(counts.values())
    counts["remaining"] = (
        counts["pending"] + counts["uncertain"] + counts["importing"] + counts["failed"]
    )
    counts["accounted_for"] = (
        counts["imported"] + counts["failed"] + counts["skipped_duplicate_risk"] + counts["skipped_permanent"]
    )
    return counts


def has_remaining_work(summary: dict[str, int]) -> bool:
    return (
        summary.get("pending", 0)
        + summary.get("uncertain", 0)
        + summary.get("importing", 0)
        + summary.get("failed", 0)
        > 0
    )


def read_status_file(status_path: Path) -> dict[str, object]:
    if not status_path.exists():
        return {}
    try:
        return json.loads(status_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}


def write_status(
    status_path: Path,
    summary: dict[str, int],
    *,
    worker_running: bool,
    message: str,
    extra: dict[str, object] | None = None,
) -> None:
    status_path.parent.mkdir(parents=True, exist_ok=True)
    payload: dict[str, object] = {
        "updated_at": iso_now(),
        "worker_running": worker_running,
        "message": message,
        "summary": summary,
    }
    if extra:
        payload.update(extra)
    write_json_atomic(status_path, payload, sort_keys=True)


def terminate_process_group(process: subprocess.Popen[bytes]) -> None:
    if process.poll() is not None:
        return
    try:
        os.killpg(process.pid, signal.SIGTERM)
    except ProcessLookupError:
        return
    try:
        process.wait(timeout=10)
    except subprocess.TimeoutExpired:
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        process.wait(timeout=10)


def build_phases(
    *,
    state_dir: Path,
    batch_size: int,
    timeout_seconds: int,
    include_raws: bool,
    raw_batch_size: int,
    raw_timeout_seconds: int,
) -> list[ImportPhase]:
    phases = [
        ImportPhase(
            media_type="jpeg",
            db_path=state_dir / "photos_import.sqlite3",
            status_path=state_dir / "status.json",
            batch_size=batch_size,
            timeout_seconds=timeout_seconds,
        )
    ]
    if include_raws:
        phases.append(
            ImportPhase(
                media_type="raw",
                db_path=state_dir / "raw_import.sqlite3",
                status_path=state_dir / "status_raw.json",
                batch_size=raw_batch_size,
                timeout_seconds=raw_timeout_seconds,
            )
        )
    return phases


def active_phase(phases: list[ImportPhase]) -> ImportPhase | None:
    for phase in phases:
        if has_remaining_work(read_summary(phase.db_path)):
            return phase
    return None


def run_watchdog(
    *,
    root: Path,
    state_dir: Path,
    tool_dir: Path,
    poll_seconds: int,
    stall_seconds: int,
    timeout_seconds: int,
    attempts: int,
    batch_size: int,
    include_raws: bool,
    raw_batch_size: int,
    raw_timeout_seconds: int,
) -> int:
    stop_path = state_dir / "STOP"
    log_path = state_dir / "watchdog.log"
    python_path = tool_dir / ".venv" / "bin" / "python"
    importer_path = tool_dir / "resumable_photos_import.py"
    phases = build_phases(
        state_dir=state_dir,
        batch_size=batch_size,
        timeout_seconds=timeout_seconds,
        include_raws=include_raws,
        raw_batch_size=raw_batch_size,
        raw_timeout_seconds=raw_timeout_seconds,
    )

    process: subprocess.Popen[bytes] | None = None
    current_phase: ImportPhase | None = None
    last_accounted_for = -1
    last_progress_at = time.monotonic()
    restart_count = 0
    current_batch_size = batch_size

    while True:
        phase = active_phase(phases)
        if phase is None:
            final_summary = read_summary(phases[-1].db_path)
            write_status(
                phases[0].status_path,
                final_summary,
                worker_running=False,
                message="complete",
                extra={"phase": "complete", "include_raws": include_raws},
            )
            return 0

        if stop_path.exists():
            if process is not None:
                terminate_process_group(process)
            write_status(
                phase.status_path,
                read_summary(phase.db_path),
                worker_running=False,
                message="stopped by STOP file",
                extra={"phase": phase.media_type},
            )
            return 130

        if current_phase is not None and phase.media_type != current_phase.media_type:
            if process is not None:
                terminate_process_group(process)
            process = None
            current_batch_size = phase.batch_size
            with log_path.open("ab") as log_handle:
                log_handle.write(
                    f"[{iso_now()}] switching phase to {phase.media_type}\n".encode()
                )

        current_phase = phase
        summary = read_summary(phase.db_path)
        importer_status = read_status_file(phase.status_path)
        errors_raw = importer_status.get("errors")
        errors = errors_raw if isinstance(errors_raw, dict) else {}
        progress_raw = importer_status.get("progress")
        progress = progress_raw if isinstance(progress_raw, dict) else {}
        consecutive_failures = int(progress.get("consecutive_failures", 0) or 0)
        error_count_1h = int(errors.get("error_count_1h", 0) or 0)

        if error_count_1h >= 20 or consecutive_failures >= 8:
            current_batch_size = max(1, current_batch_size // 2)
            with log_path.open("ab") as log_handle:
                log_handle.write(
                    f"[{iso_now()}] high error rate; reducing batch size to {current_batch_size}\n".encode()
                )

        accounted_for = summary["accounted_for"]
        if accounted_for != last_accounted_for:
            last_accounted_for = accounted_for
            last_progress_at = time.monotonic()

        if process is None or process.poll() is not None:
            restart_count += 1
            backoff = min(5 * restart_count, 60)
            if process is not None and process.poll() is not None:
                with log_path.open("ab") as log_handle:
                    log_handle.write(
                        f"[{iso_now()}] worker exited code={process.returncode}; backoff {backoff}s\n".encode()
                    )
                time.sleep(backoff)

            effective_batch_size = min(current_batch_size, phase.batch_size)
            command = [
                str(python_path),
                str(importer_path),
                "run",
                "--media-type",
                phase.media_type,
                "--root",
                str(root),
                "--state-dir",
                str(state_dir),
                "--timeout",
                str(phase.timeout_seconds),
                "--attempts",
                str(attempts),
                "--batch-size",
                str(effective_batch_size),
            ]
            with log_path.open("ab") as log_handle:
                log_handle.write(f"\n[{iso_now()}] starting worker: {' '.join(command)}\n".encode())
            process = subprocess.Popen(
                command,
                cwd=tool_dir,
                stdout=log_path.open("ab"),
                stderr=subprocess.STDOUT,
                start_new_session=True,
            )
            last_progress_at = time.monotonic()

        if time.monotonic() - last_progress_at > stall_seconds:
            with log_path.open("ab") as log_handle:
                log_handle.write(f"[{iso_now()}] worker stalled; restarting process group\n".encode())
            terminate_process_group(process)
            process = None
            last_progress_at = time.monotonic()

        write_status(
            phase.status_path,
            summary,
            worker_running=process is not None and process.poll() is None,
            message="running",
            extra={
                "phase": phase.media_type,
                "include_raws": include_raws,
                "watchdog": {
                    "restart_count": restart_count,
                    "effective_batch_size": current_batch_size,
                    "stall_seconds": stall_seconds,
                },
                "errors": errors,
                "progress": progress,
            },
        )
        time.sleep(poll_seconds)


def parse_args(argv: Iterable[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Unattended watchdog for resumable Photos imports")
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
    parser.add_argument("--tool-dir", type=Path, default=Path("/Users/duncan/Projects/photos_import_tools"))
    parser.add_argument("--poll-seconds", type=int, default=20)
    parser.add_argument("--stall-seconds", type=int, default=900)
    parser.add_argument("--timeout", type=int, default=180)
    parser.add_argument("--attempts", type=int, default=3)
    parser.add_argument("--batch-size", type=int, default=10)
    parser.add_argument("--include-raws", action="store_true")
    parser.add_argument("--raw-batch-size", type=int, default=3)
    parser.add_argument("--raw-timeout", type=int, default=600)
    return parser.parse_args(list(argv))


def main(argv: Iterable[str] = sys.argv[1:]) -> int:
    args = parse_args(argv)
    return run_watchdog(
        root=args.root,
        state_dir=args.state_dir,
        tool_dir=args.tool_dir,
        poll_seconds=args.poll_seconds,
        stall_seconds=args.stall_seconds,
        timeout_seconds=args.timeout,
        attempts=args.attempts,
        batch_size=args.batch_size,
        include_raws=args.include_raws,
        raw_batch_size=args.raw_batch_size,
        raw_timeout_seconds=args.raw_timeout,
    )


if __name__ == "__main__":
    raise SystemExit(main())
