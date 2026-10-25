#!/usr/bin/env python3
"""Tests for the hardcoded-payment-account check."""

import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

import check_payment_keys as guard

# Built at runtime so this file never contains a string that looks like a key.
LIVE = "sk_" + "live_" + "a1B2c3D4e5F6g7H8i9J0"


class FindingsIn(unittest.TestCase):
    def setUp(self):
        self.tmp = TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)

    def write(self, rel_path: str, text: str) -> None:
        path = self.root / rel_path
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")

    def kinds(self):
        return sorted(kind for _p, kind in guard.findings_in(self.root))

    def test_env_driven_stripe_code_passes(self):
        self.write("src/checkout.ts",
                   'import Stripe from "stripe";\n'
                   "const key = process.env.STRIPE_SECRET_KEY;\n"
                   "if (!key) return notConfigured();\n")
        self.assertEqual(self.kinds(), [])

    def test_test_mode_placeholders_pass(self):
        self.write("src/checkout.test.ts",
                   'process.env.STRIPE_SECRET_KEY = "sk_test_checkout";\n'
                   'const url = "https://checkout.stripe.com/pay/cs_test_1";\n')
        self.assertEqual(self.kinds(), [])

    def test_live_key_fails(self):
        self.write("src/stripe.ts", f'const stripe = new Stripe("{LIVE}");\n')
        self.assertEqual(self.kinds(), ["live Stripe key"])

    def test_live_key_in_env_file_fails(self):
        self.write(".env", f"STRIPE_SECRET_KEY={LIVE}\n")
        self.assertEqual(self.kinds(), ["live Stripe key"])

    def test_live_key_in_other_text_files_fails(self):
        for name in ("deploy.sh", "notes.txt", "App.vue", "main.go", "app.ini"):
            with self.subTest(name=name):
                self.write(name, f"KEY={LIVE}\n")
        self.assertEqual(len(self.kinds()), 5)

    def test_checkout_under_a_skip_named_directory_is_still_scanned(self):
        # SKIP_DIRS applies below the scan root, not to the checkout's own path.
        root = self.root / "build" / "dist" / "ventures"
        (root / "app").mkdir(parents=True)
        (root / "app" / "stripe.ts").write_text(f'k("{LIVE}")\n', encoding="utf-8")
        self.assertEqual([k for _p, k in guard.findings_in(root)], ["live Stripe key"])

    def test_binary_files_are_skipped(self):
        (self.root / "logo.png").write_bytes(b"\x89PNG\x00" + LIVE.encode())
        self.assertEqual(self.kinds(), [])

    def test_binary_sniff_covers_only_first_8192_bytes(self):
        # NUL at index 8191 is binary (skipped); at 8192 it is past the sniff
        # window, so the file is text and its key must still be found.
        (self.root / "early.dat").write_bytes(b"a" * 8191 + b"\x00" + LIVE.encode())
        (self.root / "late.dat").write_bytes(b"a" * 8192 + b"\x00" + LIVE.encode())
        self.assertEqual([p.name for p, _k in guard.findings_in(self.root)], ["late.dat"])

    def test_restricted_key_fails(self):
        self.write("server.py", 'KEY = "rk_' + 'live_' + 'Zz9Yy8Xx7Ww6Vv5Uu4"\n')
        self.assertEqual(self.kinds(), ["live Stripe key"])

    def test_payment_link_in_page_fails(self):
        self.write("index.html", '<a href="https://buy.stripe.com/aBcDeF123456">Pay</a>\n')
        self.assertEqual(self.kinds(), ["Stripe payment link"])

    def test_paypal_hosted_button_fails(self):
        self.write("index.html", '<a href="https://www.paypal.com/donate?hosted_button_id=ABCD1234EF">x</a>\n')
        self.assertEqual(self.kinds(), ["PayPal hosted button"])

    def test_paypal_button_id_in_form_markup_and_json_fails(self):
        # The standard PayPal embed is a hidden form input, not a query string.
        for name, text in (
            ("form.html", '<input type="hidden" name="hosted_button_id" value="ABCD1234EF">\n'),
            ("cfg.json", '{"hosted_button_id": "ABCD1234EF"}\n'),
            ("cfg.ts", "const o = { hosted_button_id: 'ABCD1234EF' };\n"),
            ("cfg.sh", 'URL="x?hosted_button_id=\'ABCD1234EF\'"\n'),
        ):
            with self.subTest(name=name):
                self.write(name, text)
        self.assertEqual(len(self.kinds()), 4)

    def test_paypal_env_lookups_pass(self):
        self.write("a.ts", "const o = { hosted_button_id: process.env.PAYPAL_BUTTON };\n")
        self.write("b.html", '<input name="hosted_button_id" value="">\n')
        self.assertEqual(self.kinds(), [])

    def test_live_key_glued_to_a_name_prefix_fails(self):
        # An underscore is a word character, so a bare \\b missed STRIPE_sk_live_...
        self.write("a.env", f"STRIPE_KEY_{LIVE}\n")
        self.assertEqual(self.kinds(), ["live Stripe key"])

    def test_lockfiles_and_node_modules_skipped(self):
        self.write("package-lock.json", '"funding": "https://buy.stripe.com/aBcDeF123456"\n')
        self.write("node_modules/x/index.js", f'"{LIVE}"\n')
        self.assertEqual(self.kinds(), [])


class Check(unittest.TestCase):
    def test_repo_is_clean(self):
        self.assertEqual(guard.check(), [])

    def test_default_root_is_the_real_ventures_tree(self):
        self.assertTrue(guard.VENTURES.is_dir())
        self.assertEqual(guard.VENTURES.name, "ventures")
        self.assertTrue((guard.REPO_ROOT / "platform" / "ci").is_dir())

    def test_check_reports_violations_sorted(self):
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "b.html").write_text('<a href="https://buy.stripe.com/aBcDeF123456">', encoding="utf-8")
            (root / "a.py").write_text(f'K = "{LIVE}"\n', encoding="utf-8")
            out = guard.check(root)
        self.assertEqual(len(out), 2)
        self.assertEqual(out, sorted(out))
        self.assertTrue(out[0].endswith("a.py: live Stripe key"))

    def test_missing_root_is_clean(self):
        self.assertEqual(guard.check(Path("/nonexistent/ventures")), [])


class Main(unittest.TestCase):
    def run_main(self, violations):
        from io import StringIO
        from unittest import mock
        with mock.patch.object(guard, "check", return_value=violations), \
                mock.patch("sys.stdout", new_callable=StringIO):
            return guard.main()

    def test_exit_zero_when_clean(self):
        self.assertEqual(self.run_main([]), 0)

    def test_exit_one_on_violation(self):
        self.assertEqual(self.run_main(["x.py: live Stripe key"]), 1)


if __name__ == "__main__":
    unittest.main()
