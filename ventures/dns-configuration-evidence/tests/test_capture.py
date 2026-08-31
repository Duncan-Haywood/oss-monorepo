import json
import struct
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).parents[1] / "src"))

from dns_evidence.capture import (
    CaptureError,
    build_query,
    capture_snapshot,
    encode_qname,
    load_plan,
    name_in_authorized_domain,
    parse_response,
    plan_from_cli,
    write_snapshot,
)
from dns_evidence.cli import main
from dns_evidence.report import build_report, load_snapshot


def plan(**overrides):
    body = {
        "authorized": True,
        "domain": "example.test",
        "queries": [{"name": "example.test", "type": "A"}, {"name": "mail.example.test", "type": "MX"}],
        "resolvers": [{"id": "resolver-a", "address": "192.0.2.53"}],
        "timeout": 1.5,
    }
    body.update(overrides)
    return body


def fake_querier(answers=None, status=None):
    def _query(name, rtype, resolver, timeout):
        observation = {
            "name": name,
            "type": rtype,
            "resolver": resolver,
            "observed_at": "2026-08-25T20:00:00Z",
        }
        if status:
            observation["status"] = status
        else:
            observation["answers"] = list(answers or [f"{name}-{rtype}"])
        return observation

    return _query


class PlanTests(unittest.TestCase):
    def test_unauthorized_plan_is_rejected(self):
        with self.assertRaisesRegex(CaptureError, "authorized"):
            load_plan(raw=plan(authorized=False))

    def test_query_outside_authorized_domain_is_rejected(self):
        with self.assertRaisesRegex(CaptureError, "outside the authorized domain"):
            load_plan(raw=plan(queries=[{"name": "other.test", "type": "A"}]))

    def test_subdomain_of_authorized_apex_is_allowed(self):
        loaded = load_plan(raw=plan(queries=[{"name": "_dmarc.example.test", "type": "TXT"}]))
        self.assertEqual(loaded["queries"][0]["name"], "_dmarc.example.test")

    def test_duplicate_queries_are_rejected(self):
        with self.assertRaisesRegex(CaptureError, "duplicate"):
            load_plan(
                raw=plan(
                    queries=[
                        {"name": "example.test", "type": "A"},
                        {"name": "EXAMPLE.test.", "type": "a"},
                    ]
                )
            )

    def test_unknown_type_is_rejected(self):
        with self.assertRaisesRegex(CaptureError, "unsupported query type"):
            load_plan(raw=plan(queries=[{"name": "example.test", "type": "DNSKEY"}]))

    def test_cli_requires_authorized_flag_without_plan(self):
        with self.assertRaisesRegex(CaptureError, "--authorized"):
            plan_from_cli(
                domain="example.test",
                authorized=False,
                queries=["example.test:A"],
                resolvers=["192.0.2.53"],
                timeout=3.0,
                plan_path=None,
            )

    def test_name_in_authorized_domain(self):
        self.assertTrue(name_in_authorized_domain("www.Example.TEST", "example.test"))
        self.assertFalse(name_in_authorized_domain("example.test.evil", "example.test"))


class CaptureTests(unittest.TestCase):
    def test_snapshot_is_loadable_and_compareable(self):
        first = capture_snapshot(plan(), querier=fake_querier(["192.0.2.10"]))
        second_plan = plan()
        second = capture_snapshot(second_plan, querier=fake_querier(["192.0.2.11"]))
        self.assertEqual(first["authorized"], True)
        self.assertEqual(first["tool"], "dns-configuration-evidence")
        load_snapshot(first)
        report = build_report(first, second)
        self.assertEqual(report["finding_counts"], {"changed": 2})

    def test_timeout_is_recorded_as_status_not_empty_answers(self):
        snapshot = capture_snapshot(plan(queries=[{"name": "example.test", "type": "A"}]), querier=fake_querier(status="timeout"))
        observation = snapshot["observations"][0]
        self.assertEqual(observation["status"], "timeout")
        self.assertNotIn("answers", observation)
        self.assertEqual(observation["resolver"], "resolver-a")

    def test_resolver_label_is_the_observation_identity(self):
        snapshot = capture_snapshot(
            plan(resolvers=[{"id": "cloudflare", "address": "1.1.1.1"}]),
            querier=fake_querier(["192.0.2.10"]),
        )
        self.assertEqual(snapshot["observations"][0]["resolver"], "cloudflare")

    def test_atomic_write_replaces_destination(self):
        snapshot = capture_snapshot(plan(queries=[{"name": "example.test", "type": "TXT"}]), querier=fake_querier(["v=spf1"]))
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "out.json"
            write_snapshot(snapshot, path)
            loaded = load_snapshot(path)
            self.assertEqual(loaded["observations"][0]["answers"], ["v=spf1"])
            self.assertFalse(any(path.parent.glob(".*.tmp")))


