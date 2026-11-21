"""Milestones 1-2 at ten seeds (experiments/m12_ten_seeds): the statistics and the merged results file."""
import importlib.util, os

HERE = os.path.dirname(os.path.abspath(__file__))
PATH = os.path.join(HERE, "..", "experiments", "m12_ten_seeds", "stats.py")


def load():
    spec = importlib.util.spec_from_file_location("m12_stats", PATH)
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
    return m


def test_exact_wilcoxon_matches_known_values():
    m = load()
    assert abs(m.wilcoxon([-1.0] * 10) - 2 / 1024) < 1e-12          # all one sign: the n = 10 floor, 0.00195
    assert abs(m.wilcoxon([1, 2, 3, 4, 5]) - 0.0625) < 1e-12        # n = 5 floor
    # one positive difference of rank 1 among ten: W+ = 1, two-sided p = 2 * 2 / 1024
    assert abs(m.wilcoxon([0.1] + [-1.0 - i for i in range(9)]) - 4 / 1024) < 1e-12
    assert m.wilcoxon([0.0, 0.0]) == 1.0


def test_ranks_average_ties():
    assert load().ranks([3.0, 1.0, 3.0, 2.0]) == [3.5, 1.0, 3.5, 2.0]


def test_results_file_is_what_the_script_prints():
    m = load()
    L, S = m.main()
    assert "\n".join(L) + "\n" == open(os.path.join(HERE, "..", "experiments", "m12_ten_seeds", "results.txt")).read()
    assert all(c["equal"] for c in m.merged()[0]["checks"])
    # every merged comparison of milestones 1, 2 and 4 pairs ten seeds
    assert all(v["n"] == 10 for k, v in S.items() if isinstance(v, dict) and k.split()[0] in ("m1", "m2", "m2b", "m4"))


def test_seeds_0_to_4_unchanged_in_merge():
    """The stored five-seed means are recovered from seeds 0-4 of the merged data (milestone 2, prio, lam 0)."""
    m = load()
    _, m1, m2, _, _, _ = m.merged()
    a = m.by_seed(m2, mix="prio", cap=80, lam=0.0)[:5]; b = m.by_seed(m2, mix="prio", cap=0, lam=0.0)[:5]
    assert round(sum(x["rms"] - y["rms"] for x, y in zip(a, b)) / 5, 2) == -6.08
