"""Figure: leaks within 300 m against the baseline lag, abrupt and incipient leaks apart.

    python experiments/step18-lagged/figure.py   # writes experiments/step18-lagged/lag_sweep.svg

Reads this step's results.txt: A (nominal model, q = 5) on P-lag(L), the published pressures with
no model or leak list in the residual, with step 11's D1 regression residual and step 17's
one-leak oracle as reference lines.
"""
import re
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
from matplotlib.ticker import MaxNLocator  # noqa: E402

HERE = Path(__file__).resolve().parent
PAT = re.compile(r"^\s+(.+?)\s+\d+ of 32 .*abrupt (\d+) of 15, incipient (\d+) of 17")


def main():
    res = {}
    for ln in (HERE / "results.txt").read_text().splitlines():
        m = PAT.match(ln)
        if m:
            res.setdefault(m.group(1), (int(m.group(2)), int(m.group(3))))
    lags = [24, 72, 168, 336]
    fig, axes = plt.subplots(1, 2, figsize=(9, 3.8), sharey=False)
    for ax, k, n, lab in ((axes[0], 0, 15, "abrupt leaks (15)"), (axes[1], 1, 17, "incipient leaks (17)")):
        ys = [res[f"A on P-lag({L})"][k] for L in lags]
        ax.plot(lags, ys, "o-", color="#2f6db5", label="lagged baseline, published pressures")
        ax.axhline(res["ref: A on one-leak oracle (step 17)"][k], color="#d17a22", ls="--", lw=1,
                   label="one-leak oracle residual (step 17)")
        ax.axhline(res["ref: A on D1 regression (step 11)"][k], color="#666", ls=":", lw=1.2,
                   label="D1 regression residual (step 11)")
        ax.set_xscale("log")
        ax.set_xticks(lags, [f"{L} h" for L in lags])
        ax.minorticks_off()
        ax.set_ylim(0, n)
        ax.yaxis.set_major_locator(MaxNLocator(integer=True))
        ax.set_xlabel("baseline lag L")
        ax.set_ylabel("within 300 m")
        ax.set_title(lab, fontsize=10)
    axes[1].legend(fontsize=7.5, loc="upper left", framealpha=0.95)
    fig.suptitle("L-Town, nominal-model localisation on a lagged baseline: no lag closes the gap to the oracle", fontsize=10)
    fig.tight_layout()
    fig.savefig(HERE / "lag_sweep.svg")


if __name__ == "__main__":
    main()
