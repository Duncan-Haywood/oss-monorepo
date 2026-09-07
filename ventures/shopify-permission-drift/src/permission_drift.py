#!/usr/bin/env python3
"""Compare customer-authorized Shopify app inventory exports."""

import argparse
import json
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path
import sys


REQUIRED = ("captured_at", "api_version", "source", "authorization_state", "apps")
DISCLAIMER = (
    "No warranty. This tool is provided free and as-is, without warranty of any kind, "
    "express or implied. It is not legal, financial, security, or compliance advice, "
    "and it does not replace a qualified professional. You are responsible for reviewing "
    "and verifying its output before relying on it."
)


def validate_inventory(data: dict) -> dict:
    """Reject incomplete inventories so capture and compare share one schema."""
    if not isinstance(data, dict) or any(key not in data for key in REQUIRED):
        raise ValueError("inventory must include captured_at, api_version, source, authorization_state, and apps")
    for field in REQUIRED[:-1]:
        if not isinstance(data[field], str) or not data[field].strip():
            raise ValueError(f"inventory {field} must be a non-empty string")
    try:
        datetime.fromisoformat(data["captured_at"].replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError("inventory captured_at must be an ISO 8601 timestamp") from exc
    if not isinstance(data["apps"], list):
        raise ValueError("inventory apps must be a list")
    return data


def load_inventory(path: Path) -> dict:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ValueError(f"cannot read inventory: {exc}") from exc
    return validate_inventory(data)


def _mapping(inventory: dict) -> dict[str, dict]:
    result = {}
    for app in inventory["apps"]:
        if not isinstance(app, dict) or not isinstance(app.get("id"), str) or not app["id"]:
            raise ValueError("each app must have a non-empty string id")
        if app["id"] in result:
            raise ValueError(f"duplicate app id: {app['id']}")
        for field in ("scopes", "webhooks"):
            if not isinstance(app.get(field), list) or not all(isinstance(item, str) for item in app[field]):
                raise ValueError(f"app {app['id']} must contain a string {field} list")
            if len(app[field]) != len(set(app[field])):
                raise ValueError(f"app {app['id']} contains duplicate {field}")
        result[app["id"]] = app
    return result


def _webhooks_absent(app: dict) -> bool:
    """Capture marks omitted webhook lists as absent — empty [] is not evidence."""
    return app.get("webhook_coverage") == "absent"


def compare(before: dict, after: dict) -> dict:
    old, new = _mapping(before), _mapping(after)
    changes = []
    for app_id in sorted(set(old) | set(new)):
        if app_id not in old:
            changes.append({"app": app_id, "kind": "app_added"})
            continue
        if app_id not in new:
            changes.append({"app": app_id, "kind": "app_removed"})
            continue
        old_app, new_app = old[app_id], new[app_id]

        scope_added = sorted(set(new_app["scopes"]) - set(old_app["scopes"]))
        scope_removed = sorted(set(old_app["scopes"]) - set(new_app["scopes"]))
        if scope_added or scope_removed:
            changes.append(
                {
                    "app": app_id,
                    "kind": "scopes_changed",
                    "added": scope_added,
                    "removed": scope_removed,
                }
            )

        # Capture writes webhooks: [] and webhook_coverage: "absent" when the
        # export omitted webhookSubscriptions. Diffing that against a complete
        # inventory invents a "webhooks removed" finding — the failure mode the
        # coverage flag exists to prevent. Skip the diff and say so instead.
        if _webhooks_absent(old_app) or _webhooks_absent(new_app):
            changes.append(
                {
                    "app": app_id,
                    "kind": "webhooks_not_compared",
                    "reason": "webhook_coverage_absent",
                    "before_coverage": "absent" if _webhooks_absent(old_app) else "complete",
                    "after_coverage": "absent" if _webhooks_absent(new_app) else "complete",
                }
            )
        else:
            added = sorted(set(new_app["webhooks"]) - set(old_app["webhooks"]))
            removed = sorted(set(old_app["webhooks"]) - set(new_app["webhooks"]))
            if added or removed:
                changes.append(
                    {
                        "app": app_id,
                        "kind": "webhooks_changed",
                        "added": added,
                        "removed": removed,
                    }
                )
    for field in ("authorization_state", "api_version"):
        if before[field] != after[field]:
            changes.append({"kind": f"{field}_changed", "before": before[field], "after": after[field]})
    before_captured = datetime.fromisoformat(before["captured_at"].replace("Z", "+00:00"))
    after_captured = datetime.fromisoformat(after["captured_at"].replace("Z", "+00:00"))
    if after_captured < before_captured:
        changes.append({"kind": "capture_order_invalid", "before": before["captured_at"], "after": after["captured_at"]})
    metadata = {"before_source": before["source"], "after_source": after["source"], "before_captured_at": before["captured_at"], "after_captured_at": after["captured_at"]}
    # Order invalid, or webhooks skipped with no other material drift: we cannot
    # claim "unchanged" (webhooks were never compared) or a clean "changed".
    order_invalid = any(change["kind"] == "capture_order_invalid" for change in changes)
    material = any(
        change["kind"] not in ("capture_order_invalid", "webhooks_not_compared") for change in changes
    )
    webhooks_skipped = any(change["kind"] == "webhooks_not_compared" for change in changes)
    if order_invalid or (webhooks_skipped and not material):
        status = "inconclusive"
    elif material:
        status = "changed"
    else:
        status = "unchanged"
    return {"status": status, "metadata": metadata, "changes": changes, "review_required": bool(changes)}


def usage_event(path: Path, finding_count: int) -> None:
    event = {"event": "inventory_compared", "day": datetime.now(timezone.utc).date().isoformat(), "finding_count": finding_count}
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(event, sort_keys=True) + "\n")


