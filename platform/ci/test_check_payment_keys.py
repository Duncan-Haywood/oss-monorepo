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

    def test_mixed_case_payment_link_host_fails(self):
        self.write("src/pay.html", '<a href="https://BUY.Stripe.com/aBcDeFgHiJkL">Pay</a>\n')
        self.assertEqual(self.kinds(), ["Stripe payment link"])

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

    def test_uppercase_env_style_button_id_fails(self):
        # `.env.example`-style files name the variable in capitals.
        self.write(".env.example", "PAYPAL_HOSTED_BUTTON_ID=ABCD1234EF\n")
        self.assertEqual(self.kinds(), ["PayPal hosted button"])

    def test_paypal_env_lookups_pass(self):
        self.write("a.ts", "const o = { hosted_button_id: process.env.PAYPAL_BUTTON };\n")
        self.write("b.html", '<input name="hosted_button_id" value="">\n')
        self.assertEqual(self.kinds(), [])

    def test_live_key_glued_to_a_name_prefix_fails(self):
        # An underscore is a word character, so a bare \\b missed STRIPE_sk_live_...
        self.write("a.env", f"STRIPE_KEY_{LIVE}\n")
        self.assertEqual(self.kinds(), ["live Stripe key"])

    # Red team 2026-11-16: three ways to wire one account into every copy passed.
    def test_live_publishable_key_fails(self):
        # Client-only Checkout (redirectToCheckout with a price id) charges the
        # account a publishable key names, so a hardcoded pk_live_ is an account too.
        self.write("index.html", '<script>const s = Stripe("pk_' + 'live_' + 'a1B2c3D4e5F6g7H8i9J0");</script>\n')
        self.write("btn.html", '<stripe-buy-button publishable-key="pk_' + 'live_' + 'Zz9Yy8Xx7Ww6Vv5Uu4"></stripe-buy-button>\n')
        self.assertEqual(self.kinds(), ["live Stripe key", "live Stripe key"])

    def test_test_mode_publishable_key_passes(self):
        self.write("index.html", 'Stripe("pk_test_a1B2c3D4e5F6g7H8i9J0"); Stripe(process.env.PK);\n')
        self.assertEqual(self.kinds(), [])

    def test_paypal_payment_link_fails(self):
        # PayPal's no-code checkout links are its Payment Links: one account each.
        self.write("index.html", '<a href="https://www.PayPal.com/ncp/payment/ABCD1234EFGH5">Buy</a>\n')
        self.assertEqual(self.kinds(), ["PayPal payment link"])

    def test_paypal_button_id_with_value_before_name_fails(self):
        self.write("form.html", '<input type="hidden" value="ABCD1234EF" name="hosted_button_id">\n')
        self.write("form2.html", "<input value='ABCD1234EF'\n  name='hosted_button_id' />\n")
        self.assertEqual(self.kinds(), ["PayPal hosted button", "PayPal hosted button"])

    def test_paypal_donation_profile_and_empty_value_first_input_pass(self):
        # Donate-to-the-creator links stay allowed (goals.md, the owner's priorities).
        self.write("a.html", '<a href="https://paypal.me/someone">tip</a> <a href="https://www.paypal.com/ncp/">x</a>\n')
        self.write("b.html", '<input value="" name="hosted_button_id">\n')
        self.assertEqual(self.kinds(), [])

    def test_merchant_of_record_checkout_links_fail(self):
        # goals.md, "Payments: the owner's merchant of record, never a key":
        # a checkout link is set from owner-only config, never committed.
        # Red-team 2026-11-20: all four passed before.
        cases = {
            "ls.html": '<a href="https://mystore.lemonsqueezy.com/buy/6f1c2a9e-1b2c-4d5e-8f90-123456789abc">Buy</a>\n',
            "ls2.js": 'const url = "https://mystore.LemonSqueezy.com/checkout/buy/6f1c2a9e-1b2c-4d5e";\n',
            "polar.html": '<a href="https://buy.polar.sh/polar_cl_' + "AbCdEf123456789" + '">Buy</a>\n',
            "paddle.html": '<a href="https://pay.paddle.io/hsc_' + "01hv8x2y3z4abcdefg" + '">Buy</a>\n',
            "gumroad.html": '<a href="https://someone.gumroad.com/l/fault-pro">Buy</a>\n',
        }
        for name, text in cases.items():
            self.write(name, text)
        self.assertEqual(self.kinds(), ["merchant-of-record checkout link"] * 5)

    def test_merchant_of_record_api_keys_fail(self):
        self.write("polar.env", "POLAR_TOKEN=polar_" + "oat_" + "a1B2c3D4e5F6g7H8i9J0k1\n")
        self.write("paddle.env", "PADDLE_KEY=pdl_" + "live_" + "apikey_01abcdefghijklmnop\n")
        self.assertEqual(self.kinds(), ["merchant-of-record API key"] * 2)

    def test_merchant_of_record_env_lookups_and_storefronts_pass(self):
        # A link read from config, the provider's own home page, a sandbox key
        # and a bare storefront (no product) are not a wired checkout.
        self.write("a.js", "const url = env.CHECKOUT_URL; // e.g. a lemonsqueezy.com/buy/... link\n")
        self.write("b.html", '<a href="https://www.lemonsqueezy.com/">LS</a> <a href="https://polar.sh/">Polar</a> '
                             '<a href="https://gumroad.com/">Gumroad</a> <a href="https://paddle.com/">Paddle</a>\n')
        self.write("c.env", "PADDLE_KEY=pdl_" + "sdbx_" + "apikey_01abcdefghijklmnop\n")
        self.assertEqual(self.kinds(), [])

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

    def test_served_trees_beyond_ventures_are_scanned(self):
        # platform/pages is the catalogue and docs/ the blog: both are public pages.
        names = {p.relative_to(guard.REPO_ROOT).as_posix() for p in guard.SCANNED}
        self.assertTrue({"ventures", "platform", "docs"} <= names)
        self.assertEqual(guard.check_all(), [])
        with TemporaryDirectory() as tmp:
            a, b = Path(tmp) / "ventures", Path(tmp) / "platform"
            a.mkdir()
            (b / "pages").mkdir(parents=True)
            (b / "pages" / "home.html").write_text('<a href="https://buy.stripe.com/aBcDeF123456">', encoding="utf-8")
            out = guard.check_all((a, b))
        self.assertEqual(len(out), 1)
        self.assertTrue(out[0].endswith("home.html: Stripe payment link"))

    def test_own_tests_are_not_a_finding(self):
        self.assertEqual(guard.check(Path(guard.__file__).resolve().parent), [])

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
