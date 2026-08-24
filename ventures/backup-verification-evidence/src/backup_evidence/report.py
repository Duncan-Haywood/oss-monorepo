"""Classify backup-job run records into verified / suspicious / failed / inconclusive.

The failure mode this exists to catch is the silent one: a backup command that
exits 0 while the thing it was supposed to produce is missing, truncated, or
stale. A nonzero exit code is easy to notice. "The cron job ran and said
success, but the destination disk was full so the archive is 40 bytes" is not
-- and is one of the most common real-world backup failures. So `verified`
requires the exit code *and* the artifact to agree; anything else is reported
as a specific, named problem rather than folded into a generic "ok"/"not ok".

This module never runs a backup, deletes anything, or asserts that data is
recoverable -- it only reports what a run record and an artifact stat show.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

STATUS_VERIFIED = "verified"
STATUS_SUSPICIOUS = "suspicious"
STATUS_FAILED = "failed"
STATUS_INCONCLUSIVE = "inconclusive"

REQUIRED_FIELDS = ("tool", "exit_code", "finished_at")


def _parse_timestamp(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def classify_run(record: dict[str, Any], *, now: datetime | None = None) -> dict[str, Any]:
    """Classify one backup run record. Never raises on customer-supplied input.

    `record` shape (all customer-supplied, nothing fetched or inferred):
      tool: str -- name of the backup tool that ran (restic, borg, pg_dump, ...)
      exit_code: int | null
      finished_at: str -- ISO-8601 timestamp
      artifact: {exists: bool, size_bytes: int, modified_at: str} | null
      expected: {max_age_hours: number, min_size_bytes: int} | null -- both optional
      log_tail: str | null -- last lines of the tool's own output, for context only
    """
    reasons: list[str] = []
    missing = [field for field in REQUIRED_FIELDS if record.get(field) in (None, "")]
    if missing:
        return {
            "status": STATUS_INCONCLUSIVE,
            "reasons": [f"run record is missing required field(s): {', '.join(missing)}"],
            "tool": record.get("tool"),
            "finished_at": record.get("finished_at"),
        }

    try:
        finished_at = _parse_timestamp(record["finished_at"])
    except (ValueError, TypeError) as exc:
        return {
            "status": STATUS_INCONCLUSIVE,
            "reasons": [f"finished_at is not a parseable timestamp: {exc}"],
            "tool": record.get("tool"),
            "finished_at": record.get("finished_at"),
        }

    exit_code = record["exit_code"]
    if not isinstance(exit_code, int):
        return {
            "status": STATUS_INCONCLUSIVE,
            "reasons": [f"exit_code is {exit_code!r}, expected an integer"],
            "tool": record["tool"],
            "finished_at": record["finished_at"],
        }

    if exit_code != 0:
        return {
            "status": STATUS_FAILED,
            "reasons": [f"{record['tool']} exited {exit_code}"],
            "tool": record["tool"],
            "finished_at": record["finished_at"],
        }

    artifact = record.get("artifact")
    if artifact is None:
        return {
            "status": STATUS_INCONCLUSIVE,
            "reasons": ["exit code was 0 but no artifact was reported to check against it"],
            "tool": record["tool"],
            "finished_at": record["finished_at"],
        }
    if not artifact.get("exists"):
        return {
            "status": STATUS_SUSPICIOUS,
            "reasons": [f"{record['tool']} exited 0 but the expected artifact does not exist"],
            "tool": record["tool"],
            "finished_at": record["finished_at"],
        }

    expected = record.get("expected") or {}
    size_bytes = artifact.get("size_bytes")
    min_size = expected.get("min_size_bytes")
    if min_size is not None and (size_bytes is None or size_bytes < min_size):
        reasons.append(
            f"artifact is {size_bytes if size_bytes is not None else 'an unknown number of'} "
            f"bytes, below the expected minimum of {min_size}"
        )

    modified_at = artifact.get("modified_at")
    max_age_hours = expected.get("max_age_hours")
    if max_age_hours is not None:
        if not modified_at:
            reasons.append("expected.max_age_hours was set but the artifact has no modified_at to check")
        else:
            try:
                age_hours = (finished_at - _parse_timestamp(modified_at)).total_seconds() / 3600
            except (ValueError, TypeError) as exc:
                reasons.append(f"artifact.modified_at is not a parseable timestamp: {exc}")
            else:
                if age_hours < 0:
                    reasons.append(
                        f"artifact.modified_at is {abs(age_hours):.1f}h after finished_at "
                        "-- clock skew or a mismatched record"
                    )
                elif age_hours > max_age_hours:
                    reasons.append(
                        f"artifact is {age_hours:.1f}h old, older than the expected "
                        f"{max_age_hours}h -- this run may have reused a stale file "
                        "rather than writing a fresh one"
                    )

    if reasons:
        return {
            "status": STATUS_SUSPICIOUS,
            "reasons": reasons,
            "tool": record["tool"],
            "finished_at": record["finished_at"],
        }

    return {
        "status": STATUS_VERIFIED,
        "reasons": ["exit code 0, artifact exists, and size/age expectations (if any) were met"],
        "tool": record["tool"],
        "finished_at": record["finished_at"],
    }


def build_history_report(records: list[dict[str, Any]]) -> dict[str, Any]:
    """Classify a list of run records and summarize the most recent one.

    Records are sorted by `finished_at` where parseable; unparseable timestamps
    sort last and are still classified (as inconclusive) rather than dropped.
    """

    def sort_key(record: dict[str, Any]) -> tuple[int, str]:
        try:
            _parse_timestamp(str(record.get("finished_at", "")))
        except (ValueError, TypeError):
            return (1, str(record.get("finished_at", "")))
        return (0, record["finished_at"])

    ordered = sorted(records, key=sort_key)
    findings = [classify_run(record) for record in ordered]
    counts: dict[str, int] = {}
    for finding in findings:
        counts[finding["status"]] = counts.get(finding["status"], 0) + 1

    latest = findings[-1] if findings else None
    return {
        "generated_at": None,
        "run_count": len(findings),
        "status_counts": counts,
        "latest": latest,
        "findings": findings,
        "limitations": [
            "This reports what the supplied run records and artifact stats show.",
            "It does not verify that the backup contents are complete, uncorrupted, "
            "or restorable -- only that the job exited cleanly and produced an "
            "artifact meeting the size/age expectations given to it.",
            "A run with no record is invisible to this tool; a missed backup with "
            "no attempt looks identical to a backup schedule that was never configured.",
        ],
    }


def markdown_report(report: dict[str, Any]) -> str:
    lines = [
        "# Backup verification evidence",
        "",
        "This is an observation record, not a guarantee that your data is safe "
        "or restorable.",
        "",
        "## Summary",
        "",
    ]
    counts = report["status_counts"]
    lines.append(
        " · ".join(
            f"**{status}:** {counts.get(status, 0)}"
            for status in (STATUS_VERIFIED, STATUS_SUSPICIOUS, STATUS_FAILED, STATUS_INCONCLUSIVE)
        )
    )
    latest = report.get("latest")
    if latest:
        lines.extend(
            [
                "",
                f"**Most recent run ({latest.get('finished_at')}): {latest['status'].upper()}**",
            ]
        )
        lines.extend(f"- {reason}" for reason in latest["reasons"])
    lines.extend(["", "## All runs", "", "| Finished at | Tool | Status | Reasons |", "|---|---|---|---|"])
    for finding in report["findings"]:
        reasons = "; ".join(finding["reasons"])
        lines.append(f"| {finding.get('finished_at')} | {finding.get('tool')} | **{finding['status']}** | {reasons} |")
    lines.extend(["", "## Limits", ""])
    lines.extend(f"- {limit}" for limit in report["limitations"])
    return "\n".join(lines) + "\n"
