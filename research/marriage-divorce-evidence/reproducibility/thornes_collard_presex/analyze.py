"""Odds ratios for being divorced (versus still married) by pre- and extramarital sex, by gender,
from the Thornes & Collard (1979) table. 494 of the 1,036 people are divorced, far above any
population share, so the mix of divorced and married people reflects how the study recruited
them. Only odds ratios are read, because they stay valid when the outcome groups are sampled
separately (case-control).
Stdlib only. Run from this folder after `sh download.sh`:  python3 analyze.py
"""
import csv, math
from pathlib import Path

HERE = Path(__file__).resolve().parent
Z = 1.959963984540054


def cells():
    rows = list(csv.DictReader(open(HERE / 'raw' / 'PreSex.csv')))
    assert len(rows) == 16 and sum(int(r['Freq']) for r in rows) == 1036
    return [(r['MaritalStatus'], r['ExtramaritalSex'], r['PremaritalSex'], r['Gender'], int(r['Freq'])) for r in rows]


def table(cs, exposure, gender):
    """2x2 counts a (exposed, divorced), b (exposed, married), c (unexposed, divorced), d."""
    idx = {'ExtramaritalSex': 1, 'PremaritalSex': 2}[exposure]
    t = {(e, s): 0 for e in ('Yes', 'No') for s in ('Divorced', 'Married')}
    for c in cs:
        if gender in (None, c[3]):
            t[(c[idx], c[0])] += c[4]
    return t[('Yes', 'Divorced')], t[('Yes', 'Married')], t[('No', 'Divorced')], t[('No', 'Married')]


def woolf(a, b, c, d):
    o = (a * d) / (b * c)
    se = math.sqrt(1 / a + 1 / b + 1 / c + 1 / d)
    return o, o * math.exp(-Z * se), o * math.exp(Z * se)


def mantel_haenszel(cs, exposure):
    """Gender-stratified MH odds ratio with the Robins-Breslow-Greenland interval."""
    num = den = p_r = ps_qr = q_s = 0.0
    for g in ('Women', 'Men'):
        a, b, c, d = table(cs, exposure, g)
        n = a + b + c + d
        r, s = a * d / n, b * c / n
        p, q = (a + d) / n, (b + c) / n
        num += r
        den += s
        p_r += p * r
        ps_qr += p * s + q * r
        q_s += q * s
    o = num / den
    var = p_r / (2 * num ** 2) + ps_qr / (2 * num * den) + q_s / (2 * den ** 2)
    return o, o * math.exp(-Z * math.sqrt(var)), o * math.exp(Z * math.sqrt(var))


def main():
    cs = cells()
    out = []
    for exposure in ('PremaritalSex', 'ExtramaritalSex'):
        for g in ('Women', 'Men', None):
            a, b, c, d = table(cs, exposure, g)
            o, lo, hi = woolf(a, b, c, d)
            out.append(dict(exposure=exposure, group=g or 'All (crude)', exposed_divorced=a, exposed_married=b,
                            unexposed_divorced=c, unexposed_married=d, odds_ratio=round(o, 3),
                            ci_low=round(lo, 3), ci_high=round(hi, 3)))
        o, lo, hi = mantel_haenszel(cs, exposure)
        out.append(dict(exposure=exposure, group='Gender-adjusted (Mantel-Haenszel)', exposed_divorced='',
                        exposed_married='', unexposed_divorced='', unexposed_married='', odds_ratio=round(o, 3),
                        ci_low=round(lo, 3), ci_high=round(hi, 3)))
    with open(HERE / 'odds_ratios.csv', 'w', newline='') as fh:
        w = csv.DictWriter(fh, fieldnames=list(out[0]))
        w.writeheader()
        w.writerows(out)
    for r in out:
        print(f"{r['exposure']:16} {r['group']:36} OR {r['odds_ratio']:.2f} ({r['ci_low']:.2f}-{r['ci_high']:.2f})")


if __name__ == '__main__':
    main()
