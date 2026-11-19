"""Figures VII-a and VII-b of the draft (section VII), drawn from the same results files and parsers that generate table VII-1
(`check_numbers.TABLE7`), so the figures and the table cannot disagree. Runs no flights.

VII-a: identified total (lever 2, 45 deg, cap; diverged flights at the 33, 36 and 39.1 ms laws, both geometries, of 2,304) and the
75 ms-law count (of 768) against the training ceiling: the 39.1 ms-floor sweep (78.2-200 ms) as one series, the 2x-wide
intervals (floor 33-75 ms, ceiling = 2 x floor) as another.
VII-b: rise time to 90% of a 1 m step (36 ms law, median of the two geometries' medians) against the identified total for the
nine rows that have a step test: the coverage frontier a builder picks a point on.
Usage: python3 figures_vii.py   (writes fig_VIIa.png and fig_VIIb.png beside this file)"""
import os
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import check_numbers as C

HERE = os.path.dirname(os.path.abspath(__file__))


def rows():
    out = []
    for lag, ms, path, label, resp in C.TABLE7:
        lo, hi = (float(v) for v in lag.split("–"))
        idt, d75, rise = 0, 0, []
        has75 = True
        for geom in ("above", "below"):
            _, c = C._stress(path, geom, label)
            idt += c["33"] + c["36"] + c["39.1"]
            if "75" in c:
                d75 += c["75"]
            else:
                has75 = False
            if resp:
                rise.append(C._rise(resp, geom, label))
        out.append(dict(lag=lag, ms=ms, lo=lo, hi=hi, idt=idt, d75=d75 if has75 else None, rise=sum(rise) / 2 if rise else None))
    return out


def fig_a(rs):
    fl = sorted((r for r in rs if abs(r["lo"] - 39.1) < 1e-9), key=lambda r: r["hi"])
    w2 = sorted((r for r in rs if abs(r["hi"] - 2 * r["lo"]) < 0.01 * r["hi"] and abs(r["lo"] - 39.1) > 1e-9), key=lambda r: r["hi"])
    fig, ax = plt.subplots(1, 2, figsize=(10, 3.8))
    for k, a, ttl in (("idt", ax[0], "identified lags 33-39.1 ms (of 2,304 flights)"), ("d75", ax[1], "75 ms law (of 768 flights)")):
        for ser, c, m, lab in ((fl, "#1f6fb2", "o", "floor 39.1 ms, ceiling swept"), (w2, "#c0392b", "s", "ceiling = 2 x floor")):
            pts = [(r["hi"], r[k]) for r in ser if r[k] is not None]
            a.plot([p[0] for p in pts], [p[1] for p in pts], marker=m, c=c, lw=1.2, ms=5, label=lab)
        a.axvspan(33, 39.1, color="0.85", lw=0)
        a.text(36, 0.97, "identified", transform=a.get_xaxis_transform(), rotation=90, ha="center", va="top", fontsize=7, color="0.35")
        a.set_xlabel("training ceiling on the plant lag (ms)")
        a.set_ylabel("diverged flights, lever 2, 45 deg, cap")
        a.set_title(ttl, fontsize=9)
        a.spines[["top", "right"]].set_visible(False)
    ax[0].legend(fontsize=8, frameon=False)
    fig.tight_layout()
    fig.savefig(os.path.join(HERE, "fig_VIIa.png"), dpi=130)


def fig_b(rs):
    fig, ax = plt.subplots(figsize=(5.6, 4))
    for r in rs:
        if r["rise"] is None:
            continue
        floor = abs(r["lo"] - 39.1) < 1e-9
        ax.scatter(r["idt"], r["rise"], c="#1f6fb2" if floor else "#c0392b", marker="o" if floor else "s", s=28, zorder=3)
        ax.annotate(r["lag"], (r["idt"], r["rise"]), fontsize=7, xytext=(4, 3), textcoords="offset points")
    ax.scatter([], [], c="#1f6fb2", marker="o", label="floor 39.1 ms")
    ax.scatter([], [], c="#c0392b", marker="s", label="ceiling = 2 x floor")
    ax.set_xlabel("identified total (diverged of 2,304)")
    ax.set_ylabel("rise to 90% of a 1 m step, 36 ms law (s)")
    ax.legend(fontsize=8, frameon=False)
    ax.spines[["top", "right"]].set_visible(False)
    fig.tight_layout()
    fig.savefig(os.path.join(HERE, "fig_VIIb.png"), dpi=130)


if __name__ == "__main__":
    rs = rows()
    for r in rs:
        print(r)
    fig_a(rs); fig_b(rs)
    print("wrote fig_VIIa.png, fig_VIIb.png")
