"""Pruning / low-bit sweep of accel-sparse's 14 designs on accel-kws's Speech Commands features.

Model code and cost constants are accel-sparse's, imported unchanged; only the layer sizes
(70-H-11 instead of 64-32-10), the input standardisation and the data are new.
"""
import os
import sys

import numpy as np

_R = os.path.join(os.path.dirname(__file__), '..', '..', '..')
for p in ('accel-sparse', 'accel-kws'):
    sys.path.insert(0, os.path.join(_R, p, 'src'))
from accel_sparse import model as M, cost as C  # noqa: E402

# name, weight quantiser, weight bits stored, target sparsity (None = dense)
DESIGNS = [
    ('float32 dense', 'float', 32, None),
    ('int8 dense', 'int8', 8, None),
    ('int4 dense', 'int4', 4, None),
    ('ternary', 'ternary', 2, None),
    ('binary', 'binary', 1, None),
] + [('int8 pruned %d%%' % int(s * 100), 'int8', 8, s) for s in (0.5, 0.75, 0.9, 0.95, 0.98)] \
  + [('ternary pruned %d%%' % int(s * 100), 'ternary', 2, s) for s in (0.5, 0.75, 0.9)]

ABITS = (8, 8)  # inputs are int8 in accel-kws; hidden activations 8-bit


def dims(inputs, hidden, out=11):
    return [(inputs, hidden), (hidden, out)]


def kind_of(qk):
    return 'signadd' if qk in ('ternary', 'binary') else 'mult'


def energy_nj(nnz, qk, wbits, sparse, inputs, hidden):
    e = 0.0
    for (fi, fo), nz, ab in zip(dims(inputs, hidden), nnz, ABITS):
        e += C.layer_energy_pj(fi, fo, nz, kind_of(qk), wbits, ab, sparse)
    return e / 1000.0


def storage_kbit(nnz, wbits, sparse, inputs, hidden):
    return sum(C.storage_bits(fi, fo, nz, wbits, sparse) for (fi, fo), nz in zip(dims(inputs, hidden), nnz)) / 1000.0


def standardise(xtr, *others):
    mu, sd = xtr.mean(0), xtr.std(0) + 1e-8
    return [(x - mu) / sd for x in (xtr,) + others]


def train_design(xtr, ytr, qk, sp, seed, hidden, epochs, bs):
    """Train one design.  Dense: `epochs`.  Pruned: a dense warm-up of epochs//3, then `epochs`
    with a cubic sparsity schedule reaching the target at 5/8 of the way."""
    rng = np.random.default_rng(seed)
    quant = M.make_quant(qk)
    params = M.init([xtr.shape[1], hidden, 11], rng)
    masks = [np.ones_like(p[0]) for p in params]
    if sp is None:
        M.train(params, xtr, ytr, masks, quant, epochs, rng, bs=bs)
    else:
        M.train(params, xtr, ytr, masks, quant, max(1, epochs // 3), rng, bs=bs)
        M.train(params, xtr, ytr, masks, quant, epochs, rng, bs=bs,
                prune_to=sp, prune_from=0, prune_until=max(1, epochs * 5 // 8))
    return params, masks, quant
