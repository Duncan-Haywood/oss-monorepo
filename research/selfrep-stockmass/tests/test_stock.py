import pathlib, sys, unittest
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "src"))
from selfrep_stockmass import stock as t

S = t.s


class T(unittest.TestCase):
    def base(self):
        return S.design_of(S.ROD_OPTIONS[0], ())

    def test_yield_one_import_mass_is_total_mass(self):
        parts = self.base()
        self.assertAlmostEqual(t.import_mass(parts, 1.0), sum(p.qty * p.mass_g for p in parts), places=6)

    def test_lower_yield_raises_import_mass(self):
        parts = self.base()
        self.assertGreater(t.import_mass(parts, 0.5), t.import_mass(parts, 0.9))

    def test_import_cost_between_vitamin_cost_and_total(self):
        parts = self.base()
        vc = t.imports(parts)[2]
        self.assertGreater(t.import_cost(parts, 1.0, 0.3), vc)
        self.assertLess(t.import_cost(parts, 1.0, 0.3), sum(p.qty * p.cost for p in parts))

    def test_zero_budget_is_steel_baseline(self):
        rod, others, v, pen = t.best(0.0, t.import_mass)
        self.assertEqual(rod, S.ROD_OPTIONS[0])
        self.assertEqual(others, ())
        self.assertEqual(pen, 0.0)

    def test_more_budget_never_worse(self):
        vals = [t.best(b, t.import_mass)[2] for b in (0, 0.5, 1, 2, 4)]
        self.assertEqual(vals, sorted(vals, reverse=True))

    def test_substituting_a_vitamin_with_stock_can_lose_when_stock_is_heavy(self):
        # a printed bushing line (10 x 6 g) replaces LM8UU bearings; with yield 0.1 the stock mass must exceed the vitamin mass
        a = self.base()
        b = S.design_of(S.ROD_OPTIONS[0], (0,))
        self.assertLess(t.import_mass(b, 1.0), t.import_mass(a, 1.0) + 1e-9 + 10 * 6.0)
        self.assertGreater(t.import_mass(b, 0.05), t.import_mass(a, 0.05))


if __name__ == "__main__":
    unittest.main()
