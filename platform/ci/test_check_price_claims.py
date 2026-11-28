"""Tests for check_price_claims.py: marketing copy that disagrees with a product's plans.ts."""
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import check_price_claims as c  # noqa: E402

PLANS_TS = """
export const PLAN_LIST: readonly Plan[] = [
  { key: "free", name: "Free", description: "x", priceCents: 0,
    annualPriceCents: null,
    purchasable: false },
  { key: "starter", name: "Level 1", description: "x", priceCents: 0,
    annualPriceCents: null,
    purchasable: false },
  { key: "shop", name: "Shop", description: "x", priceCents: 19_900,
    annualPriceCents: annualPriceFor(19_900),
    purchasable: true },
  { key: "shop_plus", name: "Shop Plus", description: "x", priceCents: 39_900,
    annualPriceCents: 430_900,
    purchasable: true },
];
"""


def plans():
    return c.parse_plans(PLANS_TS, "demo", "plans.ts")


def bad(line):
    return [(p.name, fig) for p, cents, fig in c.claims(c.TAG.sub(" ", line), plans())
            if cents not in p.charges()]


def seen(line):
    return [(p.name, fig) for p, _, fig in c.claims(c.TAG.sub(" ", line), plans())]


class ParsePlans(unittest.TestCase):
    def test_reads_names_prices_and_annual_formula(self):
        got = {p.name: (p.monthly_cents, p.annual_cents) for p in plans()}
        # "Free" is too common a word to check; "Level 1" is checked at $0.
        self.assertEqual(got, {"Level 1": (0, None), "Shop": (19_900, 214_900),
                               "Shop Plus": (39_900, 430_900)})

    def test_annual_price_matches_packages_billing(self):
        # Math.round(cents * 12 * 0.9 / 100) * 100
        self.assertEqual(c.annual_price_for(9_900), 106_900)
        self.assertEqual(c.annual_price_for(17_900), 193_300)

    def test_monthly_equivalent_of_annual_is_allowed(self):
        shop = [p for p in plans() if p.name == "Shop"][0]
        self.assertIn(17_908, shop.charges())  # $2,149 / 12 = $179.08


class Claims(unittest.TestCase):
    def test_right_prices_pass(self):
        for line in ["Shop $199 a month", "| Shop | $199 | $2,149 |", "$399/month for Shop Plus",
                     "Shop Plus: $4,309 a year", "the Shop plan at $199", "Level 1 $0"]:
            self.assertEqual(bad(line), [], line)
            self.assertTrue(seen(line), f"claim not recognised: {line}")

    def test_wrong_price_flagged(self):
        self.assertEqual(bad("Shop $149 a month"), [("Shop", "$149")])
        self.assertEqual(bad("$249 a month for Shop Plus"), [("Shop Plus", "$249")])
        self.assertEqual(bad("Level 1 costs $39"), [("Level 1", "$39")])

    def test_longer_name_wins(self):
        self.assertEqual(seen("Shop Plus $399"), [("Shop Plus", "$399")])
        self.assertEqual(bad("Shop Plus $399, Shop $199"), [])

    def test_html_tags_are_removed(self):
        self.assertEqual(bad('<h2>Shop</h2><p class="price">$149<span>/month</span>'),
                         [("Shop", "$149")])

    def test_history_is_skipped(self):
        self.assertEqual(bad("Shop was $149 before 2026-11-25"), [])
        self.assertEqual(bad("Shop, up from $149"), [])

    def test_unrelated_dollar_figures_ignored(self):
        self.assertEqual(seen("a shop pays $3,000 to a consultant"), [])
        self.assertEqual(seen("Shopify charges $39"), [])


CATALOG_JSON = """{
  "app": "euro", "productName": "Euro App", "currency": "EUR", "taxCategory": "saas",
  "plans": [
    {"key": "starter", "name": "Firm S", "description": "x", "monthlyCents": 1900, "annualCents": null},
    {"key": "plus", "name": "Firm L", "description": "x", "monthlyCents": 4900, "annualCents": null},
    {"key": "api", "name": "API, metered", "description": "x", "monthlyCents": 1900, "annualCents": null}
  ]
}"""


