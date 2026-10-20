"""Re-derive the ml_couples analysis from the public NLSY79 release and compare with what is committed.

The committed couple models (../ml_couples) were trained from person-level extracts that are not
in git. This script rebuilds them from the official archive without touching the committed
folders: it copies the four upstream scripts unchanged into a scratch tree, drops in the
extracts that extract_nlsy79_full.py streamed out of the archive, runs

    annual_nlsy/analyze_annual_nlsy.py [--include-separated]
    pairing_nlsy/analyze_pairing_nlsy.py
    couple_profiles/analyze_couple_profiles.py
    ml_couples/train_models.py

and compares every audit and held-out table with the committed copy. The comparison (aggregate
only) is written to reproduction_check.json here. The scratch tree holds person-level rows and
stays outside git.

Usage: python3 reproduce_ml_couples.py EXTRACT_DIR SCRATCH_DIR [PYTHON] [--avx512-off] [--compare-only]
PYTHON defaults to this interpreter; ml_couples/feature_manifest.json pins Python 3.11.1,
numpy 2.3.4, pandas 2.3.3, scikit-learn 1.7.2.
"""
import json, os, shutil, subprocess, sys
from pathlib import Path
import numpy as np, pandas as pd

HERE = Path(__file__).resolve().parent
REPRO = HERE.parent
EXTRACTS, SCRATCH = Path(sys.argv[1]), Path(sys.argv[2])
PY = sys.argv[3] if len(sys.argv) > 3 and not sys.argv[3].startswith('--') else sys.executable
# The upstream scripts take weighted quartiles after np.argsort's default (unstable) sort, so
# the order of tied incomes, which depends on the SIMD sort kernel numpy picks for the CPU,
# moves a few cutpoints (e.g. 2000 couple-wage Q1: committed 45,000 vs 44,986.4 here) and a
# handful of intervals across quartile boundaries. --avx512-off reruns with numpy's AVX-512
# kernels disabled: that recovers some committed cutpoints but not all, so the committed run's
# exact tie order is not recoverable from a session. METHODS.md reports both.
AVX512_OFF = '' if '--avx512-off' not in sys.argv else 'AVX512F AVX512CD AVX512_SKX AVX512_CLX AVX512_CNL AVX512_ICL AVX512_SPR'

STEPS = [('annual_nlsy', ['analyze_annual_nlsy.py'], ['annual_nlsy_extract.csv', 'annual_nlsy_codebook.json']),
         ('pairing_nlsy', ['analyze_pairing_nlsy.py'], ['pairing_nlsy_extract.csv', 'pairing_nlsy_codebook.json']),
         ('couple_profiles', ['analyze_couple_profiles.py'], []),
         ('ml_couples', ['train_models.py'], [])]


def setup():
    for folder, scripts, extracts in STEPS:
        d = SCRATCH / 'reproducibility' / folder
        d.mkdir(parents=True, exist_ok=True)
        for s in scripts:
            shutil.copy2(REPRO / folder / s, d / s)
        for e in extracts:
            shutil.copy2(EXTRACTS / e, d / e)


def run():
    env = dict(os.environ, OPENBLAS_NUM_THREADS='1')
    if AVX512_OFF:
        env['NPY_DISABLE_CPU_FEATURES'] = AVX512_OFF
    base = SCRATCH / 'reproducibility'
    cmds = [('annual_nlsy', ['analyze_annual_nlsy.py']),
            ('annual_nlsy', ['analyze_annual_nlsy.py', '--include-separated']),
            ('pairing_nlsy', ['analyze_pairing_nlsy.py']),
            ('couple_profiles', ['analyze_couple_profiles.py']),
            ('ml_couples', ['train_models.py'])]
    for folder, args in cmds:
        print('running', folder, *args, flush=True)
        subprocess.run([PY, *args], cwd=base / folder, env=env, check=True, stdout=subprocess.DEVNULL)


def cmp_json(rel):
    a = json.loads((REPRO / rel).read_text())
    b = json.loads((SCRATCH / 'reproducibility' / rel).read_text())
    diffs = {}

    def walk(x, y, path):
        if isinstance(x, dict):
            for k in x:
                walk(x[k], y.get(k) if isinstance(y, dict) else None, f'{path}.{k}')
        elif isinstance(x, list) and isinstance(y, list) and len(x) == len(y):
            for i, (u, v) in enumerate(zip(x, y)):
                walk(u, v, f'{path}[{i}]')
        elif isinstance(x, (int, float)) and isinstance(y, (int, float)) and not isinstance(x, bool):
            if abs(x - y) > 1e-9 * max(1, abs(x)):
                diffs[path] = dict(committed=x, reproduced=y)
        elif x != y and not (isinstance(x, str) and path.endswith('python_sklearn')):
            diffs[path] = dict(committed=x, reproduced=y)
    walk(a, b, '')
    return dict(file=rel, identical=not diffs, differences=diffs)


