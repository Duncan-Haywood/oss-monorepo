#!/usr/bin/env python3
"""Milestone 5b, eighth GSS-only step: what the same people say twice (GSS panels 2006-10 and 2016-20).

    python3 experiments/m5i_panel/run.py     # needs data/raw/gssr (data/download_gssr.sh) and pyreadr; about 1 minute

Steps 5e to 5g left two measurement questions open, and the cross-sections cannot settle either because they compare
different people. The panels re-interview the same people, which removes who-answers selection.

A. Is "raised Catholic" (`relig16`) a stable report? 5a to 5h treat it as fixed at age 16; 5e found a within-cohort rise
   of the raised-Catholic share in older cohorts and listed recall error as one explanation. The 2006, 2008 and 2010
   panels asked `relig16` again two and four years later. For each person with two reports: P(raised Catholic) at each
   wave, the net change (later minus first, design-based interval), the gross disagreement P(reports differ), the share
   of first-wave "raised Catholic" who say so again, and Cohen's kappa. The same for current religion (`relig`), where
   real switching is expected. Wave pairs 1-2 (weight `wtpannr12`) and 1-3 (`wtpannr123`), panels pooled. By the later
   wave's mode (in person or phone, both in the person's own words to an interviewer) and, for raised-Catholic, by
   current religion at wave 1 (do people who have left report a Catholic upbringing less often the second time?).

B. Does self-completion on the web lower reported attendance within the same person? m3 found web respondents in
   2022-24 report 9 points less weekly attendance than in-person respondents, mode and selection mixed. The 2016-20
   panel re-interviewed 2016 and 2018 respondents (first wave almost all in person) in 2020-21 by web or by phone.
   Within-person change in weekly attendance (`attend` >= 7), first wave to 2020, web minus phone: a difference in
   differences that removes fixed differences between people who later chose web or phone. Catholics (current
   religion at the first wave) and everyone. Weight `wtssnr_2`, design `vstrat_2`/`vpsu_2` (strata kept apart by sample year).

Predictions, written before running:
- A1. Raised-Catholic is a stable report: of those who say raised Catholic at wave 1, 90-97% say so again two years later;
  kappa at least 0.85; net change within +/-1 point with an interval that includes zero. If so, recall noise of this kind
  is symmetric and cannot by itself produce the 1-2 point within-cohort rise of 5e. Refuted if the net change's interval
  excludes zero with |net| >= 1 point, or kappa < 0.80.
- A2. Current Catholic is less stable than raised Catholic (higher gross disagreement), with a negative net change
  (people leave). Refuted if gross disagreement for current religion is not above raised religion's.
- A3. No prediction for whether wave-1 leavers drop the Catholic upbringing more often; reported either way.
- B1. Web lowers reported weekly attendance relative to phone within person: web minus phone change in weekly attendance
  negative, for everyone and for Catholics. Refuted for a pure mode effect if the point estimate for everyone is >= 0.
  The Catholic subsample (about 400 people) will be imprecise; it is reported, not tested.
Limits stated in advance: phone is not in person (both are interviewer modes, but the 2020 contrast is web vs phone,
not web vs face to face); mode in 2020 was chosen, not randomised, so time-varying differences between web and phone
respondents are not removed; 2020-21 fieldwork was in the pandemic, when churches closed, which affects both modes.
"""
import sys
from pathlib import Path
import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1]))
from cathdem import recode, survey, panel  # noqa: E402

GSSR = recode.RAW / 'gssr'
OUT = HERE


def interval(y, w, dom, s, p):
    m, se, n = survey.domain_mean(np.asarray(y, float), np.asarray(w, float), np.asarray(dom, bool), s, p)
    lo, hi = survey.ci(m, se)
    return m, lo, hi, n


