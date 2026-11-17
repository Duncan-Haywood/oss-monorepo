import importlib.util
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parents[1] / "experiments" / "ledger"
spec = importlib.util.spec_from_file_location("ledger_run", HERE / "run.py")
run = importlib.util.module_from_spec(spec)
sys.modules["ledger_run"] = run
spec.loader.exec_module(run)


def rec(cond, j, variant, lost_p, booked, passed, fine=False, n=10):
    z = [0.0] * n
    return dict(cond=cond, j=j, variant=variant, fine=fine, lost_total=[lost_p] * n, lost_particles=[lost_p] * n,
                lost_electrolyte=z, lost_side=[booked] * n, passed_side=[passed] * n, sei_mol=[booked] * n,
                sei_cr_mol=z, pl_mol=z, lam_n_mol=z, lam_p_mol=z, neg_mol=[1.0 - lost_p] * n, pos_mol=[1.0] * n,
                neg0=1.0, pos0=1.0)


class Ledger(unittest.TestCase):
    def test_rel(self):
        self.assertAlmostEqual(run.rel(1.1, 1.0), 0.1, places=12)
        self.assertIsNone(run.rel(1.0, 0.0))

    def test_row_reads_cycle_n(self):
        r = rec(run.AI, 0, "both", 5.0, 0.2, 5.1)
        r["lost_particles"] = [1.0] * 9 + [5.0]
        row = run.ledger_row(r)
        self.assertEqual(row["lost_particles"], 5.0)
        self.assertAlmostEqual(row["booked_share"], 0.04, places=12)
        self.assertAlmostEqual(row["passed_vs_particles"], 0.02, places=12)

    def test_verdicts_bookkeeping_case(self):
        rows = [run.ledger_row(rec(run.AI, j, "both", 5.0, 0.2, 5.1)) for j in range(4)]
        rows += [run.ledger_row(rec(run.AI, j, "sei", 4.9, 0.0, 4.9)) for j in range(4)]
        rows += [run.ledger_row(rec(run.AI, j, "both", 5.05, 0.2, 5.1, fine=True)) for j in range(2)]
        V, _ = run.verdicts(rows, rows)
        self.assertEqual(V["H189"], "supported")
        rows += [run.ledger_row(rec(c, 0, "both", 1.0, 0.99, 1.0)) for c in run.CONTROLS]
        V, _ = run.verdicts(rows, rows)
        self.assertEqual(V, dict(H187="supported", H188="supported", H189="supported", H190="supported"))

    def test_verdicts_refuted_case(self):
        rows = [run.ledger_row(rec(run.AI, j, "both", 5.0, 0.2, 0.21)) for j in range(4)]
        rows += [run.ledger_row(rec(run.AI, j, "sei", 1.0, 0.0, 0.0)) for j in range(4)]
        rows += [run.ledger_row(rec(run.AI, 0, "both", 8.0, 0.2, 0.2, fine=True))]
        V, _ = run.verdicts(rows, rows)
        self.assertEqual(V["H189"], "refuted")
        rows += [run.ledger_row(rec(c, 0, "both", 1.0, 0.5, 0.5)) for c in run.CONTROLS]
        V, _ = run.verdicts(rows, rows)
        self.assertEqual(V, dict(H187="refuted", H188="refuted", H189="refuted", H190="refuted"))


if __name__ == "__main__":
    unittest.main()
