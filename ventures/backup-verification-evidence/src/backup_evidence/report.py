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

from . import integrity as integrity_mod

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


def classify_run(record: dict[str, Any], *, require_integrity: bool = False) -> dict[str, Any]:
    """Classify one backup run record. Never raises on customer-supplied input.

    `record` shape (all customer-supplied, nothing fetched or inferred):
      tool: str -- name of the backup tool that ran (restic, borg, pg_dump, ...)
      exit_code: int | null
      finished_at: str -- ISO-8601 timestamp
      artifact: {exists: bool, size_bytes: int, modified_at: str,
                 integrity: {result, format, detail} | null} | null
      expected: {max_age_hours: number, min_size_bytes: int} | null -- both optional
      log_tail: str -- last lines of the tool's own output, for context only.
                Absent unless the operator passed `record --include-log-tail`:
                backup output can carry paths, hostnames, or application data,
                so it is kept out of the durable record by default.
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

    # Structural integrity, if it was checked, outranks size and age: those are
    # proxies for "the writer finished", and this is the direct measurement. A
    # provably corrupt artifact is a failed backup even though the command said
    # 0, so it is reported as `failed` rather than softened to `suspicious` --
    # there is nothing ambiguous about a checksum that did not match.
    integrity = artifact.get("integrity") or {}
    integrity_result = integrity.get("result")
    if integrity_result == integrity_mod.CORRUPT:
        return {
            "status": STATUS_FAILED,
            "reasons": [
                f"{record['tool']} exited 0 but the artifact is not intact: "
                f"{integrity.get('detail', 'the integrity check failed')}"
            ],
            "tool": record["tool"],
            "finished_at": record["finished_at"],
            "integrity": integrity,
        }
    if integrity_result == integrity_mod.INCONCLUSIVE:
        reasons.append(
            f"the artifact's integrity could not be established: "
            f"{integrity.get('detail', 'the integrity check did not complete')}"
        )

    if require_integrity and integrity_result != integrity_mod.INTACT:
        if integrity_result == integrity_mod.UNSUPPORTED:
            reason = "the artifact format is unsupported by this tool"
        elif integrity_result == integrity_mod.INCONCLUSIVE:
            reason = "the integrity read did not reach a conclusive end"
        else:
            reason = "no end-to-end integrity check was recorded"
        return {
            "status": STATUS_INCONCLUSIVE,
            "reasons": [f"integrity is required, but {reason}"],
            "tool": record["tool"],
            "finished_at": record["finished_at"],
            "integrity": integrity,
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
    parsed_modified_at: datetime | None = None
    if modified_at:
        try:
            parsed_modified_at = _parse_timestamp(modified_at)
        except (ValueError, TypeError) as exc:
            reasons.append(f"artifact.modified_at is not a parseable timestamp: {exc}")

    max_age_hours = expected.get("max_age_hours")
    if max_age_hours is not None:
        if not modified_at:
            reasons.append("expected.max_age_hours was set but the artifact has no modified_at to check")
        elif parsed_modified_at is not None:
            age_hours = (finished_at - parsed_modified_at).total_seconds() / 3600
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

    # A wide max_age_hours (needed to tolerate normal cadence jitter) can still
    # be wide enough to miss a run that silently reused the previous run's
    # artifact untouched. Independent of that threshold: if we know when this
    # run started, an artifact not touched since strongly suggests reuse.
    started_at = record.get("started_at")
    if started_at and parsed_modified_at is not None:
        try:
            parsed_started_at = _parse_timestamp(started_at)
        except (ValueError, TypeError) as exc:
            reasons.append(f"started_at is not a parseable timestamp: {exc}")
        else:
            if parsed_modified_at < parsed_started_at:
                reasons.append(
                    f"artifact.modified_at ({modified_at}) is before this run's "
                    f"started_at ({started_at}) -- the artifact was not written "
                    "during this run and may be reused from an earlier one"
                )

    if reasons:
        return {
            "status": STATUS_SUSPICIOUS,
            "reasons": reasons,
            "tool": record["tool"],
            "finished_at": record["finished_at"],
            "integrity": integrity,
        }

    # Say which of the two grades of `verified` this is. They are not the same
    # claim, and a reader deciding whether to trust the result deserves to know
    # whether anything actually opened the file.
    verified_reason = "exit code 0, artifact exists, and size/age expectations (if any) were met"
    if integrity_result == integrity_mod.INTACT:
        verified_reason += (
            f"; the artifact was also read end-to-end and is structurally intact "
            f"({integrity.get('detail', '')})"
        )
    elif integrity_result == integrity_mod.UNSUPPORTED:
        verified_reason += (
            f"; structural integrity was not checked -- {integrity.get('detail', '')}"
        )
    else:
        verified_reason += "; the artifact's contents were not opened or checked"

    return {
        "status": STATUS_VERIFIED,
        "reasons": [verified_reason],
        "tool": record["tool"],
        "finished_at": record["finished_at"],
        "integrity": integrity,
    }


def build_history_report(
    records: list[dict[str, Any]], *, require_integrity: bool = False
) -> dict[str, Any]:
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
    findings = [classify_run(record, require_integrity=require_integrity) for record in ordered]
    counts: dict[str, int] = {}
    for finding in findings:
        counts[finding["status"]] = counts.get(finding["status"], 0) + 1

    latest = findings[-1] if findings else None

    # The honest limitation text differs depending on whether anything actually
    # opened the artifacts. Printing the weaker disclaimer over an integrity-
    # checked run would undersell it; printing the stronger one over a stat-only
    # run would be a false claim. So the report says which it is.
    any_integrity = any(
        (finding.get("integrity") or {}).get("result")
        in (integrity_mod.INTACT, integrity_mod.CORRUPT)
        for finding in findings
    )
    limitations = ["This reports what the supplied run records and artifact stats show."]
    if any_integrity:
        limitations.append(
            "Where an integrity check ran, `intact` means the artifact decompressed "
            "and/or parsed to its end with every checksum the format carries matching "
            "-- evidence the writer finished. It still does not mean the backup holds "
            "the right data or that a restore will succeed; an intact archive of the "
            "wrong database is intact. Test restores separately."
        )
    else:
        limitations.append(
            "It does not verify that the backup contents are complete, uncorrupted, "
            "or restorable -- only that the job exited cleanly and produced an "
            "artifact meeting the size/age expectations given to it. Pass "
            "--verify-integrity to also read the artifact itself."
        )
    limitations.append(
        "A run with no record is invisible to this tool; a missed backup with "
        "no attempt looks identical to a backup schedule that was never configured."
    )

    return {
        "generated_at": None,
        "run_count": len(findings),
        "status_counts": counts,
        "latest": latest,
        "findings": findings,
        "limitations": limitations,
        "require_integrity": require_integrity,
    }


DEFAULT_SHRINK_RATIO = 0.20

_STATUS_SEVERITY = {
    STATUS_VERIFIED: 0,
    STATUS_INCONCLUSIVE: 1,
    STATUS_SUSPICIOUS: 2,
    STATUS_FAILED: 3,
}


def _artifact_size_bytes(record: dict[str, Any]) -> int | None:
    artifact = record.get("artifact") or {}
    size = artifact.get("size_bytes")
    if isinstance(size, bool) or not isinstance(size, (int, float)):
        return None
    if size < 0:
        return None
    return int(size)


def _median(values: list[int]) -> float:
    ordered = sorted(values)
    count = len(ordered)
    mid = count // 2
    if count % 2:
        return float(ordered[mid])
    return (ordered[mid - 1] + ordered[mid]) / 2


def _ordered_records(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    def sort_key(record: dict[str, Any]) -> tuple[int, str]:
        try:
            _parse_timestamp(str(record.get("finished_at", "")))
        except (ValueError, TypeError):
            return (1, str(record.get("finished_at", "")))
        return (0, str(record["finished_at"]))

    return sorted(records, key=sort_key)


def build_trend(
    records: list[dict[str, Any]],
    shrink_ratio: float = DEFAULT_SHRINK_RATIO,
) -> dict[str, Any]:
    """Compare consecutive nights so a shrinking-but-green backup is visible.

    A run can be `verified` (exit 0, size floor met) while the archive is
    half yesterday's size -- a dropped table, a failed incremental, a
    destination that filled up mid-write then recovered enough to look
    "big enough". Per-run classification cannot see that. This does not
    certify that growth is healthy; it only flags drops of `shrink_ratio`
    (default 20%) versus the previous night or the median of prior nights.
    """
    if not isinstance(shrink_ratio, (int, float)) or not (0 < float(shrink_ratio) < 1):
        shrink_ratio = DEFAULT_SHRINK_RATIO
    else:
        shrink_ratio = float(shrink_ratio)

    ordered = _ordered_records(records)
    findings = [classify_run(record) for record in ordered]
    rows: list[dict[str, Any]] = []
    alerts: list[dict[str, Any]] = []
    previous_size: int | None = None
    previous_status: str | None = None
    previous_finished: Any = None
    prior_sizes: list[int] = []

    for record, finding in zip(ordered, findings):
        size = _artifact_size_bytes(record)
        size_change_pct = None
        shrinking_vs_previous = False
        shrinking_vs_median = False
        status_regression = False

        if previous_size is not None and size is not None and previous_size > 0:
            size_change_pct = round(((size - previous_size) / previous_size) * 100, 1)
            if size <= previous_size * (1 - shrink_ratio):
                shrinking_vs_previous = True
                alerts.append(
                    {
                        "kind": "shrinking_vs_previous",
                        "finished_at": finding.get("finished_at"),
                        "detail": (
                            f"{finding.get('finished_at')} is {abs(size_change_pct):.1f}% smaller "
                            f"than the previous run ({previous_finished}) -- "
                            f"{previous_size} bytes to {size} bytes"
                        ),
                    }
                )

        if size is not None and len(prior_sizes) >= 3:
            median = _median(prior_sizes)
            if median > 0 and size <= median * (1 - shrink_ratio):
                drop_pct = round(((median - size) / median) * 100, 1)
                shrinking_vs_median = True
                alerts.append(
                    {
                        "kind": "shrinking_vs_median",
                        "finished_at": finding.get("finished_at"),
                        "detail": (
                            f"{finding.get('finished_at')} is {drop_pct:.1f}% below the "
                            f"median of the previous {len(prior_sizes)} night(s) "
                            f"({int(median)} bytes to {size} bytes)"
                        ),
                    }
                )

        previous_severity = _STATUS_SEVERITY.get(previous_status or "", -1)
        current_severity = _STATUS_SEVERITY.get(finding["status"], 0)
        if previous_status is not None and current_severity > previous_severity:
            status_regression = True
            alerts.append(
                {
                    "kind": "status_regression",
                    "finished_at": finding.get("finished_at"),
                    "detail": (
                        f"{finding.get('finished_at')} worsened from {previous_status} "
                        f"to {finding['status']}"
                    ),
                }
            )

        rows.append(
            {
                "finished_at": finding.get("finished_at"),
                "tool": finding.get("tool"),
                "status": finding["status"],
                "size_bytes": size,
                "previous_size_bytes": previous_size,
                "size_change_pct": size_change_pct,
                "shrinking_vs_previous": shrinking_vs_previous,
                "shrinking_vs_median": shrinking_vs_median,
                "status_regression": status_regression,
            }
        )

        if size is not None:
            prior_sizes.append(size)
            previous_size = size
        previous_status = finding["status"]
        previous_finished = finding.get("finished_at")

    return {
        "shrink_ratio": shrink_ratio,
        "row_count": len(rows),
        "alert_count": len(alerts),
        "latest": rows[-1] if rows else None,
        "rows": rows,
        "alerts": alerts,
        "limitations": [
            "A size drop is an observation, not a determination that data was lost.",
            "Incremental backups and retention pruning can shrink a repository on purpose.",
            f"Only drops of {int(round(shrink_ratio * 100))}% or more versus the previous "
            "night or the prior-night median are flagged.",
            "This does not replace a test restore.",
        ],
    }


def _cell(value: Any) -> str:
    """Make a value safe to drop into a markdown table cell.

    Tool names and reasons routinely contain a pipe -- `pg_dump|gzip` is the
    canonical example, and it is exactly the pipeline this tool exists to catch
    failing -- which silently shears the rest of the row into extra columns.
    Newlines in a log-derived reason do the same to the row itself.
    """
    return str(value).replace("|", "\\|").replace("\n", " ")


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
        reasons = _cell("; ".join(finding["reasons"]))
        lines.append(
            f"| {_cell(finding.get('finished_at'))} | {_cell(finding.get('tool'))} "
            f"| **{finding['status']}** | {reasons} |"
        )
    trend = report.get("trend")
    if trend:
        lines.extend(["", "## Night-over-night trend", ""])
        if trend["alerts"]:
            lines.append("**Alerts**")
            lines.extend(f"- {alert['detail']}" for alert in trend["alerts"])
            lines.append("")
        else:
            lines.append("No size drop or status regression crossed the trend threshold.")
            lines.append("")
        lines.extend(
            [
                "| Finished at | Status | Size | vs previous | Flags |",
                "|---|---|---|---|---|",
            ]
        )
        for row in trend["rows"]:
            size = "unknown" if row["size_bytes"] is None else f"{row['size_bytes']} bytes"
            change = "—" if row["size_change_pct"] is None else f"{row['size_change_pct']:+.1f}%"
            flags = []
            if row["shrinking_vs_previous"]:
                flags.append("smaller than previous")
            if row["shrinking_vs_median"]:
                flags.append("below prior median")
            if row["status_regression"]:
                flags.append("status worsened")
            lines.append(
                f"| {_cell(row.get('finished_at'))} | **{row['status']}** | {_cell(size)} "
                f"| {_cell(change)} | {_cell(', '.join(flags) or '—')} |"
            )
        lines.append("")
        lines.extend(f"- {limit}" for limit in trend["limitations"])
    lines.extend(["", "## Limits", ""])
    lines.extend(f"- {limit}" for limit in report["limitations"])
    return "\n".join(lines) + "\n"
