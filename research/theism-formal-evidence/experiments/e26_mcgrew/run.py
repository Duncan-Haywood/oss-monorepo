"""E26: the McGrews' 10^44 from their own text, and what the disciples' 10^39 needs (milestone M2).

    python3 research/theism-formal-evidence/experiments/e26_mcgrew/run.py

Inputs: T. & L. McGrew, "The Argument from Miracles: A Cumulative Case for the Resurrection of
Jesus of Nazareth" (Blackwell Companion to Natural Theology, 2009, pp. 593-662), read in the
authors' draft with addenda of 2025-09-14 and 2025-12-02; page numbers are the draft's.
See src/ledger.py, PUBLISHED_POSTERIORS. Exact rational arithmetic, stdlib only.
"""
import json
import math
import sys
from fractions import Fraction as F
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "src"))
from ledger import PUBLISHED_POSTERIORS  # noqa: E402

MC = next(p for p in PUBLISHED_POSTERIORS if p["who"].startswith("T. & L. McGrew"))["reproduce"]
W, PER_DISCIPLE, N_DISCIPLES, PAUL = (F(MC["women"]), F(MC["per_disciple"]), MC["n_disciples"], F(MC["paul"]))
PRIOR_R = F(MC["illustrative_prior"])
E2_THRESHOLD = 7.3  # E2: resurrection Bayes factor needed for P(Christian) > 1/2 at even priors


def post(prior, bf):
    o = prior / (1 - prior) * bf
    return o / (1 + o)


def bf_disciples_mixture(q, f=PER_DISCIPLE, n=N_DISCIPLES):
    """P(D|R)/P(D|~R) when, given ~R, a shared explanation H (probability q) makes D as likely as R
    does, and otherwise the n testimonies are independent with per-disciple factor f:
    P(D|~R) = q P(D|R) + (1 - q) P(D|R) f^-n."""
    return 1 / (q + (1 - q) / f ** n)


def lg(x):
    return math.log10(x) if x > 0 else float("-inf")


