# How small can the hand-coded audit be? Valid intervals for LLM-coded qualitative data under group shift and rare categories

**Draft 0 (2026-10-25), not ready to submit.** Section status is marked in
[Status of each section](#status-of-each-section). Every number below is copied
from a file in [`../experiments/`](../experiments/) that the named script wrote;
the log with the plans made before each run is [`../LOG.md`](../LOG.md). This
text was drafted with AI assistance, and implies no affiliation with any lab or
venue it cites. **No real LLM has coded any text in this draft**: the coders are
a word list, naive Bayes and a class-weighted logistic regression (the
"stand-in coders"). Section 6 says what that does to each claim.

## Abstract

Researchers increasingly let a language model code text (is this tweet
positive, does this comment express grief) and then report prevalences and
group gaps from those codes. Prediction-powered inference (PPI) gives a valid
interval for such a quantity from a random hand-coded audit plus the model's
codes on the rest. Two conditions common in qualitative work are not covered by
its guarantees at the sample sizes that matter: the model's error rate differs
between groups and the audit's group mix differs from the corpus's, and the
category is rare. On 44,485 NaijaSenti tweets in four languages, a 400-tweet
audit whose language mix is 70% Hausa makes the pooled PPI 95% interval cover
67 to 69% (stand-in coders), against 93.8 to 95.9% for a language-stratified
estimator using corpus-known group sizes. On 38,234 GoEmotions comments, nine
emotions at 0.10 to 1.96% prevalence, normal-approximation intervals from a
200-item audit cover as little as 16% (uniform) or 10% (coder-label-stratified); a Wilson interval on a uniform
audit covers 91 to 99%, and an audit sampled by the coder's uncertainty with a
label-free inclusion floor covers 92.4 to 96.0% while being 0.48 to 0.80 of the
Wilson width for the six categories under 1%. We give a closed-form audit-size
rule (Neyman allocation with a finite-population term) and a sequential audit
that stops when the estimated half-width reaches the target: on NaijaSenti it
meets a 3-point target in 100% of 1,000 audits per cell at 1% above the
oracle size, with coverage 94.2 to 95.2%. Whether a real LLM changes these
conclusions (the programme's H3) is not yet tested.

## 1 Introduction

*(Status: drafted from `PROPOSAL.md`, "Question" and "Why it matters".)* A
quantity of interest in text-as-data work is a share (the fraction of tweets
that are positive), a gap between groups or a regression coefficient on a coded
variable. A model's codes are cheap and biased in ways that differ by group; a
hand-coded sample is unbiased and expensive. The question is how large the
hand-coded audit must be, and how to draw it, for an interval with the claimed
coverage. We contribute: (i) a real-data demonstration that pooled PPI loses
coverage under audit-mix shift (Section 4); (ii) a finding that for rare
categories the validity of the interval, not its width, is the binding issue,
with a label-free sampling rule that keeps coverage (Section 5); (iii) a
planning formula and a sequential rule for the audit size with coverage checked
by simulation on real corpora (Section 6).

## 2 Related work

Checked with `research/_shared/cite_check.py`; the closest competitor for the
combination claimed, Gligorić et al. (2024), and Fisch et al. (2024) have not
yet been read in full for this draft (milestone 1 item, still open).

*Prediction-powered and design-based inference.* Angelopoulos et al. (2023)
give valid intervals from a random labelled sample plus model predictions;
Angelopoulos, Duchi and Zrnic (2023) tune the weight so the interval is not
asymptotically worse than labelled-only; Zrnic and Candès (2024a) cross-fit
the predictor; Egami et al. (2023) allow non-uniform audit probabilities;
Fisch et al. (2024) stratify the audit; Zrnic and Candès (2024b) choose items
to label by model uncertainty; Gligorić et al. (2024) use the annotator's
stated confidence. These assume a random or known-probability audit of one
population and give asymptotic intervals. *LLMs as annotators.* Gilardi et al.
(2023) and Ziems et al. (2024) report accuracy and agreement, not inference
validity. *Shift and quantification.* Lipton et al. (2018) correct for label
shift assuming the error rates are unchanged; Hopkins and King (2010) and
González et al. (2017) estimate proportions directly.

*Gap, narrowly:* a finite-sample audit-size rule for coded prevalences under
group-varying coder error and prevalence under about 5%, checked for coverage on
real hand-coded corpora, compared with uniform, stratified and
uncertainty-based audits at equal budget. This paper supplies the checks on
two corpora with stand-in coders; the real-LLM part is open.

## 3 Setting and estimators

A corpus of N items falls in G groups of known sizes N_h. Item i has a human
code y_i in {0,1} (unknown until audited) and a coder code f_i. The target is
the corpus prevalence theta = (1/N) sum y_i. An audit draws n_h items per group.
The estimators, all in [`../llmci/estimators.py`](../llmci/estimators.py)
(stdlib only; tests in [`../test_llmci.py`](../test_llmci.py) check closed forms
and a 600-study simulation): human-only (with normal and Wilson intervals);
naive (the coder's codes, no correction); PPI and PPI++; a design-based
inverse-probability audit; stratified PPI,

theta_hat = sum_h W_h [ mean_h(f) + mean_{audit,h}(y - f) ],  W_h = N_h / N,

with variance sum_h W_h^2 (1 - n_h/N_h) S_h^2 / n_h, S_h^2 the variance of
r = y - f in group h; and a binary label-shift correction. Truth is known in
every experiment because the corpus is a fully hand-coded dataset: the coder's
output on all N items is computed, the audit is a random sample of the hand
codes, and coverage is the share of 95% intervals that contain the corpus
prevalence.

## 4 Group shift (H1; supported on real data)

Data: NaijaSenti (hau/ibo/pcm/yor; native-speaker sentiment labels), the 70%
test part of a seeded split (44,485 tweets). Three stand-in coders (English
lexicon, English-trained naive Bayes, in-language naive Bayes). Three audit
designs of 400 tweets: random, equal quota per language, and 70% Hausa; 1,000
draws each. Script `group_shift.py`; table `group_shift.txt`.

Result: the pooled PPI interval covers as little as 67% (English-trained
coder, 70% Hausa) and 69% (in-language coder); PPI++ 89%; pooled hand-coding
alone 87% under equal quotas. The language-stratified estimator with
corpus-known sizes covers 93.8 to 95.9% in every design (one cell, 0.2 points
under the planned 94% bar). It is not narrower than stratified hand-coding,
because the stand-in coders are weak (for example sensitivity 0.39 and
specificity small in Nigerian Pidgin). The mechanism is the assumption in
PPI that audit and corpus share a distribution; the stratified estimator
restores it by reweighting, at the price of needing group sizes.

*Second corpus (milestone 3b).* The same design on 6,683 GoEmotions comments
in four hand-made subreddit groups (negative-emotion target, three logistic
regression coders, n = 400, 1,000 draws; `group_shift_reddit.py`) gives a milder
picture. Coder agreement differs by at most 5 points across groups, and pooled
PPI covers 91.4 to 95.6% in all 18 cells; the one clear miss is a sports-only
coder under a 70%-sports audit (91.4%, bias +1.74 points). Group-stratified PPI
covers 93.5 to 95.0% but is wider than stratified hand-coding in every cell. We
therefore state the finding as: undercoverage grows with between-group
differences in coder error; stratification is the safe choice and costs width
when the coder is weak.

## 5 Rare categories (H2, H4; both refuted as stated; a validity finding)

Data: GoEmotions (Demszky et al. 2020), 38,234 comments after the `qual-real`
filters, truth = a majority of at least three raters, nine categories from
0.10% (grief) to 1.96% (sadness); a class-weighted logistic regression coder;
audit n = 200; 1,000 draws. Scripts `rare_audit.py`, `floor_rule.py`,
`floor_rule_heldout.py`.

*Validity first.* Normal-approximation intervals on a uniform human-only audit
cover 16% (grief) to 61% (0.42%), and 83 to 93% from 0.9%; PPI++ the same or
worse. A Wilson interval covers 91 to 99% in all nine. Hence H2 ("PPI++ with a
coder-label-stratified audit cuts width by 25%") is refuted: the cuts that
exist come with coverage of 10 to 81%.

*What survives.* An audit that includes item i with probability proportional to
sqrt(q_i (1 - q_i)), q the coder's calibrated probability, has an
inverse-probability estimator. With the inclusion floor set label-free to
clip(5 qbar, 0.02, 0.10), qbar the corpus mean of q, normal-IPW coverage is
92.4 to 96.0% in all nine categories, with intervals 0.48 to 0.80 of the
uniform-Wilson width for the six categories under 1%. The multiplier 5 was
chosen after seeing the same corpus (in-sample). On the 18 other GoEmotions
categories (0.99 to 7.69%) the rule holds coverage at 93.2 to 97.0% but is
1.02 to 1.49 times the Wilson width in 16, so the gain is confined to
prevalence below about 1%, which no held-out category reaches.

## 6 Planning the audit size (H5; supported)

*Width formula.* The simulated mean half-width over the plug-in formula
(Section 3, with oracle S_h^2) is 0.996 to 1.000 in nine design-by-coder cells
(bar 0.90 to 1.10); this is close to an identity for the mean of the variance
estimator, so it is a check of the code, not a discovery.

*Size rule.* For a target half-width w (z = 1.96), Neyman allocation gives

n = ( sum_h W_h S_h )^2 / ( w^2/z^2 + sum_h W_h^2 S_h^2 / N_h ).

For w = 3 points: 888, 1,063, 912 tweets for the three coders; simulated mean
half-width 3.00, coverage 94.6 to 95.8%. Plain stratified hand-coding needs
851: these coders only reduce the audit when their error variance in a group is
below the group's own prevalence variance. (An earlier version of this rule
squared a variance twice in the finite-population term; it was found and
fixed in milestone 6f, `LOG.md`, and 6a to 6e were rerun.)

*From a pilot.* Auditing 20 per group and applying the rule gives mean sizes
876, 1,049, 893 with coverage 94.9 to 95.9%, but only 43 to 47% of audits reach
the 3.0-point target.

*Sequential.* Starting from the pilot, add batches of 30 by the current Neyman
shares and stop when the estimated half-width reaches 3.0 points: 100% of 1,000
audits per cell meet the target, mean size 898, 1,074, 919 (about 1% above the
oracle), coverage 94.2 to 95.2% with no optional-stopping correction. At a
1.0-point target (about 7,000 to 8,000 tweets, 16 to 18% of the corpus) the
stopped size is within 1% of the oracle (+0.6 to +0.8%) and coverage is 95 to
97% (200 to 300 draws per cell, so it cannot exclude a 2-point loss).

## 7 Limits and what remains

1. **No real LLM.** H3 (a real instruction-following model changes the
   break-even audit size by 3x or more) is untested. Every width comparison
   against hand-coding is for weak coders; with a good coder the gain from PPI
   can only be larger, but how much is the paper's main empirical question.
   Blocked in the sessions so far: Hugging Face and the Anthropic API were not
   reachable, so no model could be run.
2. Two corpora for group shift (NaijaSenti, GoEmotions by subreddit type), one
   for rare categories and sizing; the proposal asked for three.
3. Truth is a corpus-wide hand code, not an independent gold standard.
4. The floor multiplier (5) is fitted on the corpus it was first reported on.
5. The sequential coverage uses the nominal normal interval; an always-valid
   interval was not compared.
6. Regression-coefficient extension (H5 second half): coverage tested for OLS on the corpus's own coefficients with stand-in coders (milestone 6g; PPI valid, wider than hand-coding; milestone 6h: a power-tuned weight per coefficient keeps coverage at 93.3 to 95.6% and is never wider than hand-coding, and 1 to 7% narrower for the 74%-agreement coder); no real LLM, no logistic regression.

## 8 Reproducibility

Each table is written by one script in `experiments/` (about 30 s to 3 min
each); data come from the public NaijaSenti and GoEmotions releases through the
loaders of `qual-dialect` and `qual-real`; seeds are fixed in the scripts. Tests:
`python3 -m pytest research/llm-coding-inference/test_llmci.py`.

## Status of each section

| Section | State |
|---|---|
| 1 Introduction | drafted, needs the real-LLM result to state the headline |
| 2 Related work | drafted; Gligorić et al. and Fisch et al. still to be read in full |
| 3 to 6 | numbers current as of milestone 6f |
| 7 | will shrink when milestone 5 runs |
| LaTeX in the venue's format | not started; needs the venue's current template |
| Owner step | submission (publishes under a name) |

## References

See [`references.bib`](references.bib).