class PacketTests(unittest.TestCase):
    def test_parse_a_record_response(self):
        query = build_query("example.test", "A", query_id=0x1111)
        name = encode_qname("example.test")
        answer = (
            b"\xc0\x0c"
            + struct.pack("!HHIH", 1, 1, 60, 4)
            + bytes((192, 0, 2, 10))
        )
        header = struct.pack("!HHHHHH", 0x1111, 0x8180, 1, 1, 0, 0)
        message = header + name + struct.pack("!HH", 1, 1) + answer
        self.assertEqual(parse_response(message, 0x1111, "A"), ["192.0.2.10"])

    def test_parse_refused(self):
        header = struct.pack("!HHHHHH", 7, 0x8005, 0, 0, 0, 0)
        self.assertEqual(parse_response(header, 7, "A"), "refused")

    def test_parse_wrong_id_is_error(self):
        header = struct.pack("!HHHHHH", 1, 0x8180, 0, 0, 0, 0)
        self.assertEqual(parse_response(header, 2, "A"), "error")

    def test_parse_mx_and_txt(self):
        name = encode_qname("example.test")
        mx_rdata = struct.pack("!H", 10) + encode_qname("mail.example.test")
        txt_payload = b"v=spf1 -all"
        txt_rdata = bytes([len(txt_payload)]) + txt_payload
        mx = b"\xc0\x0c" + struct.pack("!HHIH", 15, 1, 60, len(mx_rdata)) + mx_rdata
        header = struct.pack("!HHHHHH", 9, 0x8180, 1, 1, 0, 0)
        mx_message = header + name + struct.pack("!HH", 15, 1) + mx
        self.assertEqual(parse_response(mx_message, 9, "MX"), ["10 mail.example.test"])
        txt = b"\xc0\x0c" + struct.pack("!HHIH", 16, 1, 60, len(txt_rdata)) + txt_rdata
        txt_header = struct.pack("!HHHHHH", 9, 0x8180, 1, 1, 0, 0)
        txt_message = txt_header + name + struct.pack("!HH", 16, 1) + txt
        self.assertEqual(parse_response(txt_message, 9, "TXT"), ["v=spf1 -all"])


class CliTests(unittest.TestCase):
    def test_capture_cli_writes_snapshot_and_usage_without_content(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            plan_path = root / "plan.json"
            plan_path.write_text(json.dumps(plan(queries=[{"name": "example.test", "type": "TXT"}])), encoding="utf-8")
            output = root / "snap.json"
            usage = root / "usage.json"
            with mock.patch("dns_evidence.cli.capture_snapshot", side_effect=lambda loaded: capture_snapshot(loaded, querier=fake_querier(["ok"]))):
                code = main(["capture", "--plan", str(plan_path), "--output", str(output), "--usage-file", str(usage)])
            self.assertEqual(code, 0)
            snapshot = json.loads(output.read_text(encoding="utf-8"))
            self.assertEqual(snapshot["domain"], "example.test")
            self.assertEqual(json.loads(usage.read_text(encoding="utf-8")), {"snapshot_captured": 1})
            self.assertNotIn("example.test", usage.read_text(encoding="utf-8"))
            self.assertNotIn("192.0.2", usage.read_text(encoding="utf-8"))

    def test_capture_without_authorization_exits_1(self):
        code = main(["capture", "--domain", "example.test", "--query", "example.test:A", "--resolver", "192.0.2.53"])
        self.assertEqual(code, 1)

    def test_legacy_compare_flags_still_work(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            before = capture_snapshot(plan(queries=[{"name": "example.test", "type": "A"}]), querier=fake_querier(["1"]))
            after = capture_snapshot(plan(queries=[{"name": "example.test", "type": "A"}]), querier=fake_querier(["1"]))
            before_path = root / "before.json"
            after_path = root / "after.json"
            write_snapshot(before, before_path)
            write_snapshot(after, after_path)
            usage = root / "usage.json"
            code = main(["--before", str(before_path), "--after", str(after_path), "--output", str(root / "report.json"), "--usage-file", str(usage)])
            self.assertEqual(code, 0)
            self.assertEqual(json.loads(usage.read_text(encoding="utf-8")), {"report_generated": 1})

    def test_compare_subcommand(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            before = capture_snapshot(plan(queries=[{"name": "example.test", "type": "A"}]), querier=fake_querier(["1"]))
            after = capture_snapshot(plan(queries=[{"name": "example.test", "type": "A"}]), querier=fake_querier(["2"]))
            write_snapshot(before, root / "before.json")
            write_snapshot(after, root / "after.json")
            code = main(["compare", "--before", str(root / "before.json"), "--after", str(root / "after.json"), "--output", str(root / "report.json"), "--fail-on", "changed"])
            self.assertEqual(code, 2)

    def test_fail_on_timeout(self):
        with tempfile.TemporaryDirectory() as directory:
            plan_path = Path(directory) / "plan.json"
            plan_path.write_text(json.dumps(plan(queries=[{"name": "example.test", "type": "A"}])), encoding="utf-8")
            with mock.patch("dns_evidence.cli.capture_snapshot", side_effect=lambda loaded: capture_snapshot(loaded, querier=fake_querier(status="timeout"))):
                code = main(["capture", "--plan", str(plan_path), "--output", str(Path(directory) / "snap.json"), "--fail-on", "timeout"])
            self.assertEqual(code, 2)


if __name__ == "__main__":
    unittest.main()
