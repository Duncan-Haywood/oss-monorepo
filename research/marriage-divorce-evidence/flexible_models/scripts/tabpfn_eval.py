"""TabPFN (v2, pretrained transformer for small tables; Hollmann et al. 2025, Nature) on the small
binary lenses, held out on the same outer folds as the main benchmark. Evaluation only: it is
never exported to the app (its predictions need the 30-million-parameter network at run time).

  python3 tabpfn_eval.py export <lens>   (lens environment: writes <scratch>/flex_data/rows_<lens>.npz)
  python  tabpfn_eval.py fit <lens>      (TabPFN environment: tabpfn==2.0.9, torch CPU)

TabPFN v2 accepts at most 10,000 training rows and 500 features; larger training folds are
subsampled by group (seeded). It cannot use survey weights, so it is fitted unweighted; held-out
metrics use the lens weights like every other model. Later TabPFN releases (>= 2.5) need a
licence key and an account, so they were not used.
"""
import json
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
SCRATCH = Path('/tmp/claude-0/-home-user-oss-monorepo/923dbe75-fd8c-5824-8bb5-c7e2b6a2405e/scratchpad')
MAX_ROWS = 10000


def export(lens):
    import importlib
    import os
    import pandas as pd
    from export_survival import design
    L = importlib.import_module(f'lenses.{lens}').load()
    X, names = design(L.df.reset_index(drop=True), L.num, L.cat)
    cache = Path(os.environ.get('FLEX_CACHE', SCRATCH / 'flex_cache'))
    bench = pd.read_pickle(cache / f'{L.name}_main.pkl')
    R = len(bench['preds'])
    np.savez_compressed(SCRATCH / 'flex_data' / f'rows_{L.name}.npz', X=X, y=L.y, w=L.w, group=L.group,
                        folds=np.stack(L.folds[:R]), baseline=np.stack([P['baseline'] for P in bench['preds']]),
                        constant=np.stack([P['constant'] for P in bench['preds']]))
    print('exported', X.shape, R)


def fit(lens):
    import time
    from tabpfn import TabPFNClassifier
    sys.path.insert(0, str(HERE))
    import flex
    z = np.load(SCRATCH / 'flex_data' / f'rows_{lens}.npz')
    X, y, w, group, folds = z['X'], z['y'], z['w'], z['group'], z['folds']
    rng = np.random.default_rng(flex.SEED)
    P = np.zeros(folds.shape)
    t0 = time.time()
    for r in range(folds.shape[0]):
        for f in np.unique(folds[r]):
            tr, te = np.flatnonzero(folds[r] != f), np.flatnonzero(folds[r] == f)
            if len(tr) > MAX_ROWS:
                g = np.unique(group[tr])
                keep = rng.choice(g, int(len(g) * MAX_ROWS / len(tr)), replace=False)
                tr = tr[np.isin(group[tr], keep)][:MAX_ROWS]
            m = TabPFNClassifier(device='cpu', random_state=flex.SEED, n_estimators=4, memory_saving_mode=True)
            m.fit(X[tr], y[tr].astype(int))
            for k in range(0, len(te), 500):   # predict in chunks to bound memory
                P[r, te[k:k + 500]] = m.predict_proba(X[te[k:k + 500]])[:, 1]
            print(f'repeat {r} fold {f}: {len(tr)} train rows, {time.time() - t0:.0f}s', flush=True)
    import copy

    class V:
        pass
    L = V()
    L.group, L.y, L.w, L.e, L.family = group, y, w, None, 'binary'
    losses = {'constant': np.mean([flex.row_loss('binary', y, z['constant'][r], w) for r in range(len(P))], axis=0),
              'baseline': np.mean([flex.row_loss('binary', y, z['baseline'][r], w) for r in range(len(P))], axis=0),
              'tabpfn_v2': np.mean([flex.row_loss('binary', y, P[r], w) for r in range(len(P))], axis=0)}
    bt = flex.cluster_boot_gain(L, losses, 'baseline')
    cal = [flex.calibration('binary', y, P[r], w) for r in range(len(P))]
    row = dict(model='tabpfn_v2', heldout_gain=bt['tabpfn_v2']['gain'], heldout_gain_ci=bt['tabpfn_v2']['gain_ci'],
               diff_vs_baseline=bt['tabpfn_v2']['diff'], diff_vs_baseline_ci=bt['tabpfn_v2']['diff_ci'],
               auc=float(np.mean([flex.wauc(P[r], y, w) for r in range(len(P))])),
               auc_baseline=float(np.mean([flex.wauc(z['baseline'][r], y, w) for r in range(len(P))])),
               observed_expected=float(np.mean([c['observed_expected'] for c in cal])),
               calibration_slope=float(np.mean([c['calibration_slope'] for c in cal])),
               repeats=int(len(P)), max_train_rows=MAX_ROWS, minutes=(time.time() - t0) / 60,
               note='unweighted fit (TabPFN takes no sample weights); weighted held-out metrics; not exportable')
    p = HERE.parent / 'results' / f'{lens}.json'
    d = json.loads(p.read_text())
    d['tabpfn'] = {k: (round(v, 6) if isinstance(v, float) else v) for k, v in row.items()}
    p.write_text(json.dumps(d, indent=1))
    print(row)


if __name__ == '__main__':
    {'export': export, 'fit': fit}[sys.argv[1]](sys.argv[2])