def cmp_csv(rel, key):
    a = pd.read_csv(REPRO / rel)
    b = pd.read_csv(SCRATCH / 'reproducibility' / rel)
    out = dict(file=rel, rows_committed=len(a), rows_reproduced=len(b))
    if len(a) != len(b) or list(a.columns) != list(b.columns):
        out['identical'] = False
        return out
    num = [c for c in a.columns if c not in key and pd.api.types.is_numeric_dtype(a[c])]
    rel_err = (a[num] - b[num]).abs() / a[num].abs().clip(lower=1e-12)
    out.update(identical=bool(((a[key] == b[key]).all().all()) and (rel_err.max().max() < 1e-6)),
               max_relative_difference=float(np.nanmax(rel_err.to_numpy())) if len(num) else 0.0,
               worst_column=str(rel_err.max().idxmax()) if len(num) else None)
    return out


def compare():
    checks = [cmp_json('annual_nlsy/annual_audit.json'),
              cmp_json('annual_nlsy/legally_married_primary/annual_audit.json'),
              cmp_json('pairing_nlsy/pairing_audit.json'),
              cmp_json('couple_profiles/joint_model_audit.json'),
              cmp_json('ml_couples/sample_audit.json'),
              cmp_csv('annual_nlsy/legally_married_primary/annual_crude_rates.csv', ['sex', 'factor', 'category', 'caution']),
              cmp_csv('pairing_nlsy/pairing_crude_rates.csv', ['reporting_sex', 'factor', 'category', 'caution']),
              cmp_csv('couple_profiles/joint_model_coefficients.csv', ['term']),
              cmp_csv('ml_couples/fold_metrics.csv', ['fold', 'model']),
              cmp_csv('ml_couples/heldout_model_comparison.csv', ['model']),
              cmp_csv('ml_couples/heldout_calibration.csv', ['model', 'bin']),
              cmp_csv('ml_couples/later_wave_model_comparison.csv', ['model'])]
    for kind in ['additive_core', 'additive_enriched', 'spline_and_pair_interactions']:
        checks.append(cmp_csv(f'ml_couples/coefficients_{kind}.csv', ['feature']))
    a = pd.read_csv(REPRO / 'ml_couples/heldout_model_comparison.csv').set_index('model')
    b = pd.read_csv(SCRATCH / 'reproducibility/ml_couples/heldout_model_comparison.csv').set_index('model')
    headline = {m: dict(committed=round(float(a.loc[m, 'deviance_improvement_percent']), 4),
                        reproduced=round(float(b.loc[m, 'deviance_improvement_percent']), 4)) for m in a.index}
    audit = json.loads((SCRATCH / 'reproducibility/ml_couples/sample_audit.json').read_text())
    out = dict(
        source='https://nlsinfo.org/cohort-data/nlsy79_all_1979-2022.zip (sha256 in SHA256SUMS)',
        numpy_cpu_features_disabled=AVX512_OFF or None,
        python=subprocess.run([PY, '-c', 'import sys,numpy,pandas,sklearn;print(sys.version.split()[0],numpy.__version__,pandas.__version__,sklearn.__version__)'],
                              capture_output=True, text=True).stdout.split(),
        published_sample=dict(intervals=40818, respondents=5735, events=726),
        reproduced_sample=dict(intervals=audit['intervals'], respondents=audit['respondents'], events=audit['events']),
        heldout_deviance_improvement_percent=headline,
        all_identical=all(c.get('identical') for c in checks),
        checks=checks)
    (HERE / 'reproduction_check.json').write_text(json.dumps(out, indent=1) + '\n')
    print(json.dumps({k: out[k] for k in ['reproduced_sample', 'heldout_deviance_improvement_percent', 'all_identical']}, indent=1))
    for c in checks:
        print(c['file'], 'identical' if c.get('identical') else 'DIFFERS', c.get('max_relative_difference', ''), list(c.get('differences', {}))[:5])


if __name__ == '__main__':
    if '--compare-only' not in sys.argv:
        setup()
        run()
    compare()
