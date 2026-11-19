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