def load_2006_10():
    """One row per person and wave pair, three panels pooled. Categorical labels are read as strings."""
    rows = []
    for k, f in enumerate(['gss_panel06_long', 'gss_panel08_long', 'gss_panel10_long']):
        d = recode.read_rda(GSSR / f'{f}.rda')
        for c in ['relig16', 'relig', 'mode']:
            d[c] = d[c].astype(str).where(d[c].notna())
        has_design = 'vstrat' in d.columns and 'vpsu' in d.columns
        w1 = d[d['wave'] == 1].set_index('firstid')
        for later, wt in [(2, 'wtpannr12'), (3, 'wtpannr123')]:
            wl = d[d['wave'] == later].set_index('firstid')
            j = w1[['relig16', 'relig']].join(wl[['relig16', 'relig', 'mode']], rsuffix='_l', how='inner')
            j['w'] = pd.to_numeric(w1[wt], errors='coerce').reindex(j.index).fillna(0.0).to_numpy()
            if has_design:
                vs = pd.to_numeric(w1['vstrat'], errors='coerce').reindex(j.index)
                vp = pd.to_numeric(w1['vpsu'], errors='coerce').reindex(j.index)
                j['strat'] = np.where(vs.notna(), (k + 1) * 100000 + vs.fillna(0), (k + 1) * 100000)
                j['psu'] = np.where(vp.notna(), vp.fillna(0), j.index.to_numpy(float) + (k + 1) * 1e6)
            else:  # simple random sampling approximation: one stratum, each person a PSU
                j['strat'] = (k + 1) * 100000
                j['psu'] = j.index.to_numpy(float) + (k + 1) * 1e6
            j['panel'] = 2006 + 2 * k
            j['pair'] = f'wave 1 to {later}'
            j['has_design'] = has_design
            rows.append(j.reset_index())
    return pd.concat(rows, ignore_index=True)


def ind(s, label):
    return np.where(s.notna(), (s == label).astype(float), np.nan)


def part_a(out):
    j = load_2006_10()
    designs = j.groupby('panel')['has_design'].first().to_dict()
    out.append(f'Panels 2006-10: design codes present {designs} (a panel without them uses each person as a PSU).')
    j['rc1'] = ind(j['relig16'], 'Catholic')
    j['rc2'] = ind(j['relig16_l'], 'Catholic')
    j['cc1'] = ind(j['relig'], 'Catholic')
    j['cc2'] = ind(j['relig_l'], 'Catholic')
    mode_l = j['mode'].fillna('missing')
    tab = []
    groups = [('all', np.ones(len(j), bool))]
    groups += [('later wave in person', (mode_l == 'In-Person').to_numpy()),
               ('later wave by phone', (mode_l == 'over the Phone').to_numpy())]
    groups += [('Catholic now at wave 1', (j['cc1'] == 1).to_numpy()),
               ('not Catholic now at wave 1', (j['cc1'] == 0).to_numpy())]
    for pair in ['wave 1 to 2', 'wave 1 to 3']:
        P = (j['pair'] == pair).to_numpy()
        s, p, w = j['strat'].to_numpy(float), j['psu'].to_numpy(float), j['w'].to_numpy(float)
        for item, a, b in [('raised Catholic', 'rc1', 'rc2'), ('Catholic now', 'cc1', 'cc2')]:
            A, B = j[a].to_numpy(float), j[b].to_numpy(float)
            both = ~np.isnan(A) & ~np.isnan(B)
            for gname, g in groups:
                if item == 'Catholic now' and gname.endswith('at wave 1'):
                    continue
                dom = P & g & both
                if dom.sum() < 30:
                    continue
                r = panel.agreement(A[dom], B[dom], w[dom])
                net = interval(B - A, w, dom, s, p)
                gross = interval(np.abs(B - A), w, dom, s, p)
                tab.append(dict(pair=pair, item=item, group=gname, n=r['n'], p_first=r['p1'], p_later=r['p2'],
                                net=net[0], net_lo=net[1], net_hi=net[2], gross=gross[0], gross_lo=gross[1],
                                gross_hi=gross[2], stay=r['stay'], kappa=r['kappa']))
        # mode contrast of disagreement and net change, raised Catholic and Catholic now
        for item, a, b in [('raised Catholic', 'rc1', 'rc2'), ('Catholic now', 'cc1', 'cc2')]:
            A, B = j[a].to_numpy(float), j[b].to_numpy(float)
            both = ~np.isnan(A) & ~np.isnan(B)
            ip = P & both & (mode_l == 'In-Person').to_numpy()
            ph = P & both & (mode_l == 'over the Phone').to_numpy()
            for what, y in [('gross', np.abs(B - A)), ('net', B - A)]:
                est, se, na, nb = survey.contrast(y, w, ph, ip, s, p)
                lo, hi = survey.ci(est, se)
                out.append(f'{pair}, {item}, {what} disagreement, phone minus in person: {100 * est:+.2f} points '
                           f'[{100 * lo:+.2f}, {100 * hi:+.2f}] (n {nb} in person, {na} phone)')
    t = pd.DataFrame(tab)
    t.to_csv(OUT / 't27_panel_agreement.csv', index=False, float_format='%.4f')
    out.append('')
    out.append('t27: within-person agreement, panels 2006-10 pooled (percentages; net and gross with 95% design intervals)')
    for _, r in t.iterrows():
        out.append(f"  {r['pair']:<12} {r['item']:<16} {r['group']:<28} n={r['n']:>5}  first {100 * r['p_first']:5.1f}  "
                   f"later {100 * r['p_later']:5.1f}  net {100 * r['net']:+5.2f} [{100 * r['net_lo']:+.2f}, {100 * r['net_hi']:+.2f}]  "
                   f"gross {100 * r['gross']:4.1f} [{100 * r['gross_lo']:.1f}, {100 * r['gross_hi']:.1f}]  "
                   f"stay {100 * r['stay']:5.1f}  kappa {r['kappa']:.3f}")
    return t


