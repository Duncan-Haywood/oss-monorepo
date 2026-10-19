"""Do the sizes and line counts of git-tracked files follow Benford's law? Stdlib only."""
import json, math, os, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__))
BENFORD = [math.log10(1 + 1 / d) for d in range(1, 10)]
CHI2_CRIT_8DF_5PCT = 15.507  # chi-square critical value, 8 degrees of freedom, alpha = 0.05


def first_digit(n):
    return int(str(int(n))[0])


def digit_freqs(values):
    vals = [v for v in values if v >= 1]
    counts = [0] * 9
    for v in vals:
        counts[first_digit(v) - 1] += 1
    return counts, len(vals)


def mad(counts, n):
    """Nigrini's mean absolute deviation from Benford, in proportion units."""
    return sum(abs(c / n - b) for c, b in zip(counts, BENFORD)) / 9


def chi2(counts, n):
    return sum((c - n * b) ** 2 / (n * b) for c, b in zip(counts, BENFORD))


def nigrini_band(m):
    """Conformity bands for first-digit MAD from Nigrini (2012), Benford's Law."""
    if m <= 0.006: return "close"
    if m <= 0.012: return "acceptable"
    if m <= 0.015: return "marginal"
    return "nonconforming"


def summarise(values):
    counts, n = digit_freqs(values)
    if n == 0:
        return {"n": 0}
    x2 = chi2(counts, n)
    m = mad(counts, n)
    return {"n": n, "counts": counts, "chi2": round(x2, 2), "chi2_reject_5pct": x2 > CHI2_CRIT_8DF_5PCT,
            "mad": round(m, 5), "band": nigrini_band(m)}


def tracked_files(root):
    out = subprocess.run(["git", "-C", root, "ls-files", "-z"], capture_output=True, check=True).stdout
    return [p for p in out.decode("utf-8", "surrogateescape").split("\0") if p]


def measure(root, ext=None):
    sizes, lines = [], []
    for p in tracked_files(root):
        if ext is not None and os.path.splitext(p)[1] != ext:
            continue
        fp = os.path.join(root, p)
        if not os.path.isfile(fp) or os.path.islink(fp):
            continue
        sizes.append(os.path.getsize(fp))
        try:
            with open(fp, "rb") as f:
                data = f.read()
        except OSError:
            continue
        if b"\0" not in data:
            lines.append(data.count(b"\n"))
    return sizes, lines


def main():
    root = os.path.abspath(os.path.join(HERE, "..", ".."))
    res = {"commit": subprocess.run(["git", "-C", root, "rev-parse", "HEAD"], capture_output=True, text=True).stdout.strip(),
           "benford": [round(b, 5) for b in BENFORD], "groups": {}}
    for label, ext in (("all", None), (".py", ".py"), (".md", ".md"), (".json", ".json"), (".html", ".html")):
        sizes, lines = measure(root, ext)
        res["groups"][label] = {"bytes": summarise(sizes), "lines": summarise(lines),
                                "distinct bytes": summarise(sorted(set(sizes))), "distinct lines": summarise(sorted(set(lines)))}
    json.dump(res, open(os.path.join(HERE, "results.json"), "w"), indent=1)
    with open(os.path.join(HERE, "results.txt"), "w") as f:
        f.write(f"commit {res['commit']}\nbenford  " + " ".join(f"{b:.3f}" for b in BENFORD) + "\n")
        for g, d in res["groups"].items():
            for k in ("bytes", "lines", "distinct bytes", "distinct lines"):
                s = d[k]
                if s["n"] == 0: continue
                f.write(f"{g:6s} {k:14s} n={s['n']:6d} chi2={s['chi2']:9.1f} MAD={s['mad']:.4f} {s['band']:13s} "
                        + " ".join(f"{c / s['n']:.3f}" for c in s["counts"]) + "\n")
    print(open(os.path.join(HERE, "results.txt")).read())


if __name__ == "__main__":
    main()
