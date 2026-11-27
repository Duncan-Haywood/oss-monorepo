"""Tests for prepub_audit.py: each rule fires on its shape and stays quiet on the known false positives."""

import io
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import prepub_audit as pa  # noqa: E402


def rules(line, path="src/a.ts", terms=None):
    return [(f.level, f.rule) for f in pa.scan_line(path, 1, line, terms or [])]


def has(line, rule_start, level=None, **kw):
    return any(r.startswith(rule_start) and (level is None or lv == level) for lv, r in rules(line, **kw))


class LineRules(unittest.TestCase):
    def test_secret_patterns_block(self):
        key = "AKIA" + "Q" * 16  # built at runtime so the repo's own scanners see no key
        self.assertTrue(has(f'const k = "{key}";', "secret: AWS", "block"))

    def test_secret_detail_is_redacted(self):
        key = "AKIA" + "Q" * 16
        f = pa.scan_line("a.ts", 1, key, [])[0]
        self.assertNotIn(key, f.detail)

    def test_generic_secret_assignment_reviewed_but_placeholders_skipped(self):
        self.assertTrue(has('apiKey: "' + "q8Zr" * 6 + '"', "secret-shaped", "review"))
        self.assertFalse(has('password: "correct-horse-battery-staple"', "secret-shaped"))
        self.assertFalse(has('api_key = "${process.env.API_KEY_VALUE_HERE}"', "secret-shaped"))

    def test_terms_block_and_are_withheld(self):
        f = pa.scan_line("a.md", 1, "Prepared for Acme Holdings", ["acme holdings"])
        self.assertEqual([x.level for x in f], ["block"])
        self.assertNotIn("Acme", f[0].detail)

    def test_email_domains(self):
        self.assertTrue(has("mail ap@harborbuilders.com", "email", "review"))
        self.assertFalse(has("mail ap@builder.example", "email"))
        self.assertFalse(has("mail ap@example.com", "email"))
        self.assertFalse(has("support@marisstella.app", "email"))
        self.assertFalse(has('"zod@3.23.8"', "email"))

    def test_phone(self):
        self.assertTrue(has("Call 303-555-2210", "phone", "review"))
        self.assertTrue(has("Call (303) 555 2210", "phone"))
        self.assertFalse(has("Call 303-555-0142", "phone"))  # fictional range
        self.assertFalse(has("DFARS 252.204-7012 applies", "phone"))

    def test_ssn(self):
        self.assertTrue(has('{ ssn: "212-48-7731" }', "SSN", "block"))
        self.assertFalse(has('{ ssn: "123-45-6789" }', "SSN"))
        self.assertFalse(has("order 212-48-7731 shipped", "SSN"))  # no SSN label

    def test_ipv4(self):
        self.assertTrue(has('host = "10.0.4.12"', "private IPv4", "block"))
        self.assertTrue(has('fetch("http://192.168.1.20/")', "private IPv4", "block"))
        self.assertTrue(has('ssh root@95.217.40.11', "public IPv4", "review"))
        for quiet in (
            "Chrome/119.0.0.0 Safari/537.36",
            "TIFF predictor 2 (7.4.4.4)",
            "text string (§7.9.2.2)",
            "rfc5246#section-7.4.1.2",
            'fix("$1.120.223.00")',
            "listen on 127.0.0.1",
            "docs use 192.0.2.10",
        ):
            self.assertFalse(has(quiet, "p"), quiet)  # neither private nor public IPv4 nor phone

    def test_internal_hosts(self):
        self.assertTrue(has('url = "http://billing.corp/api"', "internal hostname", "block"))
        self.assertTrue(has("db at pg.prod.internal", "internal hostname", "block"))
        self.assertFalse(has("const to = `${cfg.local}@${cfg.domain}`;", "internal hostname"))
        self.assertFalse(has("add(ASIDE.local);", "internal hostname"))
        # SSRF denylists and tests are read, not blocked
        self.assertTrue(has('BLOCKED = ["metadata.google.internal"]', "internal hostname", "review"))
        self.assertTrue(has('"http://db.internal/",', "internal hostname", "review", path="test/ssrf.test.ts"))

    def test_personal_paths(self):
        self.assertTrue(has('const p = "/Users/jdoe/projects/x";', "personal filesystem path", "block"))
        self.assertFalse(has("cd /home/user/oss-monorepo", "personal filesystem path"))

    def test_account_ids(self):
        self.assertTrue(has('"arn:aws:iam::402918334512:role/deploy"', "AWS account id", "review"))
        self.assertFalse(has('"arn:aws:iam::123456789012:role/deploy"', "AWS account id"))
        self.assertTrue(has('"database_id": "' + "ab12" * 8 + '"', "cloud database_id", "review"))

    def test_notes_and_markers(self):
        self.assertTrue(has("// TODO: auth check is skipped for admins", "open security note"))
        self.assertTrue(has("Known vulnerability in the export path", "open security note"))
        self.assertFalse(has("n'ont pas de motif exploitable", "open security note"))
        self.assertTrue(has("CONFIDENTIAL - do not distribute", "confidentiality marker"))
        self.assertTrue(has("see private-monorepo/apps/x", "names private-monorepo"))

    def test_ok_marker_silences_line(self):
        self.assertEqual(rules('host = "10.0.4.12"  // prepub-audit: ok documented lab address'), [])


class TreeAudit(unittest.TestCase):
    def test_audit_files_and_exit_code(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            (root / "apps/x/src").mkdir(parents=True)
            (root / "apps/x/src/a.ts").write_text('export const u = "ap@harborbuilders.com";\n')
            (root / "apps/x/.dev.vars").write_text("X=1\n")
            (root / "apps/x/data.sqlite").write_bytes(b"SQLite format 3\0")
            (root / "apps/x/node_modules/p").mkdir(parents=True)
            (root / "apps/x/node_modules/p/i.js").write_text('h = "10.0.0.9"\n')
            r = pa.audit(root, ["apps/x"])
            got = {(f["level"], f["rule"].split(":")[0]) for f in r["findings"]}
            self.assertIn(("block", "file that never moves"), got)
            self.assertIn(("review", "data file (may hold real records)"), got)
            self.assertIn(("review", "email address outside example domains"), got)
            self.assertFalse(any("node_modules" in f["path"] for f in r["findings"]))
            out = io.StringIO()
            with redirect_stdout(out):
                code = pa.main([str(root), "apps/x", "--no-author-emails"])
            self.assertEqual(code, 1)
            self.assertIn("Block: **1**", out.getvalue())

    def test_clean_tree_exits_zero(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            (root / "a").mkdir()
            (root / "a/ok.md").write_text("Nothing to see; write to ap@builder.example.\n")
            with redirect_stdout(io.StringIO()):
                self.assertEqual(pa.main([str(root), "a", "--no-author-emails"]), 0)


if __name__ == "__main__":
    unittest.main()
