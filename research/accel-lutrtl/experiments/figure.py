import json, os
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
d = os.path.dirname(__file__)
rows = [r for r in json.load(open(f"{d}/results.json")) if r["K"] == 16]
n = [r["N"] for r in rows]
fig, ax = plt.subplots(1, 2, figsize=(9, 3.4))
ax[0].plot(n, [r["mac"]["dp_ge"] for r in rows], "o-", label="MAC engine")
ax[0].plot(n, [r["table"]["dp_ge"] for r in rows], "s-", label="product-table engine")
ax[0].set(xlabel="outputs N (K=16)", ylabel="datapath area, assumed GE (ROM excluded)", xscale="log", yscale="log"); ax[0].legend()
ax[1].plot(n, [r["mac"]["cycles"] for r in rows], "o-", label="MAC engine")
ax[1].plot(n, [r["table"]["cycles"] for r in rows], "s-", label="product-table engine")
ax[1].set(xlabel="outputs N (K=16)", ylabel="cycles per inference", xscale="log", yscale="log"); ax[1].legend()
fig.tight_layout(); fig.savefig(f"{d}/rtl_cost.png", dpi=110)
