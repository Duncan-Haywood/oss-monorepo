"""Collect results/<lens>.json into results/summary.json and results/summary.md (tables for README).

A flexible model "wins" a lens when its held-out gain over the baseline GLM has a 95% CI above
zero AND its calibration is acceptable (observed/expected within 0.9-1.1 and calibration slope
within 0.8-1.2).
"""
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
RES = HERE.parent / 'results'
FLEX = ['lightgbm_tuned', 'hgb_tuned', 'random_forest_tuned', 'extra_trees_tuned', 'enet_spline_pairwise', 'ebm',
        'stack_glm_lgbm']
LABEL = dict(baseline='baseline GLM', lightgbm_tuned='LightGBM (tuned)', hgb_tuned='sklearn HGB (tuned)',
             random_forest_tuned='random forest', extra_trees_tuned='extra trees', enet_spline_pairwise='elastic-net GLM + pairs',
             ebm='EBM', stack_glm_lgbm='stack GLM+LightGBM', lens_boosting="lens's own boosting",
             baseline_all_inputs='baseline GLM, all inputs', dyad_separate_glm='dyadic: separate partner terms',
             dyad_apim_glm='dyadic: actor-partner + gaps', dyad_summary_glm='dyadic: couple summaries only',
             lens_spline_pairs="lens's spline + pairs GLM", lens_glm_demographics_wealth="lens's GLM + wealth",
             lens_poisson_additive="lens's additive Poisson")
ORDER = ['nsfg_pooled', 'nlsy79_full', 'nlsy97', 'canada_gss', 'sipp_retro', 'gss_panel', 'hcmst', 'newlywed_la',
         'sipp_couples', 'nlsy79_couples', 'acs']


def ok_cal(r):
    return 0.9 <= r['observed_expected'] <= 1.1 and 0.8 <= r['calibration_slope'] <= 1.2


def f(x, n=2):
    return '' if x is None else f'{x:.{n}f}'


def ci(a, n=2):
    return '' if not a else f'[{a[0]:.{n}f}, {a[1]:.{n}f}]'


def main():
    out, md = {}, []
    md.append('| Lens | Rows / events | Baseline gain % | Best flexible | Its gain % | Difference (95% CI) | Slope | O/E | '
              'Discrimination: baseline -> best (diff 95% CI) | Wins? |')
    md.append('|' + '---|' * 10)
    for lens in ORDER:
        p = RES / f'{lens}.json'
        if not p.exists():
            continue
        d = json.loads(p.read_text())
        if 'main' not in d:
            continue
        rows = {r['model']: r for r in d['main']['rows']}
        b = rows['baseline']
        flex = [rows[k] for k in FLEX if k in rows]
        best = max(flex, key=lambda r: r['heldout_gain'])
        wins = [r['model'] for r in flex if r['diff_vs_baseline_ci'][0] > 0 and ok_cal(r)]
        lc = d.get('learning_curve', [])
        fc = d.get('feature_curve', {}).get('rows', [])
        s = dict(rows=d['data']['rows'], events=d['data']['events'], baseline=b, best=best, winners=wins,
                 null=d.get('null_permuted_labels', {}).get('heldout_gain'),
                 learning_curve=lc, feature_curve=fc, oot=d.get('out_of_time', {}).get('rows'),
                 tabpfn=d.get('tabpfn'), survival_native=d.get('survival_native', {}).get('rows'),
                 cure=d.get('cure_model'), competing=d.get('competing_risks'),
                 other={k: rows[k] for k in rows if k not in FLEX and k != 'baseline'})
        out[lens] = s
        disc = f"{f(b['discrimination']['value'], 3)} -> {f(best['discrimination']['value'], 3)} " \
               f"({best['discrimination']['diff_vs_baseline']:+.3f}, {ci(best['discrimination']['diff_ci'], 3)})"
        md.append(f"| {lens} | {d['data']['rows']:,} / {d['data']['events']:,.0f} | {f(b['heldout_gain'])} | "
                  f"{LABEL[best['model']]} | {f(best['heldout_gain'])} | {best['diff_vs_baseline']:+.2f} {ci(best['diff_vs_baseline_ci'])} | "
                  f"{f(best['calibration_slope'])} | {f(best['observed_expected'])} | {disc} | "
                  f"{', '.join(LABEL[w] for w in wins) if wins else 'no'} |")
    md.append('')
    md.append('Learning curves (held-out gain %, vs the full-data constant) at 10 / 25 / 50 / 75 / 100% of each training fold:')
    md.append('')
    md.append('| Lens | Baseline GLM | Tuned LightGBM | LightGBM minus GLM at 100% |')
    md.append('|---|---|---|---|')
    for lens, s in out.items():
        lc = s['learning_curve']
        if not lc:
            continue
        g = {m: [r['heldout_gain'] for r in sorted([r for r in lc if r['model'] == m], key=lambda r: r['fraction'])]
             for m in ('baseline', 'lightgbm_tuned')}
        md.append(f"| {lens} | {' / '.join(f(x) for x in g['baseline'])} | {' / '.join(f(x) for x in g['lightgbm_tuned'])} | "
                  f"{g['lightgbm_tuned'][-1] - g['baseline'][-1]:+.2f} |")
    md.append('')
    md.append('Feature-count curves (held-out gain % with the top-k features; k = number of non-duration inputs):')
    md.append('')
    md.append('| Lens | k: LightGBM / additive GLM |')
    md.append('|---|---|')
    for lens, s in out.items():
        fc = s['feature_curve']
        if not fc:
            continue
        ks = sorted({r['k'] for r in fc})
        cell = '; '.join(f"{k}: {f(next(r['heldout_gain'] for r in fc if r['k'] == k and r['model'] == 'lightgbm'))} / "
                         f"{f(next(r['heldout_gain'] for r in fc if r['k'] == k and r['model'] == 'additive_glm'))}" for k in ks)
        md.append(f'| {lens} | {cell} |')
    (RES / 'summary.json').write_text(json.dumps(out, indent=1))
    (RES / 'summary.md').write_text('\n'.join(md) + '\n')
    print('\n'.join(md))


if __name__ == '__main__':
    main()
