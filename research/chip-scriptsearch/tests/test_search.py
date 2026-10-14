import json
import random
import shutil
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
from chip_scriptsearch import search  # noqa: E402
from chip_ppa_sky130mac import flow  # noqa: E402

LIB_SRC = ROOT / "pdk" / flow.LIB_REL


def fake_table():
    # deterministic synthetic scores: shorter sequences and the "csa" design are better
    return {p: 100 + 10 * len(p[1]) - (5 if p[0] == "csa" else 0) + 0.01 * hash(p[1]) % 3 for p in search.all_points(search.MAXLEN)}


class TestSearch(unittest.TestCase):
    def test_space_size(self):
        self.assertEqual(len(search.all_points(3)), 2 * (1 + 7 + 49 + 343))

    def test_script_text(self):
        self.assertEqual(search.script_text(()), "strash; map")
        self.assertEqual(search.script_text(("dch", "balance")), "strash; dch; balance; map")

    def test_neighbour_stays_in_space(self):
        rng = random.Random(0)
        p = search.random_point(rng)
        for _ in range(500):
            p = search.neighbour(p, rng)
            self.assertIn(p[0], search.DESIGNS)
            self.assertLessEqual(len(p[1]), search.MAXLEN)
            self.assertTrue(all(x in search.PASSES for x in p[1]))

    def test_budget_is_respected_and_results_are_seeded(self):
        t = fake_table()
        for fn in (search.random_search, search.hill_climb):
            ev = search.TableEvaluator(t)
            r1 = fn(ev, 25, random.Random(3))
            self.assertEqual(ev.calls, 25)
            self.assertEqual(r1, fn(search.TableEvaluator(t), 25, random.Random(3)))
            self.assertEqual(r1, min(ev.cache.values()))

    def test_hill_climb_beats_random_on_a_smooth_table(self):
        t = fake_table()
        opt = min(t.values())
        h = [search.hill_climb(search.TableEvaluator(t), 40, random.Random(s)) for s in range(40)]
        r = [search.random_search(search.TableEvaluator(t), 40, random.Random(s)) for s in range(40)]
        self.assertLessEqual(sum(h) / 40, sum(r) / 40 + 1e-9)
        self.assertGreaterEqual(min(h), opt)

    def test_session_proposals_are_valid(self):
        props = [json.loads(x) for x in (ROOT / "proposals_session.json").read_text().splitlines()]
        self.assertEqual(len(props), 40)
        for d, s in props:
            self.assertIn(d, search.DESIGNS)
            self.assertTrue(all(x in search.PASSES for x in s))

    @unittest.skipUnless(shutil.which("yosys") and LIB_SRC.exists(), "needs yosys and ./pdk (sh fetch_pdk.sh pdk)")
    def test_flow_scores_and_equivalence(self):
        lib = ROOT / "work" / "test_filtered.lib"
        lib.parent.mkdir(exist_ok=True)
        flow.filtered_liberty(LIB_SRC, lib)
        ev = search.Evaluator(lib)
        a = ev(("ref", ()))
        b = ev(("ref", ("balance", "rewrite")))
        self.assertGreater(a, 0)
        self.assertNotEqual(a, b)
        self.assertEqual(ev.calls, 2)
        self.assertEqual(ev(("ref", ())), a)
        self.assertEqual(ev.calls, 2)
        name = "seq:t"
        flow.SCRIPTS[name] = search.script_text(("dch",))
        _, ok = flow.map_checked(search.DESIGNS["ref"], "mac4", search.DESIGNS["csa"], "mac4", name, str(lib))
        self.assertTrue(ok)


if __name__ == "__main__":
    unittest.main()
