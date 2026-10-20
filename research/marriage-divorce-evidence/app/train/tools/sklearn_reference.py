"""scikit-learn results on the browser extract, for the JS trainer's parity test.

Reads only nsfg_pooled_women.json.gz (no raw NSFG files), rebuilds marriage-year intervals as
train_pooled.intervals does, and fits train_pooled's own pipelines on the extract's folds:
constant, duration only, additive spline Poisson GLM, Poisson tree (depth 4) and Poisson
gradient boosting. Writes sklearn_reference.json: held-out deviance gain, Harrell's C and O/E
per model, and the GLM's fitted parameters on fold 0's training set and on all data (spline
knots, scaler, categories, intercept, coefficients). tests/train.test.mjs compares the JS
trainer against it.

    python3 research/marriage-divorce-evidence/app/train/tools/sklearn_reference.py   # ~2 minutes
Needs numpy, pandas, scikit-learn 1.7.2.
"""
from pathlib import Path
import gzip, json, sys
import numpy as np, pandas as pd

HERE = Path(__file__).resolve().parent.parent          # app/train
LENS = HERE.parent.parent / 'reproducibility' / 'nsfg_pooled_first_marriage'
sys.path.insert(0, str(LENS))
import train_pooled as T  # noqa: E402
import metrics as M  # noqa: E402

KINDS = ['constant', 'duration_only', 'additive_spline', 'tree_depth4', 'gradient_boosting']


def load():
    doc = json.loads(gzip.decompress((HERE / 'nsfg_pooled_women.json.gz').read_bytes()))
    c = doc['columns']
    p = pd.DataFrame({'months': c['months'], 'event': c['event'], 'weight': c['weight'], 'fold': c['fold']})
    for n in doc['numeric']:
        p[n['name']] = pd.Series(c[n['name']], dtype=float) / n['scale']
    for n in doc['categorical']:
        p[n['name']] = [n['levels'][i] for i in c[n['name']]]
    p['t'] = (p.months + 0.5) / 12
    return p


def model(kind):
    if kind == 'constant':
        return T.Model('constant', [], [])
    if kind == 'duration_only':
        return T.Model('duration_only', ['marriage_years'], [])
    return T.Model(kind, T.WOMEN_NUM, T.WOMEN_CAT)


def glm_params(m):
    pipe = m.m
    prep, est = pipe.named_steps['prep'], pipe.named_steps['fit']
    num = prep.named_transformers_['num']
    cat = prep.named_transformers_['cat']
    return dict(impute=num.named_steps['impute'].statistics_.tolist(),
                knots=[k.ravel().tolist() for k in [b.t for b in num.named_steps['spline'].bsplines_]],
                scale_mean=num.named_steps['scale'].mean_.tolist(), scale_sd=num.named_steps['scale'].scale_.tolist(),
                categories=[list(map(str, c)) for c in cat.categories_],
                feature_names=prep.get_feature_names_out().tolist(),
                intercept=float(est.intercept_), coef=est.coef_.tolist())


def main():
    p = load()
    iv = T.intervals(p)
    iv['fold'] = p.fold.to_numpy()[iv.person.to_numpy()]
    y, e, w = iv.y.to_numpy(), iv.exposure.to_numpy(), iv.weight.to_numpy()
    preds = {k: np.zeros(len(iv)) for k in KINDS}
    grids = {k: np.zeros((len(p), 10)) for k in KINDS}
    out = {'n_people': len(p), 'n_intervals': len(iv), 'events': int(p.event.sum()), 'models': {}}
    for f in range(5):
        tr, te = iv[iv.fold != f], iv[iv.fold == f]
        te_p = p[p.fold == f]
        for k in KINDS:
            m = model(k).fit(tr)
            preds[k][te.index.to_numpy()] = m.predict(te)
            grids[k][te_p.index.to_numpy()] = T.grid_predict(m, te_p, 10)
            if f == 0 and k == 'additive_spline':
                out['glm_fold0'] = glm_params(m)
            print(f'fold {f} {k}', flush=True)
    ref = T.deviance(y, e, w, preds['constant'])
    for k in KINDS:
        dev = T.deviance(y, e, w, preds[k])
        score10 = grids[k].sum(axis=1)
        out['models'][k] = dict(
            heldout_mean_deviance=dev, deviance_gain_percent=100 * (1 - dev / ref),
            harrell_c=None if k == 'constant' else float(M.harrell_c(p.t, p.event, score10, p.weight)),
            observed_expected=float(np.dot(w, y) / np.dot(w, e * preds[k])))
    out['glm_all'] = glm_params(model('additive_spline').fit(iv))
    (HERE / 'sklearn_reference.json').write_text(json.dumps(T.clean(out), indent=1) + '\n')
    for k, v in out['models'].items():
        print(k, {a: round(b, 4) if b is not None else None for a, b in v.items()})


if __name__ == '__main__':
    main()
