"""Build `bcdj_villages.json.gz` from the Banerjee, Chandrasekhar, Duflo and Jackson (2013)
replication archive (Harvard Dataverse doi:10.7910/DVN/U3BIHX, CC0 1.0).

The Dataverse download sits behind a guestbook form, so this session read the same archive
(`datav4.0`) from a public GitHub mirror (ftschofenig/EmergentDirectedness, directory
`datav4.0/`). Usage:

    python3 data/build_dataset.py "<path to datav4.0/Matlab Replication>"

It keeps exactly what the paper's own estimation code (`GMMDiffusion/Main_models_1_3.m`)
uses: the 43 villages with microfinance entry, the household "all relationships" network
restricted to the giant component (`adjacencymatrix.mat`, already restricted), and per
household microfinance take-up (`MF<v>.csv`), whether it has a leader (`HHhasALeader<v>.csv`,
column 2) and the six covariates (`hhcovariates<v>.csv`, columns 1 to 6), all pruned to the
giant component with `inGiant<v>.csv`, plus the months each village was observed after
entry (`TMonths` in the same script). Needs numpy and scipy.
"""
import gzip
import json
import os
import sys

import numpy as np
import scipy.io

VILLS = [1, 2, 3, 4, 6, 9, 12, 15, 19, 20, 21, 23, 24, 25, 29, 31, 32, 33, 36, 39, 42, 43,
         45, 46, 47, 48, 50, 51, 52, 55, 57, 59, 60, 62, 64, 65, 67, 68, 70, 71, 72, 73, 75]
TMONTHS = [31, 35, 15, 35, 13, 2, 32, 5, 31, 35, 31, 29, 19, 22, 25, 25, 23, 23, 24, 25, 26, 24,
           17, 16, 17, 13, 19, 20, 20, 19, 22, 14, 12, 15, 10, 19, 18, 18, 19, 19, 19, 17, 17]
assert len(VILLS) == len(TMONTHS) == 43


def main(root, out):
    nets = root + "/India Networks/"
    X = scipy.io.loadmat(nets + "adjacencymatrix.mat")["X"]
    villages = []
    for k, v in enumerate(VILLS):
        A = np.asarray(X[k, 0])
        giant = np.loadtxt(nets + f"inGiant{v}.csv").astype(bool)
        take = np.loadtxt(nets + f"MF{v}.csv")[giant].astype(int)
        lead = np.loadtxt(nets + f"HHhasALeader{v}.csv")[:, 1][giant].astype(int)
        cov = np.loadtxt(nets + f"hhcovariates{v}.csv")[:, :6][giant]
        n = A.shape[0]
        assert n == giant.sum() == len(take), (v, n, giant.sum())
        assert (A == A.T).all() and not A.diagonal().any()
        i, j = np.nonzero(np.triu(A, 1))
        villages.append({
            "village": v, "months": TMONTHS[k], "n": int(n),
            "edges": [[int(a), int(b)] for a, b in zip(i, j)],
            "takeup": take.tolist(), "leader": lead.tolist(),
            "covariates": [[round(float(x), 7) for x in row] for row in cov],
        })
    meta = {"source": "Banerjee, Chandrasekhar, Duflo, Jackson (2013), The Diffusion of "
                      "Microfinance, Science 341:1236498; replication data "
                      "doi:10.7910/DVN/U3BIHX (CC0 1.0), datav4.0/Matlab Replication",
            "covariates": "hhcovariates columns 1-6 as used by Main_models_1_3.m",
            "villages": villages}
    with gzip.open(out, "wt") as f:
        json.dump(meta, f, separators=(",", ":"))
    print(f"wrote {out}: {len(villages)} villages, "
          f"{sum(x['n'] for x in villages)} households, "
          f"{sum(len(x['edges']) for x in villages)} ties")


if __name__ == "__main__":
    here = os.path.dirname(os.path.abspath(__file__))
    main(sys.argv[1], os.path.join(here, "bcdj_villages.json.gz"))
