"""AUROC of the population and profile-aware detectors against Markov-chain generators."""
import json
import os
import sys

import numpy as np

import markov as M

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "mimic-webcam"))
sys.path.insert(0, os.path.join(HERE, "..", "mimic-webcam-persongen"))
import data as D  # noqa: E402
import importlib.util  # noqa: E402

_spec = importlib.util.spec_from_file_location("persongen_run", os.path.join(HERE, "..", "mimic-webcam-persongen", "run.py"))
R = importlib.util.module_from_spec(_spec)  # persongen's detector scoring (same file name as this one)
_spec.loader.exec_module(R)


def main(seeds=3):
    X, person, _ = D.load()
    res = {}
    for seed in range(seeds):
        real, fakes = M.build(X, person, seed)
        for g, (ff, fh, of, oh) in fakes.items():
            for aware in (False, True):
                key = f"{g} | {'profile-aware' if aware else 'population'} detector"
                res.setdefault(key, []).append(R.score(
                    real["fit"], real["held"], ff, fh, real["fit_owner"], real["held_owner"], of, oh, seed, aware))
        print("seed", seed, {k: round(v[-1], 3) for k, v in res.items()}, flush=True)
    json.dump({"auroc": res, "seeds": seeds}, open(os.path.join(HERE, "results", "markov.json"), "w"))
    with open(os.path.join(HERE, "results", "markov.txt"), "w") as f:
        f.write(f"generator\tpopulation detector\tprofile-aware detector\t(mean AUROC of {seeds} seeds; min..max of population)\n")
        for g in M.GENERATORS:
            a, b = res[f"{g} | population detector"], res[f"{g} | profile-aware detector"]
            f.write(f"{g}\t{np.mean(a):.3f}\t{np.mean(b):.3f}\t{min(a):.3f}..{max(a):.3f}\n")
    print(open(os.path.join(HERE, "results", "markov.txt")).read())


if __name__ == "__main__":
    main(int(sys.argv[1]) if len(sys.argv) > 1 else 3)
