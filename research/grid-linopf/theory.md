# When does the repair finish? A step-based convergence statement (milestone 7, theory half)

Draft section for the paper (`PROPOSAL.md`, milestone 7), written 2026-11-17 with AI assistance
(Claude Code). It replaces H4, which was refuted as written on 2026-11-13
(`research/infra-dcopf/LOG.md`): a bound through the initial merit over the smallest merit decrease
was 10x or more off on 25 of 31 finishers, and case73 API stalled with a well-conditioned Jacobian.
The statements below are proved here and checked against the recorded round-by-round traces in
`research/infra-dcopf/experiments/check_theory.py` (results: `results_theory.txt`). The arguments
are standard ones (Taylor's theorem, counting halvings, first-order stationarity of an exact
penalty, as in Fletcher and Sainz de la Maza 1989); what is specific is how they map onto the frozen
repair's rules and which of their quantities can be read from a run.

## The method being analysed

J-m-a as frozen (`infra_dcopf/vlin.py`, `converge.traced_slp`). The decision vector x holds the
active power of every live unit except the slack and the voltage setpoint of every bus with a live
unit, in per unit (P over baseMVA). The monitored rows g<sub>i</sub>(x) are the outputs of the AC
power flow (PYPOWER Newton, Q limits not enforced): slack-unit P, apparent flow |S| at both ends of
every rated branch, limited angle differences, PQ-bus voltage magnitudes and unit Q, each with
bounds [l<sub>i</sub>, u<sub>i</sub>] and a margin &mu;<sub>i</sub> &gt; 0 (`vlin.MARGIN`; thermal
margins are 10<sup>&minus;3</sup> of rating). Round k at base point x<sub>k</sub>:

1. Linearise: g<sub>i</sub>(x<sub>k</sub>) and &nabla;g<sub>i</sub>(x<sub>k</sub>) from the Newton
   Jacobian.
2. **Hard QP:** minimise the quadratic generation cost over steps d with
   l<sub>i</sub> + &mu;<sub>i</sub> &le; g<sub>i</sub>(x<sub>k</sub>) + &nabla;g<sub>i</sub> d &le;
   u<sub>i</sub> &minus; &mu;<sub>i</sub>, the units' P limits, and the trust box
   |d<sub>j</sub>| &le; &Delta;<sub>k,j</sub> (from round 2 on for P; voltages boxed from round 1).
   If it is infeasible, the **elastic QP**: the same cost plus &rho; = 10<sup>4</sup> times the l1
   sum of the rows' violations (voltage rows scaled by 100).
