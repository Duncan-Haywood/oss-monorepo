#!/usr/bin/env python3
"""Normalize a customer-authorized Shopify app export into an inventory record.

This is a local transform. It does not call Shopify, request credentials, or
infer granted scopes from an app name. Declared/requested scopes are preserved
separately and never copied into the granted `scopes` list that compare() uses.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

from permission_drift import validate_inventory, write_report


def _as_datetime_now(now: datetime | None) -> datetime:
    return now if now is not None else datetime.now(timezone.utc)


def _iso(now: datetime | None) -> str:
    stamp = _as_datetime_now(now)
    if stamp.tzinfo is None:
        stamp = stamp.replace(tzinfo=timezone.utc)
    return stamp.astimezone(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def parse_json(text: str) -> object:
    try:
        return json.loads(text)
    except json.JSONDecodeError as exc:
        raise ValueError(f"cannot read export: {exc}") from exc


def _unwrap_data(payload: object) -> object:
    if isinstance(payload, dict) and isinstance(payload.get("data"), dict):
        return payload["data"]
    return payload


def _nodes(container: object) -> list | None:
    if isinstance(container, list):
        return container
    if not isinstance(container, dict):
        return None
    if isinstance(container.get("nodes"), list):
        return container["nodes"]
    edges = container.get("edges")
    if isinstance(edges, list):
        nodes = []
        for edge in edges:
            if isinstance(edge, dict) and isinstance(edge.get("node"), dict):
                nodes.append(edge["node"])
            else:
                nodes.append(edge)
        return nodes
    return None


def extract_app_records(payload: object) -> list[dict] | None:
    """Return raw app/installation objects, or None if the shape is unknown."""
    if isinstance(payload, list):
        if payload and all(isinstance(item, dict) for item in payload):
            return payload
        if not payload:
            return []
        return None

    if not isinstance(payload, dict):
        return None

    if "apps" in payload and isinstance(payload["apps"], list):
        return payload["apps"]

    body = _unwrap_data(payload)
    if isinstance(body, dict):
        for key in ("appInstallations", "currentAppInstallations", "applications"):
            if key in body:
                nodes = _nodes(body[key])
                if nodes is not None:
                    return nodes
        if isinstance(body.get("currentAppInstallation"), dict):
            return [body["currentAppInstallation"]]
        if isinstance(body.get("apps"), list):
            return body["apps"]

    for key in ("appInstallations", "applications"):
        if key in payload:
            nodes = _nodes(payload[key])
            if nodes is not None:
                return nodes
    return None


# GraphQL enums whose action segment contains underscores. Splitting on the
# last "_" invents a different REST topic (CUSTOMERS_DATA_REQUEST →
# customers_data/request instead of customers/data_request) and makes an
# unchanged GraphQL vs REST inventory look like webhook drift.
_GRAPHQL_TOPIC_REST = {
    "APP_SCOPES_UPDATE": "app/scopes_update",
    "APP_SUBSCRIPTIONS_APPROACHING_CAPPED_AMOUNT": "app_subscriptions/approaching_capped_amount",
    "AUDIT_EVENTS_ADMIN_API_ACTIVITY": "audit_events/admin_api_activity",
    "CUSTOMERS_DATA_REQUEST": "customers/data_request",
    "CUSTOMERS_PURCHASING_SUMMARY": "customers/purchasing_summary",
    "DISCOUNTS_REDEEMCODE_ADDED": "discounts/redeemcode_added",
    "DISCOUNTS_REDEEMCODE_REMOVED": "discounts/redeemcode_removed",
    "FULFILLMENT_ORDERS_CANCELLATION_REQUEST_ACCEPTED": "fulfillment_orders/cancellation_request_accepted",
    "FULFILLMENT_ORDERS_CANCELLATION_REQUEST_REJECTED": "fulfillment_orders/cancellation_request_rejected",
    "FULFILLMENT_ORDERS_CANCELLATION_REQUEST_SUBMITTED": "fulfillment_orders/cancellation_request_submitted",
    "FULFILLMENT_ORDERS_FULFILLMENT_REQUEST_ACCEPTED": "fulfillment_orders/fulfillment_request_accepted",
    "FULFILLMENT_ORDERS_FULFILLMENT_REQUEST_REJECTED": "fulfillment_orders/fulfillment_request_rejected",
    "FULFILLMENT_ORDERS_FULFILLMENT_REQUEST_SUBMITTED": "fulfillment_orders/fulfillment_request_submitted",
    "FULFILLMENT_ORDERS_FULFILLMENT_SERVICE_FAILED_TO_COMPLETE": "fulfillment_orders/fulfillment_service_failed_to_complete",
    "FULFILLMENT_ORDERS_HOLD_RELEASED": "fulfillment_orders/hold_released",
    "FULFILLMENT_ORDERS_LINE_ITEMS_PREPARED_FOR_LOCAL_DELIVERY": "fulfillment_orders/line_items_prepared_for_local_delivery",
    "FULFILLMENT_ORDERS_LINE_ITEMS_PREPARED_FOR_PICKUP": "fulfillment_orders/line_items_prepared_for_pickup",
    "FULFILLMENT_ORDERS_ORDER_ROUTING_COMPLETE": "fulfillment_orders/order_routing_complete",
    "FULFILLMENT_ORDERS_PLACED_ON_HOLD": "fulfillment_orders/placed_on_hold",
    "FULFILLMENT_ORDERS_SCHEDULED_FULFILLMENT_ORDER_READY": "fulfillment_orders/scheduled_fulfillment_order_ready",
    "INVENTORY_SHIPMENTS_ADD_ITEMS": "inventory_shipments/add_items",
    "INVENTORY_SHIPMENTS_MARK_IN_TRANSIT": "inventory_shipments/mark_in_transit",
    "INVENTORY_SHIPMENTS_RECEIVE_ITEMS": "inventory_shipments/receive_items",
    "INVENTORY_SHIPMENTS_REMOVE_ITEMS": "inventory_shipments/remove_items",
    "INVENTORY_SHIPMENTS_UPDATE_ITEM_QUANTITIES": "inventory_shipments/update_item_quantities",
    "INVENTORY_SHIPMENTS_UPDATE_TRACKING": "inventory_shipments/update_tracking",
    "INVENTORY_TRANSFERS_ADD_ITEMS": "inventory_transfers/add_items",
    "INVENTORY_TRANSFERS_READY_TO_SHIP": "inventory_transfers/ready_to_ship",
    "INVENTORY_TRANSFERS_REMOVE_ITEMS": "inventory_transfers/remove_items",
    "INVENTORY_TRANSFERS_UPDATE_ITEM_QUANTITIES": "inventory_transfers/update_item_quantities",
    "ORDERS_PARTIALLY_FULFILLED": "orders/partially_fulfilled",
    "ORDERS_RISK_ASSESSMENT_CHANGED": "orders/risk_assessment_changed",
    "ORDERS_SHOPIFY_PROTECT_ELIGIBILITY_CHANGED": "orders/shopify_protect_eligibility_changed",
    "PRODUCT_FEEDS_FULL_SYNC": "product_feeds/full_sync",
    "PRODUCT_FEEDS_FULL_SYNC_FINISH": "product_feeds/full_sync_finish",
    "PRODUCT_FEEDS_INCREMENTAL_SYNC": "product_feeds/incremental_sync",
    "REVERSE_DELIVERIES_ATTACH_DELIVERABLE": "reverse_deliveries/attach_deliverable",
    "VARIANTS_IN_STOCK": "variants/in_stock",
    "VARIANTS_OUT_OF_STOCK": "variants/out_of_stock",
}


def canonicalize_topic(topic: str) -> str:
    """Map GraphQL enum topics (APP_UNINSTALLED) to REST-style topics (app/uninstalled).

    Already-slashed topics are left alone. This is a format translation, not an
    invented subscription. Topics whose action contains underscores need an
    explicit map; a last-"_" split invents false webhook drift.
    """
    if "/" in topic or not topic:
        return topic
    if topic in _GRAPHQL_TOPIC_REST:
        return _GRAPHQL_TOPIC_REST[topic]
    if topic.isupper() and "_" in topic:
        resource, action = topic.rsplit("_", 1)
        return f"{resource.lower()}/{action.lower()}"
    return topic


def _string_list(value: object, *, field: str, app_id: str) -> list[str]:
    if value is None:
        raise ValueError(f"app {app_id} is missing {field}")
    items: list[str] = []
    if isinstance(value, str):
        items = [part.strip() for part in value.split(",") if part.strip()]
    elif isinstance(value, list):
        for item in value:
            if isinstance(item, str) and item.strip():
                items.append(item.strip())
            elif isinstance(item, dict):
                handle = item.get("handle") or item.get("topic") or item.get("name")
                if isinstance(handle, str) and handle.strip():
                    items.append(handle.strip())
                else:
                    raise ValueError(f"app {app_id} {field} entries must be strings or objects with handle/topic")
            else:
                raise ValueError(f"app {app_id} must contain a string {field} list")
    else:
        raise ValueError(f"app {app_id} {field} must be a string or list")
    if field == "webhooks":
        items = [canonicalize_topic(item) for item in items]
    if len(items) != len(set(items)):
        raise ValueError(f"app {app_id} contains duplicate {field}")
    return items


def _scope_value(app: dict) -> object | None:
    for key in ("scopes", "accessScopes", "access_scopes", "granted_scopes", "grantedScopes"):
        if key in app:
            return app[key]
    return None


def _declared_value(app: dict) -> object | None:
    for key in ("declared_scopes", "declaredScopes", "requestedAccessScopes", "requested_access_scopes"):
        if key in app:
            return app[key]
    nested = app.get("app")
    if isinstance(nested, dict):
        for key in ("requestedAccessScopes", "requested_access_scopes", "declared_scopes"):
            if key in nested:
                return nested[key]
    return None


def _webhook_value(app: dict) -> tuple[object | None, bool]:
    """Return (value, present). present is False when the export omitted webhooks."""
    for key in ("webhooks", "webhook_topics", "webhookTopics"):
        if key in app:
            return app[key], True
    subscriptions = app.get("webhookSubscriptions")
    if subscriptions is not None:
        nodes = _nodes(subscriptions)
        if nodes is None:
            return subscriptions, True
        return nodes, True
    return None, False


def _app_id(app: dict) -> str:
    nested = app.get("app") if isinstance(app.get("app"), dict) else {}
    for candidate in (
        app.get("handle"),
        nested.get("handle"),
        app.get("id"),
        nested.get("id"),
        app.get("api_key"),
        app.get("apiKey"),
        app.get("api_client_id"),
        app.get("client_id"),
    ):
        if isinstance(candidate, str) and candidate.strip():
            return candidate.strip()
        if isinstance(candidate, int):
            return str(candidate)
    raise ValueError("each app must have a non-empty string id")


def normalize_app(app: dict) -> dict:
    if not isinstance(app, dict):
        raise ValueError("each app must be an object")
    app_id = _app_id(app)
    granted = _scope_value(app)
    declared = _declared_value(app)
    if granted is None and declared is not None:
        raise ValueError(
            f"app {app_id} has declared scopes but no granted scopes; "
            "refusing to treat declared scopes as granted"
        )
    if granted is None:
        raise ValueError(f"app {app_id} is missing granted scopes")
    scopes = _string_list(granted, field="scopes", app_id=app_id)
    webhooks_value, webhooks_present = _webhook_value(app)
    record = {"id": app_id, "scopes": scopes, "webhooks": _string_list(webhooks_value, field="webhooks", app_id=app_id) if webhooks_present else []}
    if declared is not None:
        record["declared_scopes"] = _string_list(declared, field="declared_scopes", app_id=app_id)
    # A normalized capture uses [] for omitted webhooks; preserve that uncertainty.
    if not webhooks_present or app.get("webhook_coverage") == "absent":
        record["webhook_coverage"] = "absent"
    else:
        record["webhook_coverage"] = "complete"
    return record


def infer_source(payload: object) -> str:
    body = _unwrap_data(payload)
    if isinstance(payload, dict) and isinstance(payload.get("source"), str) and payload["source"].strip():
        return payload["source"].strip()
    if isinstance(body, dict) and ("appInstallations" in body or "currentAppInstallation" in body):
        return "shopify-app-installations"
    if isinstance(payload, dict) and "applications" in payload:
        return "shopify-applications-export"
    return "normalized-export"


def is_canonical_inventory(payload: object) -> bool:
    return isinstance(payload, dict) and all(key in payload for key in ("captured_at", "api_version", "source", "authorization_state", "apps"))


def normalize_export(
    payload: object,
    *,
    captured_at: str | None = None,
    api_version: str | None = None,
    source: str | None = None,
    authorization_state: str | None = None,
    now: datetime | None = None,
) -> dict:
    if is_canonical_inventory(payload):
        inventory = {
            "captured_at": captured_at or payload["captured_at"],
            "api_version": api_version or payload["api_version"],
            "source": source or payload["source"],
            "authorization_state": authorization_state or payload["authorization_state"],
            "apps": [normalize_app(app) if isinstance(app, dict) else app for app in payload["apps"]],
        }
        if isinstance(payload.get("limitations"), list):
            inventory["limitations"] = list(payload["limitations"])
        validate_inventory(inventory)
        _mapping_ids(inventory["apps"])
        return inventory

    records = extract_app_records(payload)
    if records is None:
        raise ValueError("export is not a Shopify app inventory or appInstallations payload")

    apps = [normalize_app(app) for app in records]
    _mapping_ids(apps)

    payload_meta = payload if isinstance(payload, dict) else {}
    resolved_api_version = api_version or (payload_meta.get("api_version") if isinstance(payload_meta.get("api_version"), str) else None)
    if not resolved_api_version or not str(resolved_api_version).strip():
        raise ValueError("export does not include api_version; pass --api-version rather than guessing")

    limitations = []
    if any(app.get("webhook_coverage") == "absent" for app in apps):
        limitations.append("webhooks_not_in_export")

    inventory = {
        "captured_at": captured_at or (payload_meta.get("captured_at") if isinstance(payload_meta.get("captured_at"), str) and payload_meta["captured_at"].strip() else _iso(now)),
        "api_version": str(resolved_api_version).strip(),
        "source": source or infer_source(payload),
        "authorization_state": authorization_state or (
            payload_meta["authorization_state"].strip()
            if isinstance(payload_meta.get("authorization_state"), str) and payload_meta["authorization_state"].strip()
            else "active"
        ),
        "apps": [{key: app[key] for key in app if key != "webhook_coverage"} | ({"webhook_coverage": app["webhook_coverage"]} if app.get("webhook_coverage") == "absent" else {}) for app in apps],
    }
    if limitations:
        inventory["limitations"] = limitations
    return validate_inventory(inventory)


def _mapping_ids(apps: list[dict]) -> None:
    seen = set()
    for app in apps:
        if not isinstance(app, dict) or not isinstance(app.get("id"), str) or not app["id"]:
            raise ValueError("each app must have a non-empty string id")
        if app["id"] in seen:
            raise ValueError(f"duplicate app id: {app['id']}")
        seen.add(app["id"])


def capture_summary(inventory: dict) -> str:
    lines = [
        "Shopify app inventory capture",
        f"Captured at: {inventory['captured_at']}",
        f"API version: {inventory['api_version']}",
        f"Source: {inventory['source']}",
        f"Authorization state: {inventory['authorization_state']}",
        f"Apps: {len(inventory['apps'])}",
    ]
    for app in inventory["apps"]:
        declared = f", declared {len(app['declared_scopes'])}" if isinstance(app.get("declared_scopes"), list) else ""
        webhook_note = " (webhooks not in export)" if app.get("webhook_coverage") == "absent" else ""
        lines.append(f"- {app['id']}: {len(app['scopes'])} granted scopes, {len(app['webhooks'])} webhooks{declared}{webhook_note}")
    if inventory.get("limitations"):
        lines.append("")
        lines.append("Limitations")
        lines.extend(f"- {item}" for item in inventory["limitations"])
        if "webhooks_not_in_export" in inventory["limitations"]:
            lines.append("Do not treat webhook diffs as evidence for this capture.")
    lines.append("")
    lines.append("Evidence only. This is not a Shopify API call, security certification, or policy interpretation.")
    return "\n".join(lines)


def usage_event(path: Path, app_count: int) -> None:
    event = {"event": "inventory_normalized", "day": datetime.now(timezone.utc).date().isoformat(), "app_count": app_count}
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(event, sort_keys=True) + "\n")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Normalize a customer-authorized Shopify app export into the inventory JSON compare() expects."
    )
    parser.add_argument("export", type=Path, nargs="?", help="JSON export path; omit to read stdin")
    parser.add_argument("--api-version", dest="api_version", help="Admin API version when the export omits it")
    parser.add_argument("--captured-at", dest="captured_at", help="ISO 8601 capture time; default is now or the export value")
    parser.add_argument("--source", help="override the source label stored on the inventory")
    parser.add_argument("--authorization-state", dest="authorization_state", help="override authorization_state")
    parser.add_argument("--output", type=Path, help="write the normalized inventory JSON")
    parser.add_argument("--format", choices=("text", "json"), default="text")
    parser.add_argument("--usage-log", type=Path, help="opt-in aggregate event log")
    args = parser.parse_args()
    try:
        raw = sys.stdin.read() if args.export is None else args.export.read_text(encoding="utf-8")
    except OSError as exc:
        parser.error(f"cannot read export: {exc}")
    try:
        inventory = normalize_export(
            parse_json(raw),
            captured_at=args.captured_at,
            api_version=args.api_version,
            source=args.source,
            authorization_state=args.authorization_state,
        )
    except ValueError as exc:
        parser.error(str(exc))
    if args.output:
        try:
            write_report(args.output, inventory)
        except ValueError as exc:
            parser.error(str(exc))
    if args.usage_log:
        usage_event(args.usage_log, len(inventory["apps"]))
    if args.format == "json":
        print(json.dumps(inventory, indent=2, sort_keys=True))
    else:
        print(capture_summary(inventory))
    return 0


if __name__ == "__main__":
    sys.exit(main())
