"""Group gaps under an audit gate: estimate the difference in a code's prevalence between two groups from a
coder's labels plus a random hand-coded sample, and decide whether the audit lets you skip the correction.

Stdlib only. Builds on ../qual-gate (overall difference test), ../qual-equivalence (TOST) and ../qual-correction.
The estimand is gap = prevalence(group A) - prevalence(group B) over the evaluated items; each group's
prediction-powered estimate uses only the audited items that fall in that group.
"""
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "qual-equivalence"))
import qualequiv as e  # noqa: E402

g, q = e.g, e.q


def split(idx_gold, members_a):
    """Audited indices in group A and in the rest (group B). members_a is a set of indices."""
    a = [i for i in idx_gold if i in members_a]
    b = [i for i in idx_gold if i not in members_a]
    return a, b


def naive_gap(llm, a_all, b_all):
    return q.gap(q.naive([llm[i] for i in a_all]), q.naive([llm[i] for i in b_all]))


def ppi_gap(llm, human, a_all, b_all, a_gold, b_gold):
    """Group-wise prediction-powered gap. Needs at least two audited items in each group."""
    ea = q.ppi([llm[i] for i in a_all], [llm[i] for i in a_gold], [human[i] for i in a_gold])
    eb = q.ppi([llm[i] for i in b_all], [llm[i] for i in b_gold], [human[i] for i in b_gold])
    return q.gap(ea, eb)


def gap_bias(llm, human, a_gold, b_gold):
    """Mean human-minus-coder difference in A minus that in B (the coder's error in the gap, sign flipped), with
    its standard error: the quantity the gap's naive estimate is off by."""
    da = [human[i] - llm[i] for i in a_gold]
    db = [human[i] - llm[i] for i in b_gold]
    return q.mean(da) - q.mean(db), math.sqrt(q.var(da) / len(da) + q.var(db) / len(db))


def gap_z(llm, human, a_gold, b_gold):
    m, se = gap_bias(llm, human, a_gold, b_gold)
    return 0.0 if se == 0 else m / se


def gated_gap(llm, human, a_all, b_all, a_gold, b_gold, rule, delta=None):
    """Naive gap if the audit passes `rule`, else the prediction-powered gap. Returns (estimate, se, corrected).
    rule 'overall': qual-gate's difference test on all audited items (the habit: one audit, one test);
    rule 'gap': a z test on the gap bias; rule 'tost': the gap bias's 90% interval inside +-delta."""
    if rule == "overall":
        gold = a_gold + b_gold
        trust = abs(g.bias_z([llm[i] for i in gold], [human[i] for i in gold])) <= q.Z95
    else:
        m, se = gap_bias(llm, human, a_gold, b_gold)
        if rule == "gap":
            trust = se == 0 or abs(m / se) <= q.Z95
        elif rule == "tost":
            trust = m - e.Z90 * se > -delta and m + e.Z90 * se < delta
        else:
            raise ValueError(rule)
    if trust:
        return (*naive_gap(llm, a_all, b_all), False)
    return (*ppi_gap(llm, human, a_all, b_all, a_gold, b_gold), True)
