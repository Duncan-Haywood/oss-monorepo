# Peer prediction for unverifiable work: what effort costs and how many gold checks it takes

*Working note, MIT licensed. Stylised; numerical experiments in pure Python, no claims about any deployed protocol.*

## Motivation
`effort-contracts` priced effort when a score against ground truth exists. In many decentralised-ML settings it does not: workers
label, rank, or judge model outputs and nobody holds the truth (or checking it is the expensive step). The classic answer is *peer
prediction*: score each report against a peer's. This note asks (i) which peer scores are safe from lazy agreement, and (ii) once
effort is private, when does peer scoring buy any effort at all, and how many ground-truth ("gold") checks fix it.

## Model (`src/peer_prediction_effort/model.py`)
Label y ~ Bernoulli(p). Worker i sees a binary signal that equals y with probability q_i; g_i = 2q_i − 1 is her *gap*. A strategy is a
map signal → report (truthful, flip, always-0, always-1). All payoffs below are exact expectations over the joint signal distribution.

## Results (`experiments/results.txt`)
**R1 (output agreement rewards laziness).** Paying 1 for agreement gives truthful workers q²+(1−q)² = 0.68 at q = 0.8, but "always
report the majority label" earns 1.0 at every prior (E1). Once p is skewed (p = 0.1) honesty is not even an equilibrium: a worker facing
an honest peer does better answering always-0.

**R2 (Dasgupta–Ghosh).** Pay 1[agree] on a shared task minus 1[agree] on two independent tasks. The truthful-vs-truthful payoff is
exactly **2p(1−p)·g_i·g_j** (closed form equals exact enumeration to 12 digits; a 200k-trial Monte Carlo of the three-task estimator is
within 0.0025, E2). Every profile with a constant reporter pays exactly 0, so uninformative equilibria still exist but are strictly
worse than truthful for both sides (0 vs 0.15 at q=0.8, p=0.3). The relabelling equilibrium (flip, flip) pays the same as truthful;
peer prediction cannot pin down the *meaning* of labels, only that reports are informative (a convention must be fixed elsewhere).

**R3 (effort under peer scoring is a coordination game).** The DG payoff is bilinear in the two gaps, so a worker's marginal
return to effort is proportional to her peer's gap. With continuous effort (gap κ(1−e^{−e}), cost c e²/2) let A = α·2p(1−p).
The best response is unique, and the symmetric equilibria are the fixed points of e ↦ BR(g(e)). Zero effort is always an equilibrium,
but it is **unstable under best-response dynamics iff α > α0 = c/(2p(1−p)κ²)**; above α0 a stable positive-effort equilibrium exists
(c = 0.1, p = 0.5: α0 = 0.247; at 1.1α0 e = 0.064, at 3α0 e = 0.75, E3) and below it zero effort is the only equilibrium. The threshold
scales as 1/(4p(1−p)): ×2.8 at p = 0.1 and ×12.8 at p = 0.02 (E4), so rare-positive labelling tasks are the expensive ones for peer scoring.

**R4 (with a fixed cost of effort the bad equilibrium is stable and needs gold checks).** Let effort be binary (gap g_H at cost c, else 0)
and let a fraction r of comparisons use ground truth (gap 1). Then "H" is a best response to a shirker iff A·g_H·r ≥ c, so the
shirking equilibrium disappears exactly when **r > r\* = c/(A·g_H)** (E6: r\* = 0.375 for A=1, c=0.3, g_H=0.8; equilibria {LL, HH} at
r = 0.3749 and {HH} at 0.3751). Doubling the payment scale halves the required gold rate. With continuous effort below α0, any r > 0
moves the unique equilibrium off zero but only gradually (e = 0.14 at r = 0.1, 0.31 at r = 0.4, E5).

**R5 (cost-optimal design).** With u = A·g_H and r = c/u, expected pay is u·g_H − c·g_H + c and gold checking costs G per check, so total cost
u·g_H + c(1−g_H) + G c/u is minimised at **u\* = sqrt(G c/g_H), r\* = sqrt(c g_H/G)**, cost 2·sqrt(G c g_H) + c(1−g_H) (grid search agrees to 4
digits in all four tested cases, E7; needs G ≥ c·g_H so r\* ≤ 1). The gold rate falls only as 1/√G: a ground-truth check 4× as costly is
used half as often, not a quarter as often.

## Implications
1. Never pay raw agreement for verification-style labelling; use a DG/correlated-agreement style payoff, and fix the label convention out of band.
2. Peer scoring on skewed-prior tasks is much less potent per unit of budget (threshold ∝ 1/(p(1−p))); rebalance or reweight rare classes.
3. If effort is lumpy (fixed cost per task), budget a gold-check fraction of at least c/(A g_H); it trades off against payment scale in closed form (R5).
4. This is the analogue, for judged-by-peers work, of the spot-check budgets in `spot-check-slashing`, and of the score scales in `effort-contracts`.

## Limits
Binary labels with symmetric noise and independent-given-label signals (real annotators are correlated, and correlation is the main way DG
fails; `expert-pooling` studies that dependence), two workers, symmetric effort, a linear gold-check model that treats ground truth as noise-free, no
collusion (`verifier-bribery` covers bribes) and no multi-task learning of the payoff matrix, which is the natural extension (correlated agreement with
estimated Δ). Pure-strategy equilibria only.