def main():
    bf_d = PER_DISCIPLE ** N_DISCIPLES
    total = W * bf_d * PAUL
    p40 = post(PRIOR_R, total)
    prior_half = 1 / (1 + total)  # prior at which the posterior is exactly 1/2
    shares = {"women": lg(W) / lg(total), "disciples": lg(bf_d) / lg(total), "paul": lg(PAUL) / lg(total)}
    # (c) the mixture bound, over the group-level probability q of a shared explanation given ~R
    qs = [F(1, 10), F(1, 10**3), F(1, 10**6), F(1, 10**10), F(1, 10**20), F(1, 10**30), F(1, 10**39), F(0)]
    rows = []
    for q in qs:
        bd = bf_disciples_mixture(q)
        tot = W * bd * PAUL
        rows.append(dict(q=("0" if q == 0 else f"1e-{round(-lg(q))}"), log10_bf_d=lg(bd), log10_total=lg(tot),
                         log10_posterior_at_1e_40=lg(post(PRIOR_R, tot)),
                         log10_prior_for_half=lg(1 / (1 + tot)), bound_1_over_q=(None if q == 0 else lg(1 / q))))
    # (d) per-disciple factor and number of independent disciples needed at the 1e-40 prior
    need_log = -lg(PRIOR_R / (1 - PRIOR_R)) - lg(W) - lg(PAUL)  # log10 BF_D needed for posterior 1/2
    f_star = 10 ** (need_log / N_DISCIPLES)
    n_star = need_log / lg(PER_DISCIPLE)
    n_rows = [(n, float(post(PRIOR_R, W * PER_DISCIPLE ** n * PAUL))) for n in (10, 11, 12, 13)]
    f_rows = [(f, lg(W * F(f) ** N_DISCIPLES * PAUL)) for f in (30, 100, 300, 492, 1000)]
    # (e) group-level q at which D alone falls to E2's bar of 7.3
    q_e2 = (1 / E2_THRESHOLD - 1 / float(bf_d)) / (1 - 1 / float(bf_d))
    # (f) Martin's 1/500 in Swinburne's model (E25): P(c|k) = 1/4, P(f|c&k) = 1/10
    martin = post(F(1, 4), F(1, 10) / F(1, 500))
    out = dict(
        inputs=dict(women=str(W), per_disciple=str(PER_DISCIPLE), n_disciples=N_DISCIPLES, paul=str(PAUL),
                    illustrative_prior="1e-40"),
        log10_bf=dict(women=lg(W), disciples=lg(bf_d), paul=lg(PAUL), total=lg(total)),
        reproduces_1e44=(total == F(10) ** 44),
        posterior_at_1e_40=float(p40), odds_at_1e_40=float(PRIOR_R / (1 - PRIOR_R) * total),
        exceeds_9999=p40 > F(9999, 10000), margin_over_9999=float(p40 - F(9999, 10000)),
        log10_prior_for_half=lg(prior_half), log_shares=shares,
        mixture=rows,
        independence=dict(log10_bf_d_needed=need_log, per_disciple_needed=f_star, n_needed=n_star,
                          posterior_by_n=n_rows, log10_total_by_f=f_rows),
        q_for_e2_bar=q_e2,
        martin_in_swinburne=str(martin), martin_in_swinburne_float=float(martin),
    )
    (HERE / "results.json").write_text(json.dumps(out, indent=1))
    L = ["# E26: the McGrews' 10^44 from their own text\n",
         "Inputs from the authors' draft (pp. 31, 38-39, 41; draft pagination): women 10^2, one disciple 10^3, "
         "13 disciples multiplied under independence, Paul 10^3; illustrative prior 10^-40.\n",
         f"- log10 factors: women {lg(W):.0f}, disciples {lg(bf_d):.0f}, Paul {lg(PAUL):.0f}, total {lg(total):.0f}; "
         f"reproduces 10^44: {out['reproduces_1e44']}",
         f"- posterior at prior 10^-40: odds {out['odds_at_1e_40']:.4g}, P = {float(p40):.8f}; above .9999 by {out['margin_over_9999']:.1e}",
         f"- prior at which the posterior is 1/2: 10^{lg(prior_half):.2f}",
         f"- share of the log factor: women {shares['women']:.3f}, disciples {shares['disciples']:.3f}, Paul {shares['paul']:.3f}\n",
         "## Mixture bound: a shared explanation with group-level probability q given ~R\n",
         "BF_D = 1/(q + (1-q) 10^-39); bound BF_D <= 1/q.\n",
         "| q | log10 BF_D | log10 total | log10 P(R|E) at prior 1e-40 | log10 prior for 1/2 |",
         "|---|---:|---:|---:|---:|"]
    for r in rows:
        L.append(f"| {r['q']} | {r['log10_bf_d']:.2f} | {r['log10_total']:.2f} | {r['log10_posterior_at_1e_40']:.2f} | {r['log10_prior_for_half']:.2f} |")
    L += ["", "## Under independence: how many disciples, how strong each\n",
          f"- log10 BF_D needed for 1/2 at prior 10^-40: {need_log:.2f}; per-disciple factor needed {f_star:.1f}; "
          f"independent disciples needed at 10^3 each: {n_star:.2f}",
          "- posterior at prior 10^-40 by number of independent disciples: "
          + ", ".join(f"n={n}: {p:.3g}" for n, p in n_rows),
          "- log10 total factor by per-disciple factor: " + ", ".join(f"f={f}: {v:.1f}" for f, v in f_rows),
          f"\n- group-level q at which D alone falls to E2's bar (7.3): {q_e2:.4f}",
          f"- Martin's 1/500 (McGrews' n. 31) in Swinburne's model (E25): {martin} = {float(martin):.4f}"]
    (HERE / "results.md").write_text("\n".join(L) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    main()
