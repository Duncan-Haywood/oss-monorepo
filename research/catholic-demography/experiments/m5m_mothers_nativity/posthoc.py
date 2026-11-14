#!/usr/bin/env python3
"""Post hoc (written after reading run.py's results; point estimates, no intervals, no predictions tested).

run.py found that once children of US-born mothers get the Catholic share of US-born women (p_US), their mothers are
4 points more Catholic (M) than the model says. This splits that group by father's nativity (`parborn` 0 both US-born,
1 mother US-born / father foreign-born, 3 mother US-born / father unknown) and reports the fertility ratio the model
would need to match M given p_US: rho_needed = odds(M) / odds(p_US), against the GSS rho_US actually measured.

    python3 experiments/m5m_mothers_nativity/posthoc.py > experiments/m5m_mothers_nativity/posthoc.txt
"""
import importlib.util
from pathlib import Path
import numpy as np

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('m5m', HERE / 'run.py')
m5m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m5m)


def odds(x):
    return x / (1 - x)


def main():
    d = m5m.prepare()
    one = np.ones(len(d))
    _, mgen, _, tabs = m5m.models(d, one)
    p_us, rho_us = tabs['US mother'][0], tabs['US mother'][1]
    pc = np.clip(d['cohort'].fillna(1950).to_numpy().astype(int) - 28 - m5m.Y0, 0, m5m.Y1 - m5m.Y0)
    w = d['w'].to_numpy()
    coh = d['cohort'].fillna(0).to_numpy()
    pb = d['parborn'].to_numpy()
    M, R = d['mcath'].to_numpy(), d['raised'].to_numpy()
    base = d['module'].to_numpy() & (d['mnat'].to_numpy() == 'US mother')
    print('US-born mother, module sample; percent; rho as ratios')
    print(f"{'cohorts':10} {'parborn':28} {'n':>5} {'R':>6} {'M':>6} {'p_US':>6} {'M_gen':>6} {'M-M_gen':>8} "
          f"{'rho_US':>7} {'rho_needed':>10}")
    for lo, hi in ((1925, 1964), (1965, 1999)):
        for lab, codes in (('all US-born mothers', [0, 1, 3]), ('0 both parents US-born', [0]),
                           ('1 father foreign-born', [1]), ('3 father unknown', [3])):
            s = base & (coh >= lo) & (coh <= hi) & np.isin(pb, codes)
            if s.sum() == 0:
                continue
            ws = w[s]
            m_, r_ = np.average(M[s], weights=ws), np.average(R[s], weights=ws)
            p_ = np.average(p_us[pc[s]], weights=ws)
            mg = np.average(mgen[s], weights=ws)
            rr = np.average(rho_us[pc[s]], weights=ws)
            print(f"{lo}-{hi:<5} {lab:28} {int(s.sum()):5d} {100*r_:6.2f} {100*m_:6.2f} {100*p_:6.2f} {100*mg:6.2f} "
                  f"{100*(m_-mg):8.2f} {rr:7.3f} {odds(m_)/odds(p_):10.3f}")


if __name__ == '__main__':
    main()
