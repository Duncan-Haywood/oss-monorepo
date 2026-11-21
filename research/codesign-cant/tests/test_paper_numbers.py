"""The paper draft quotes only numbers its results files still hold (paper/check_numbers.py)."""
import importlib.util, os

HERE = os.path.dirname(os.path.abspath(__file__))


def test_paper_draft_numbers_match_results_files():
    spec = importlib.util.spec_from_file_location("check_numbers", os.path.join(HERE, "..", "paper", "check_numbers.py"))
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
    assert m.main() == 0


def test_table7_stats_file_is_what_the_script_prints():
    """paper/table7_stats.txt (quoted in section VII) is reproduced exactly by paper/table7_stats.py (fixed random seed)."""
    import contextlib, io, sys
    sys.path.insert(0, os.path.join(HERE, "..", "paper"))
    spec = importlib.util.spec_from_file_location("table7_stats", os.path.join(HERE, "..", "paper", "table7_stats.py"))
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        m.main()
    assert buf.getvalue() == open(os.path.join(HERE, "..", "paper", "table7_stats.txt")).read()


def test_table7_rows_sum_the_identified_laws():
    """Each table VII-1 identified total is the sum of the per-seed counts at 33, 36 and 39.1 ms."""
    spec = importlib.util.spec_from_file_location("table7_stats", os.path.join(HERE, "..", "paper", "table7_stats.py"))
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
    c = m.per_seed("m7ac_ceil125/results.txt", "above", "lag39c125")
    assert sum(m.identified(c)) == 39 and len(m.identified(c)) == 6


def test_figures_vii_points_are_table7_rows():
    """Figures VII-a/b plot the identified totals of table VII-1 (both geometries summed) and nothing else."""
    import sys
    sys.path.insert(0, os.path.join(HERE, "..", "paper"))
    spec = importlib.util.spec_from_file_location("figures_vii", os.path.join(HERE, "..", "paper", "figures_vii.py"))
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
    rs = m.rows()
    rows = m.C.table7()
    assert len(rs) == len(rows) == 11
    for r, row in zip(rs, rows):
        a, b = (int(v) for v in row.split("|")[3].split(","))
        assert r["idt"] == a + b
        assert (r["rise"] is None) == ("—" in row.split("|")[5])


def test_table4_paired_differences_follow_from_the_per_seed_values():
    """Table IV-1's paired cant-minus-no-cant means and sign counts are the arithmetic of the per-seed RMS in m4_controllers/results.txt."""
    import re
    text = open(os.path.join(HERE, "..", "experiments", "m4_controllers", "results.txt")).read()
    quoted = {"pid": (-5.27, 10), "indi": (-4.18, 10), "geo": (-4.88, 10)}
    for law, (mean, better) in quoted.items():
        seeds = {}
        for cant in ("0", "80"):
            m = re.search(rf"^{law}\s+{cant}\s+[\d.]+ \(([^)]*)\)", text, re.M)
            seeds[cant] = [float(v) for v in m[1].split(",")]
        d = [b - a for a, b in zip(seeds["0"], seeds["80"])]
        assert len(d) == 10
        assert abs(sum(d) / len(d) - mean) < 0.006
        assert sum(x < 0 for x in d) == better


def test_section5_arm_ranks_follow_from_the_arm_means():
    """Section V's arm-level Spearman rho (1.000 / 0.943) is the rank correlation of the six arm means in m5_rotorpy/noise_ceiling.txt."""
    import re
    text = open(os.path.join(HERE, "..", "experiments", "m5_rotorpy", "noise_ceiling.txt")).read()
    rows = {m[1]: [float(v) for v in m[2].split()] for m in re.finditer(r"^(stylised|torque|aero|aero_cop|aero_cop2)\s+((?:-[\d.]+\s+){5}-[\d.]+)", text, re.M)}

    def ranks(xs):
        order = sorted(range(len(xs)), key=lambda i: xs[i])
        r = [0] * len(xs)
        for k, i in enumerate(order):
            r[i] = k
        return r

    def rho(a, b):
        ra, rb, n = ranks(a), ranks(b), len(a)
        return 1 - 6 * sum((x - y) ** 2 for x, y in zip(ra, rb)) / (n * (n * n - 1))

    want = {"torque": 0.943, "aero": 1.000, "aero_cop": 0.943, "aero_cop2": 1.000}
    for cond, r in want.items():
        assert abs(rho(rows["stylised"], rows[cond]) - r) < 0.001, cond