def part_b(out):
    d = recode.read_rda(GSSR / 'gss_panel20.rda')
    first = np.where(d['samptype'] == 2016, '1a', '1b')
    pick = lambda v: pd.Series(np.where(first == '1a', d[f'{v}_1a'], d[f'{v}_1b']), index=d.index).astype(float)
    att1, rel1, mode1 = pick('attend'), pick('relig'), pick('mode')
    att2, mode2 = d['attend_2'].astype(float), d['mode_2']
    wk1 = np.where(att1.notna(), (att1 >= 7).astype(float), np.nan)
    wk2 = np.where(att2.notna(), (att2 >= 7).astype(float), np.nan)
    w = d['wtssnr_2'].astype(float).fillna(0.0).to_numpy()
    s = (d['samptype'].astype(float) * 10000 + d['vstrat_2'].fillna(0)).to_numpy(float)
    p = d['vpsu_2'].fillna(0).to_numpy(float)
    both = ~np.isnan(wk1) & ~np.isnan(wk2) & (mode1 == 1).to_numpy()
    web, phone = both & (mode2 == 4).to_numpy(), both & (mode2 == 2).to_numpy()
    rows = []
    for gname, g in [('everyone', np.ones(len(d), bool)), ('Catholic at first wave', (rel1 == 2).to_numpy()),
                     ('not Catholic at first wave', (rel1.notna() & (rel1 != 2)).to_numpy())]:
        for y, lab in [(wk1, 'weekly, first wave'), (wk2, 'weekly, 2020'), (wk2 - wk1, 'change, first wave to 2020')]:
            mw = interval(y, w, web & g, s, p)
            mp = interval(y, w, phone & g, s, p)
            est, se, na, nb = survey.contrast(y, w, web & g, phone & g, s, p)
            lo, hi = survey.ci(est, se)
            rows.append(dict(group=gname, quantity=lab, web=mw[0], phone=mp[0], web_minus_phone=est, lo=lo, hi=hi,
                             n_web=na, n_phone=nb))
    t = pd.DataFrame(rows)
    t.to_csv(OUT / 't28_panel_mode_attendance.csv', index=False, float_format='%.4f')
    out.append('')
    out.append('t28: weekly attendance, 2016-20 panel, first wave in person, 2020 by web or phone (percent; 95% design intervals)')
    for _, r in t.iterrows():
        out.append(f"  {r['group']:<28} {r['quantity']:<28} web {100 * r['web']:+6.1f}  phone {100 * r['phone']:+6.1f}  "
                   f"web-phone {100 * r['web_minus_phone']:+6.2f} [{100 * r['lo']:+.2f}, {100 * r['hi']:+.2f}]  "
                   f"n {r['n_web']}/{r['n_phone']}")
    return t


def main():
    out = []
    part_a(out)
    part_b(out)
    text = '\n'.join(out) + '\n'
    (OUT / 'results.txt').write_text(text)
    print(text)


if __name__ == '__main__':
    main()