def write_report(path: Path, report: dict) -> None:
    """Persist a portable JSON evidence report without adding customer data.

    The file is written to a sibling temporary name and replaced atomically so
    a ticket or CI consumer never sees a truncated artifact.
    """
    target = Path(path)
    temporary: str | None = None
    try:
        target.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            dir=target.parent,
            prefix=f".{target.name}.",
            delete=False,
        ) as handle:
            temporary = handle.name
            handle.write(json.dumps(report, indent=2, sort_keys=True) + "\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, target)
        temporary = None
    except OSError as exc:
        raise ValueError(f"cannot write report: {exc}") from exc
    finally:
        if temporary:
            try:
                os.unlink(temporary)
            except OSError:
                pass


def render_markdown(report: dict) -> str:
    """Render a report that can be pasted into an approval ticket."""
    metadata = report["metadata"]
    lines = [
        f"# Shopify permission drift: {report['status']}",
        "",
        f"- **Review required:** {'yes' if report['review_required'] else 'no'}",
        f"- **Before:** `{metadata['before_source']}` ({metadata['before_captured_at']})",
        f"- **After:** `{metadata['after_source']}` ({metadata['after_captured_at']})",
        "",
    ]
    if report["changes"]:
        lines.append("## Changes")
        lines.append("")
        for change in report["changes"]:
            kind = change["kind"].replace("_", " ")
            if change["kind"] == "webhooks_not_compared":
                lines.append(
                    f"- **Webhooks Not Compared** for `{change['app']}` "
                    f"(coverage `{change['before_coverage']}` → `{change['after_coverage']}`; "
                    "do not treat webhook diffs as evidence)"
                )
            elif kind.endswith(" changed") and "added" in change:
                detail = []
                if change["added"]:
                    detail.append("added: " + ", ".join(f"`{item}`" for item in change["added"]))
                if change["removed"]:
                    detail.append("removed: " + ", ".join(f"`{item}`" for item in change["removed"]))
                lines.append(f"- **{kind.title()}** for `{change['app']}` ({'; '.join(detail)})")
            elif "app" in change:
                lines.append(f"- **{kind.title()}**: `{change['app']}`")
            else:
                lines.append(f"- **{kind.title()}**: `{change['before']}` -> `{change['after']}`")
        lines.append("")
    else:
        lines.extend(["No app, scope, webhook, authorization-state, or API-version changes were found.", ""])
    lines.extend(["> Evidence only: the merchant decides what each change means.", ">", f"> {DISCLAIMER}"])
    return "\n".join(lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Compare two customer-authorized Shopify app inventory exports.",
        epilog=DISCLAIMER,
    )
    parser.add_argument("before", type=Path)
    parser.add_argument("after", type=Path)
    parser.add_argument("--format", choices=("text", "markdown", "json", "github"), default="text")
    parser.add_argument("--output", type=Path, help="write the report as a portable JSON artifact")
    parser.add_argument("--usage-log", type=Path, help="opt-in aggregate event log")
    args = parser.parse_args()
    try:
        report = compare(load_inventory(args.before), load_inventory(args.after))
    except ValueError as exc:
        parser.error(str(exc))
    if args.output:
        try:
            write_report(args.output, report)
        except ValueError as exc:
            parser.error(str(exc))
    if args.usage_log:
        usage_event(args.usage_log, len(report["changes"]))
    if args.format == "json":
        print(json.dumps(report, indent=2, sort_keys=True))
    elif args.format == "markdown":
        print(render_markdown(report), end="")
    elif args.format == "github":
        # json.dumps escapes newlines, so a change carrying one cannot end the
        # workflow command early and inject a second one.
        for change in report["changes"]:
            print(f"::warning title=Shopify permission drift::{json.dumps(change, sort_keys=True)}")
        if not report["changes"]:
            print("No Shopify permission drift detected.")
    else:
        print(f"Status: {report['status']}")
        print("Review required: yes" if report["review_required"] else "Review required: no")
        for change in report["changes"]:
            print(f"- {change}")
        print("Evidence only: the merchant decides what each change means.")
        print(DISCLAIMER)
    return 0


if __name__ == "__main__":
    sys.exit(main())