3. Run the AC power flow at x<sub>k</sub> + d. Clean (every limit within the check's tolerance):
   stop. Else accept if the merit &phi; (a weighted sum of the worst thermal excess, slack, angle,
   voltage and summed Q excess) fell, otherwise keep x<sub>k</sub> and halve every box entry.

Write e<sub>i</sub> = g<sub>i</sub>(x<sub>k</sub> + d) &minus; g<sub>i</sub>(x<sub>k</sub>) &minus;
&nabla;g<sub>i</sub> d for the linearisation remainder of row i.

## Assumptions

- **(A1) Smooth power flow along the steps.** For every round, the AC power flow has a solution
  on the whole segment [x<sub>k</sub>, x<sub>k</sub> + d<sub>k</sub>] with a nonsingular Newton
  Jacobian, Newton finds that branch, and every rated |S| that is linearised is nonzero on the
  segment. Then each g<sub>i</sub> is C<sup>2</sup> on the segment (implicit function theorem), and
  we let L<sub>i</sub> be a Lipschitz constant of &nabla;g<sub>i</sub> there. Define
  &kappa; = max<sub>i</sub> L<sub>i</sub>/(2&mu;<sub>i</sub>) and r* = &kappa;<sup>&minus;1/2</sup>.
- **(A2) Hard-QP feasibility.** Every round's hard QP is feasible.

(A2) is a real restriction, not a technicality: the box shrinks after each rejection, and a hard QP
in a small box is feasible only if the base point already lies close to the margin-shifted limits.
Nothing in the method guarantees it, and on case73 API it fails in every round.

## Statements

**Proposition 1 (one-step finishing; checked on 190 of 190 hard misses, 2026-11-13).** After a
hard QP, the trial point breaks row i only if e<sub>i</sub>, signed towards the bound it breaks,
exceeds &mu;<sub>i</sub>.

*Proof.* The linear model of row i at the step lies at least &mu;<sub>i</sub> inside its bound
(less the check's tolerance on thermal rows, 10<sup>&minus;6</sup> of rating, which is below
&mu;<sub>i</sub>). The true value is the model value plus e<sub>i</sub>. &#8718;

**Theorem 1 (a short enough hard step finishes).** Under (A1), a hard round with
||d<sub>k</sub>||<sub>2</sub> &le; r* ends clean.

*Proof.* Taylor with a Lipschitz gradient gives |e<sub>i</sub>| &le; L<sub>i</sub>
||d||<sup>2</sup>/2 &le; &mu;<sub>i</sub> for every i, and Proposition 1 applies. &#8718;

With s<sub>i</sub> &ge; &mu;<sub>i</sub> the actual distance of row i's model value to its bound,
the same argument gives the sharper, after-the-fact radius min<sub>i</sub>
(2s<sub>i</sub>/L<sub>i</sub>)<sup>1/2</sup>: rows far from their bounds need much larger
remainders to break.

**Theorem 2 (halvings are logarithmic in curvature).** Under (A1) and (A2), let
||&Delta;||<sub>2</sub> be the 2-norm of the initial trust box over the decision variables (in pu)
and H the number of halvings before the clean round. Then
H &le; H* = max(1, &lceil;log<sub>2</sub>(||&Delta;||<sub>2</sub>/r*)&rceil;).

*Proof.* Under (A2) every round is hard, and under (A1) no power flow fails, so a box is halved
only after a rejected (not clean, merit not lower) round. Let h<sub>k</sub> be the halvings before
round k. For k &ge; 2, ||d<sub>k</sub>||<sub>2</sub> &le; 2<sup>&minus;h<sub>k</sub></sup>
||&Delta;||<sub>2</sub>. If round k &ge; 2 is not clean, Theorem 1 gives ||d<sub>k</sub>|| &gt; r*,
so h<sub>k</sub> &lt; log<sub>2</sub>(||&Delta;||/r*) and h<sub>k+1</sub> &le; h<sub>k</sub> + 1
&le; &lceil;log<sub>2</sub>(||&Delta;||/r*)&rceil;. Round 1 has no P box and can add one halving,
after which the same bound holds from round 2; if log<sub>2</sub>(||&Delta;||/r*) &le; 0, round 2
is clean and H &le; 1. &#8718;

**Theorem 3 (the round count).** Under (A1) and (A2), the clean round is
K = 1 + A + H, where A counts accepted not-clean rounds, H &le; H*, and
A &le; S<sub>A</sub>/r* with S<sub>A</sub> the summed step length of those rounds. In particular
the repair terminates in finitely many rounds whenever its accepted steps tend to zero.

*Proof.* Under (A2) every not-clean round is accepted or rejected, and rejected rounds are the
halvings. Every not-clean hard round has ||d|| &gt; r* (Theorem 1), so A r* &lt; S<sub>A</sub>. If
the accepted steps tend to zero, only finitely many exceed r*, and the rejected ones are bounded by
Theorem 2. &#8718;

What (A1) and (A2) do not give is an *a priori* bound on S<sub>A</sub>, and the method's own rules
explain why: the QP minimises cost, so an accepted step is pulled to the box by the cost gradient
rather than shrinking with the violation, and the box shrinks only on rejection. H4's term
&phi;<sub>0</sub>/&delta;<sub>min</sub> tried to bound A through the merit decrease, which can be
arbitrarily small. A rule that ties the box to the violation (&Delta;<sub>k</sub> &le;
c &phi;(x<sub>k</sub>)) would make S<sub>A</sub> summable near a regular feasible point and give an
a priori count; that is a change to the method, to be tested on held-out cases, not a property of
the frozen one.

**Proposition 2 (what a stall is).** Suppose (A2) fails at a point x&#772; and the elastic QP returns
d = 0 for every box small enough. Then x&#772; is a directional-stationary point, over the directions the QP's equality row and the units' P limits allow, of the exact penalty
P<sub>&rho;</sub>(x) = cost(x) + &rho; &sum;<sub>i</sub> w<sub>i</sub> v<sub>i</sub>(x), with
v<sub>i</sub> the violation of row i's margin-shifted bound and w<sub>i</sub> the QP's row scaling.
If the cost's gradient has norm at most G on the box, the l1 violation
&psi; = &sum; w<sub>i</sub> v<sub>i</sub> satisfies &psi;'(x&#772;; h) &ge; &minus;G/&rho; for every such unit
direction h: x&#772; is within G/&rho; of a stationary point of the infeasibility, which is a
local-infeasibility stop and not something a longer round budget fixes.

*Proof.* The elastic QP's objective is a convex model of P<sub>&rho;</sub> whose directional
derivatives at d = 0 equal P<sub>&rho;</sub>'s (each g<sub>i</sub> is C<sup>1</sup> and the max with
zero is applied to the same affine value). d = 0 minimises a convex function over a box around 0 iff
all its directional derivatives at 0 are non-negative, so P<sub>&rho;</sub>'(x&#772;; h) &ge; 0. Divide
by &rho; and bound the cost term by G. &#8718;

The merit &phi; that decides acceptance weights the rows differently from P<sub>&rho;</sub> (worst
thermal excess, summed Q excess, voltage times 10), so an elastic step can lower P<sub>&rho;</sub>'s
model and still be rejected; Proposition 2 then does not apply, and the stall is the acceptance
test's.

## What can be read from a run

&kappa; is not computed by the method. The traces give a lower bound per round,
&kappa;&#770;<sub>k</sub> = max<sub>i</sub> |e<sub>i</sub>|/&mu;<sub>i</sub> / ||d<sub>k</sub>||<sup>2</sup>,
so every bound evaluated with &kappa;&#770; in place of &kappa; is optimistic (r&#770; &ge; r*,
H&#770;* &le; H*). The check script evaluates Theorems 1 to 3 and Proposition 2 against the traces
with two estimates, the largest over the case's rounds and round 1's alone (known before round 2
runs). Results and the predictions made before computing them: `research/infra-dcopf/LOG.md`,
2026-11-17.

## References

- R. Fletcher and E. Sainz de la Maza, "Nonlinear programming and nonsmooth optimization by
  successive linear programming", *Mathematical Programming* 43:235-256, 1989,
  doi:10.1007/BF01582278.
