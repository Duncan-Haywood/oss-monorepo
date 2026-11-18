"""The groups milestone 5 scores, the transfer pairs it evaluates, and the fixed respondent sample."""
import numpy as np
import pandas as pd

PER_GROUP = 300
SEED = 0
TRADS = ['Catholic', 'Evangelical Protestant', 'Mainline Protestant', 'Black Protestant']


def groups(d):
    c = d.tradition == 'Catholic'
    e = d.tradition == 'Evangelical Protestant'
    return {
        'Catholic gen3': c & (d.generation == 3),
        'Catholic gen1': c & (d.generation == 1),
        'Catholic non-Hispanic': c & (d.hispanic_any == 0),
        'Catholic Hispanic': c & (d.hispanic_any == 1),
        'Catholic': c,
        'Evangelical Protestant': e,
        'Mainline Protestant': d.tradition == 'Mainline Protestant',
        'Black Protestant': d.tradition == 'Black Protestant',
        'Catholic <=2014': c & (d.year <= 2014),
        'Catholic 2016-24': c & (d.year >= 2016),
        'Evangelical <=2014': e & (d.year <= 2014),
        'Evangelical 2016-24': e & (d.year >= 2016),
    }


# (name, kind, source group, target group); one to three per kind of transfer in m6.
PAIRS = [
    ('Catholic gen3 -> gen1', 'generation', 'Catholic gen3', 'Catholic gen1'),
    ('Catholic non-Hispanic -> Hispanic', 'ethnicity', 'Catholic non-Hispanic', 'Catholic Hispanic'),
    ('Catholic -> Evangelical Protestant', 'tradition', 'Catholic', 'Evangelical Protestant'),
    ('Catholic -> Black Protestant', 'tradition', 'Catholic', 'Black Protestant'),
    ('Evangelical Protestant -> Catholic', 'tradition', 'Evangelical Protestant', 'Catholic'),
    ('Mainline Protestant -> Evangelical Protestant', 'tradition', 'Mainline Protestant', 'Evangelical Protestant'),
    ('Catholic <=2014 -> 2016-24', 'period', 'Catholic <=2014', 'Catholic 2016-24'),
    ('Evangelical <=2014 -> 2016-24', 'period', 'Evangelical <=2014', 'Evangelical 2016-24'),
]


def draw(d, per_group=PER_GROUP, seed=SEED):
    """Rows of d (TRADS only) in the union of each group's simple random sample, plus one
    boolean column per group, 'in:<group>', marking the respondents drawn for that group."""
    d = d[d.tradition.isin(TRADS)].copy()
    rng = np.random.default_rng(seed)
    flags = {}
    for g, m in groups(d).items():
        idx = np.flatnonzero(m.values)
        pick = rng.choice(idx, size=min(per_group, len(idx)), replace=False)
        f = np.zeros(len(d), bool)
        f[pick] = True
        flags[f'in:{g}'] = f
    d = pd.concat([d, pd.DataFrame(flags, index=d.index)], axis=1)
    return d[d[list(flags)].any(axis=1)].copy()
