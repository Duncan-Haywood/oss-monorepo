#!/usr/bin/env python3
"""Tests for the payment-SDK guard.

The guard is only worth having if it is sensitive to the import spellings the
fleet actually uses, quiet on the calculators that merely talk about money or
squares of fabric, and honest that the two current exceptions are the only
ones it will let through silently.
"""

import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

import check_no_payment_code as guard


class FindingsIn(unittest.TestCase):
    def setUp(self):
        self.tmp = TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)

    def write(self, rel_path: str, text: str) -> Path:
        path = self.root / rel_path
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")
        return path

    def test_flags_ts_stripe_import(self):
        self.write("src/checkout.ts", 'import Stripe from "stripe";\n')
        self.assertEqual(len(list(guard.findings_in(self.root))), 1)

    def test_flags_stripe_require(self):
        self.write("src/checkout.js", 'const Stripe = require("stripe");\n')
        self.assertEqual(len(list(guard.findings_in(self.root))), 1)

    def test_flags_dynamic_import(self):
        self.write("src/lib.ts", 'const StripeSdk = (await import("stripe")).default;\n')
        self.assertEqual(len(list(guard.findings_in(self.root))), 1)

    def test_flags_python_import(self):
        self.write("server.py", "import stripe\n")
        self.assertEqual(len(list(guard.findings_in(self.root))), 1)

    def test_flags_braintree_paypal_adyen_razorpay_klarna(self):
        for name, spelling in (
            ("braintree", 'require("braintree")'),
            ("paypal", 'require("@paypal/checkout-server-sdk")'),
            ("adyen", 'require("@adyen/api-library")'),
            ("razorpay", 'require("razorpay")'),
            ("klarna", 'require("klarna-checkout")'),
        ):
            with self.subTest(name=name):
                tmp = TemporaryDirectory()
                self.addCleanup(tmp.cleanup)
                root = Path(tmp.name)
                (root / "checkout.js").write_text(
                    f"const x = {spelling};\n", encoding="utf-8"
                )
                self.assertEqual(len(list(guard.findings_in(root))), 1, spelling)

    def test_flags_square_scoped_import_but_not_the_word_square(self):
        self.write("src/checkout.ts", 'import { Client } from "square";\n')
        self.assertEqual(len(list(guard.findings_in(self.root))), 1)

    def test_does_not_flag_square_footage_calculators(self):
        self.write(
            "index.html",
            "<script>const squareFeet = width * height; "
            "// square footage, not the Square SDK\n</script>",
        )
        self.assertEqual(list(guard.findings_in(self.root)), [])

    def test_flags_package_json_dependency(self):
        self.write(
            "package.json",
            '{"dependencies": {"stripe": "^17.7.0", "react": "^19.0.0"}}',
        )
        self.assertEqual(len(list(guard.findings_in(self.root))), 1)

    def test_clean_venture_with_ordinary_money_math_is_not_flagged(self):
        self.write(
            "calc.mjs",
            "export function money(value) { return `$${value.toFixed(2)}`; }\n"
            "export function total(items) { return items.reduce((a, b) => a + b, 0); }\n",
        )
        self.write(
            "package.json",
            '{"dependencies": {"react": "^19.0.0", "next": "^16.0.0"}}',
        )
        self.assertEqual(list(guard.findings_in(self.root)), [])

    def test_ignores_node_modules(self):
        self.write("node_modules/stripe/index.js", 'require("stripe")\n')
        self.assertEqual(list(guard.findings_in(self.root)), [])


class Check(unittest.TestCase):
    def setUp(self):
        self.tmp = TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.ventures = Path(self.tmp.name) / "ventures"
        self.ventures.mkdir()

    def write(self, venture: str, rel_path: str, text: str) -> Path:
        path = self.ventures / venture / rel_path
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")
        return path

    def test_unlisted_venture_with_stripe_is_a_violation(self):
        self.write("some-new-venture", "src/checkout.ts", 'import Stripe from "stripe";\n')
        violations = guard.check(self.ventures)
        self.assertEqual(len(violations), 1)
        self.assertIn("some-new-venture", violations[0])

    def test_listed_exception_is_not_a_violation(self):
        self.write("local-site-studio", "src/checkout.ts", 'import Stripe from "stripe";\n')
        self.assertIn("local-site-studio", guard.ALLOWED_EXCEPTIONS)
        violations = guard.check(self.ventures)
        self.assertEqual(violations, [])

    def test_venture_with_no_payment_code_is_clean(self):
        self.write("plain-calculator", "index.html", "<script>1+1</script>")
        self.assertEqual(guard.check(self.ventures), [])

    def test_no_ventures_dir_is_clean(self):
        self.assertEqual(guard.check(Path(self.tmp.name) / "missing"), [])


class ExceptionsPointAtDecisionRows(unittest.TestCase):
    def test_every_exception_has_a_non_empty_decision_id(self):
        for slug, decision_id in guard.ALLOWED_EXCEPTIONS.items():
            with self.subTest(slug=slug):
                self.assertTrue(decision_id, f"{slug} exception has no decision row id")

    def test_current_exceptions_are_exactly_the_two_known_cases(self):
        # A change here should be deliberate -- adding a slug needs a decision
        # row in portfolio/ledger/asks.yaml first, and removing one means the
        # payment code itself should already be gone. Pin the known set so an
        # addition or removal is a visible diff in this test, not just in the
        # dict above.
        self.assertEqual(
            set(guard.ALLOWED_EXCEPTIONS),
            {"local-site-studio", "print-atelier"},
        )


class MainExitCode(unittest.TestCase):
    def test_main_returns_zero_on_the_real_repo(self):
        # Exercises the actual repo tree (VENTURES module-level constant),
        # which should be clean given the two declared exceptions.
        self.assertEqual(guard.main(), 0)


if __name__ == "__main__":
    unittest.main()
