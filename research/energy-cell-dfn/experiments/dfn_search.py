"""Search directly on DFN with the energy-cell budget (30 evaluations) and proposers.
usage: dfn_search.py bayes|random SEED   -> dfn_search_<proposer><seed>.json"""
import importlib.util, json, sys
from pathlib import Path
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
spec = importlib.util.spec_from_file_location("dfn_run", HERE / "run.py")
run = importlib.util.module_from_spec(spec); spec.loader.exec_module(run)
from energy_cell import search
from multiprocessing import Pool


def _score(x):
    return run.evaluate_with(x, "DFN")["score"]


def f(x):
    """Each evaluation in a fresh process: PyBaMM DFN memory grows past 14 GB over a search otherwise."""
    with Pool(1, maxtasksperchild=1) as p:
        return p.apply(_score, (list(map(float, x)),))


if __name__ == "__main__":
    kind, seed = sys.argv[1], int(sys.argv[2])
    res = (search.bayes_search if kind == "bayes" else search.random_search)(f, 30, seed)
    (HERE / f"dfn_search_{kind}{seed}.json").write_text(json.dumps([{"x": [float(v) for v in x], "dfn": s} for x, s in res]))
    print(kind, seed, max(s for _, s in res))
