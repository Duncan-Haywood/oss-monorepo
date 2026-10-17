# Verifiers as informational complements: when marginal-contribution hiring and pay fail

*Working note, MIT licensed. Stylised; pure-Python exact enumeration, no claims about any deployed protocol.*

## Motivation
`multi-verifier-audit` shows extra verifiers free-ride; `effort-elicitation` and `effort-contracts` price one verifier's effort. This note asks a prior question from the informational substitutes/complements literature (Chen–Waggoner, "Informational substitutes"; Frongillo–Waggoner-style information markets): does a verifier's *decision* value show diminishing returns? If not, marginal-value hiring and leave-one-out (LOO) pay are ill-behaved.

## Model (`src/verifier_complements/model.py`)
State faulty/good with prior π. Verifier i flags a faulty job w.p. q_i and a good one w.p. 1−q_i, conditionally independent. The referee accepts or slashes (accepting a faulty job costs 1, slashing a good one costs c). V(S) = prior Bayes risk − Bayes risk after seeing S, by exact enumeration over 2^|S| outcomes.

## Results (`experiments/results.txt`; π=0.05, c=1, q=0.7 unless stated)
**R1 (threshold: V=0 below a minimum committee).** With a rare-fault prior the default is *accept*; a verifier cannot change the action until enough flags stack up. V(n)=0 for n=1,2,3 and V(4)=0.0043, with closed form n₀ = ⌊(ln c − ln(π/(1−π)))/ln(q/(1−q))⌋+1 = 4 (checked against enumeration on three parameter sets). Mutual information over the same verifiers has strictly diminishing marginals (0.0160, 0.0154, 0.0146, …): information is submodular, decision value is not.

**R2 (complementarity is common).** Over all (S, i, j) in a pool of 8 verifiers (q from 0.6 to 0.95), adding j *raises* i's marginal value in 33.5% of triples at π=0.05, 24.3% at π=0.2 and 31.4% at π=0.5 (worst excess 0.038, 0.080, 0.048). Complements are not confined to extreme priors.

**R3 (myopic hiring fails).** Marginal-value-per-cost greedy hires nobody in every budget tried (2–7) because each single verifier has zero marginal value; the exhaustive optimum buys V=0.0043 at budget 4 and 0.0148 at budget 7 (pool: six q=0.7 at cost 1, one q=0.9 at cost 4). Greedy's ratio to the optimum is 0.

**R4 (LOO pay is a sawtooth, then vanishes).** LOO marginal contribution is 0 for n<4 (nobody is paid even though the committee is necessary), then alternates with parity (0.0043, 0.0018, 0.0045, 0.0023, …) and decays to 0.00017 at n=40, seven times below the average value per verifier (0.0012). Early on LOO underpays everyone (complements), later it underpays again (substitutes: the free-rider regime of `multi-verifier-audit`).

## Implications
Pricing verification by marginal contribution needs care: budgeted hiring should search committees or add a *threshold* step (buy k₀ verifiers as a bundle), and pay should be committee-level (e.g. Shapley/scoring-based) rather than LOO. Because information is submodular but decisions are not, designing the referee's action space (an *escalate/audit* action, `reject-surrogates`) changes complementarity.

## Limits
Conditionally independent symmetric binary signals, known accuracies, single accept/slash decision; no strategic effort (combine with `effort-elicitation`); exhaustive search is exponential (fine for pools ≤ 8). A general submodularity-ratio bound for greedy under thresholds is left open.
