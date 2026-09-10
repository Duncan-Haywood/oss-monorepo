import json
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).parents[1] / "src"))
from capture_inventory import (
    canonicalize_topic,
    capture_summary,
    infer_source,
    normalize_export,
    parse_json,
    usage_event,
)
from permission_drift import compare, load_inventory


class CaptureInventoryTests(unittest.TestCase):
    def setUp(self):
        self.root = Path(__file__).parents[1]
        self.dump = json.loads((self.root / "examples/app-installations.json").read_text(encoding="utf-8"))
        self.before = load_inventory(self.root / "examples/before.json")

    def test_normalizes_app_installations_graphql(self):
        inventory = normalize_export(self.dump)
        self.assertEqual(inventory["api_version"], "2026-07")
        self.assertEqual(inventory["source"], "shopify-app-installations")
        self.assertEqual(inventory["captured_at"], "2026-08-24T10:00:00Z")
        self.assertEqual([app["id"] for app in inventory["apps"]], ["app-analytics", "app-shipping"])
        self.assertEqual(inventory["apps"][0]["scopes"], ["read_analytics"])
        self.assertEqual(inventory["apps"][0]["declared_scopes"], ["read_analytics", "read_reports"])
        self.assertEqual(inventory["apps"][0]["webhooks"], ["app/uninstalled"])
        self.assertNotIn("limitations", inventory)

    def test_refuses_declared_scopes_as_granted(self):
        payload = {
            "api_version": "2026-07",
            "apps": [{"handle": "reports", "requestedAccessScopes": [{"handle": "read_reports"}]}],
        }
        with self.assertRaisesRegex(ValueError, "declared scopes but no granted scopes"):
            normalize_export(payload)

    def test_requires_api_version_instead_of_guessing(self):
        payload = {"apps": [{"id": "app-shipping", "scopes": ["read_products"], "webhooks": []}]}
        with self.assertRaisesRegex(ValueError, "api_version"):
            normalize_export(payload)
        inventory = normalize_export(payload, api_version="2026-07", now=datetime(2026, 8, 25, tzinfo=timezone.utc))
        self.assertEqual(inventory["api_version"], "2026-07")
        self.assertEqual(inventory["captured_at"], "2026-08-25T00:00:00Z")

    def test_marks_missing_webhooks_as_a_limitation(self):
        payload = {
            "api_version": "2026-07",
            "apps": [{"id": "app-shipping", "scopes": ["read_products"]}],
        }
        inventory = normalize_export(payload, captured_at="2026-08-25T00:00:00Z")
        self.assertEqual(inventory["apps"][0]["webhooks"], [])
        self.assertEqual(inventory["apps"][0]["webhook_coverage"], "absent")
        self.assertIn("webhooks_not_in_export", inventory["limitations"])
        self.assertIn("Do not treat webhook diffs", capture_summary(inventory))

    def test_canonical_inventory_round_trips(self):
        inventory = normalize_export(self.before)
        self.assertEqual([app["id"] for app in inventory["apps"]], [app["id"] for app in self.before["apps"]])
        self.assertEqual(inventory["apps"][0]["scopes"], ["read_analytics"])

    def test_webhook_coverage_survives_canonical_reimport(self):
        for supplied in (False, True):
            with self.subTest(webhooks_supplied=supplied):
                app = {"id": "app-shipping", "scopes": ["read_products"]}
                if supplied:
                    app["webhooks"] = []
                inventory = normalize_export({"api_version": "2026-07", "apps": [app]})
                restored = normalize_export(json.loads(json.dumps(inventory)))
                self.assertEqual(restored["apps"][0]["webhooks"], [])
                self.assertEqual(restored["apps"][0]["webhook_coverage"],
                                 "complete" if supplied else "absent")
                self.assertEqual(capture_summary(restored), capture_summary(inventory))

    def test_unknown_payload_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "app inventory"):
            normalize_export({"orders": []}, api_version="2026-07")
        with self.assertRaisesRegex(ValueError, "cannot read export"):
            parse_json("{")

    def test_rejects_malformed_records_instead_of_silently_dropping_apps(self):
        app = {"id": "valid", "scopes": [], "webhooks": []}
        for invalid in (None, "broken", 42):
            for body in (
                {"apps": [app, invalid]},
                {"data": {"apps": [app, invalid]}},
                {"data": {"appInstallations": {"nodes": [app, invalid]}}},
                {"data": {"appInstallations": {"edges": [{"node": app}, invalid]}}},
            ):
                with self.subTest(body=body):
                    with self.assertRaisesRegex(ValueError, "each app must be an object"):
                        normalize_export(body, api_version="2026-07")

    def test_duplicate_ids_and_scopes_are_rejected(self):
        payload = {
            "api_version": "2026-07",
            "apps": [
                {"id": "dup", "scopes": ["read_products"], "webhooks": []},
                {"handle": "dup", "scopes": ["read_orders"], "webhooks": []},
            ],
        }
        with self.assertRaisesRegex(ValueError, "duplicate app id"):
            normalize_export(payload)

    def test_canonicalizes_graphql_webhook_topics(self):
        self.assertEqual(canonicalize_topic("APP_UNINSTALLED"), "app/uninstalled")
        self.assertEqual(canonicalize_topic("orders/create"), "orders/create")
        self.assertEqual(canonicalize_topic("CUSTOMERS_DATA_REQUEST"), "customers/data_request")
        self.assertEqual(canonicalize_topic("CUSTOMERS_PURCHASING_SUMMARY"), "customers/purchasing_summary")
        self.assertEqual(canonicalize_topic("ORDERS_PARTIALLY_FULFILLED"), "orders/partially_fulfilled")
        self.assertEqual(canonicalize_topic("VARIANTS_OUT_OF_STOCK"), "variants/out_of_stock")
        before = normalize_export(self.dump)
        report = compare(before, self.before)
        self.assertEqual(report["status"], "unchanged")

    def test_compliance_graphql_enums_match_rest_inventory(self):
        graphql = {
            "data": {
                "appInstallations": {
                    "edges": [
                        {
                            "node": {
                                "app": {"handle": "compliance-app"},
                                "accessScopes": [{"handle": "read_customers"}],
                                "webhookSubscriptions": {
                                    "edges": [
                                        {"node": {"topic": "CUSTOMERS_DATA_REQUEST"}},
                                        {"node": {"topic": "CUSTOMERS_REDACT"}},
                                        {"node": {"topic": "SHOP_REDACT"}},
                                    ]
                                },
                            }
                        }
                    ]
                }
            },
            "api_version": "2026-07",
            "captured_at": "2026-08-24T10:00:00Z",
        }
        rest = {
            "captured_at": "2026-08-25T10:00:00Z",
            "api_version": "2026-07",
            "source": "rest",
            "authorization_state": "active",
            "apps": [
                {
                    "id": "compliance-app",
                    "scopes": ["read_customers"],
                    "webhooks": ["customers/data_request", "customers/redact", "shop/redact"],
                }
            ],
        }
        before = normalize_export(graphql)
        after = normalize_export(rest)
        self.assertEqual(
            before["apps"][0]["webhooks"],
            ["customers/data_request", "customers/redact", "shop/redact"],
        )
        report = compare(before, after)
        self.assertEqual(report["status"], "unchanged")
        self.assertEqual(report["changes"], [])

    def test_normalized_dump_is_comparable(self):
        before = normalize_export(self.dump)
        after = normalize_export(
            {
                "api_version": "2026-07",
                "captured_at": "2026-08-24T12:00:00Z",
                "apps": [
                    {
                        "handle": "app-analytics",
                        "scopes": ["read_analytics", "read_reports"],
                        "webhooks": ["APP_UNINSTALLED", "SHOP_UPDATE"],
                    },
                    {"handle": "app-shipping", "scopes": ["read_products"], "webhooks": []},
                ],
            }
        )
        report = compare(before, after)
        self.assertEqual(report["status"], "changed")
        self.assertEqual([change["kind"] for change in report["changes"]], ["scopes_changed", "webhooks_changed"])

    def test_usage_log_is_aggregate_only(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "usage.jsonl"
            usage_event(path, 2)
            event = json.loads(path.read_text().strip())
            self.assertEqual(event["event"], "inventory_normalized")
            self.assertEqual(event["app_count"], 2)
            self.assertEqual(set(event), {"event", "day", "app_count"})

    def test_infers_installations_source(self):
        self.assertEqual(infer_source(self.dump), "shopify-app-installations")


if __name__ == "__main__":
    unittest.main()