def euro_plans():
    with tempfile.TemporaryDirectory() as d:
        f = Path(d) / "ventures/euro/apps/euro/billing/paddle-catalog.json"
        f.parent.mkdir(parents=True)
        f.write_text(CATALOG_JSON)
        return c.catalog_plans(Path(d) / "ventures/euro", Path(d))


def euro_bad(line):
    return [(p.name, fig) for p, cents, fig in c.claims(line, euro_plans()) if cents not in p.charges()]


class EuroCatalog(unittest.TestCase):
    def test_reads_catalog_and_skips_metered(self):
        got = {p.name: (p.monthly_cents, p.currency) for p in euro_plans()}
        self.assertEqual(got, {"Firm S": (1900, "EUR"), "Firm L": (4900, "EUR")})

    def test_euro_forms_pass_when_right(self):
        for line in ["Firm S €19 a month", "| Firm L | €49 |", "Firm S: 19 € pro Monat",
                     "Firm L EUR 49", "Firm S 19,00 €", "€49/month for Firm L"]:
            self.assertEqual(euro_bad(line), [], line)
            self.assertTrue(list(c.claims(line, euro_plans())), f"claim not recognised: {line}")

    def test_wrong_amount_or_currency_flagged(self):
        self.assertEqual(euro_bad("Firm S €25 a month"), [("Firm S", "€25")])
        self.assertEqual(euro_bad("Firm L: 39 €"), [("Firm L", "39 €")])
        self.assertEqual(euro_bad("Firm S $19"), [("Firm S", "$19")])

    def test_dollar_plan_rejects_euro_figure(self):
        self.assertEqual(bad("Shop €199"), [("Shop", "€199")])

    def test_plans_ts_wins_over_catalog(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            app = root / "ventures/demo/apps/demo"
            (app / "src/shared").mkdir(parents=True)
            (app / "src/shared/plans.ts").write_text(PLANS_TS)
            (app / "billing").mkdir()
            (app / "billing/paddle-catalog.json").write_text(CATALOG_JSON)
            prods = c.load_products(root)
            self.assertEqual([p.name for p in prods[0].plans], ["Level 1", "Shop", "Shop Plus"])

    def test_catalog_only_venture_is_scanned(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            f = root / "ventures/euro/apps/euro/billing/paddle-catalog.json"
            f.parent.mkdir(parents=True)
            f.write_text(CATALOG_JSON)
            (root / "ventures/euro/README.md").write_text("Firm S €19, Firm L €59 a month.\n")
            _, findings = c.scan(root)
            self.assertEqual([(x["file"], x["found"]) for x in findings],
                             [("ventures/euro/README.md", "€59")])


class Scan(unittest.TestCase):
    def test_scan_tree_with_waivers(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            app = root / "ventures/demo/apps/demo/src/shared"
            app.mkdir(parents=True)
            (app / "plans.ts").write_text(PLANS_TS)
            v = root / "ventures/demo"
            (v / "README.md").write_text("Plans: Shop $149 a month.\nShop $199 a month.\n")
            (v / "OLD.md").write_text("<!-- price-claims: historical -->\nShop $99\n")
            (v / "NOTE.md").write_text("Shop $99 then <!-- price-claims: ok -->\n")
            (v / "x.test.mjs").write_text("Shop $1\n")
            (root / "docs/posts").mkdir(parents=True)
            (root / "docs/posts/a.md").write_text("Demo App: Shop $149.\n")
            c.POST_NAMES["demo"] = ["Demo App"]
            try:
                _, findings = c.scan(root)
            finally:
                del c.POST_NAMES["demo"]
            got = sorted((f["file"], f["line"], f["found"]) for f in findings)
            self.assertEqual(got, [("docs/posts/a.md", 1, "$149"), ("ventures/demo/README.md", 1, "$149")])


if __name__ == "__main__":
    unittest.main()
