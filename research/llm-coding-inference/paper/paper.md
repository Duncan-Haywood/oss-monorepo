# How small can the hand-coded audit be? Valid intervals for LLM-coded qualitative data under group shift and rare categories

**Draft 1 (2026-10-26), not ready to submit.** Section status is marked in
[Status of each section](#status-of-each-section). Every number below is copied
from a file in [`../experiments/`](../experiments/) that the named script wrote;
the log with the plans made before each run is [`../LOG.md`](../LOG.md). This
text was drafted with AI assistance, and implies no affiliation with any lab or
venue it cites. **One small real LLM (Qwen2.5-1.5B-Instruct, zero-shot) has coded text in
this draft, on one corpus (Sections 7 and 8)**; every other experiment uses a word
list, naive Bayes or a class-weighted logistic regression (the "stand-in
coders"). Section 9 says what that does to each claim, and Section 8 what a coder must be to pay.

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
oracle size, with coverage 94.2 to 95.2%. For regression coefficients at small audits (60 to 400
hand-coded tweets), an HC3-type leverage correction with a t quantile brings
tuned PPI++ to 93.2 to 94.9% coverage at n >= 100, and a zero-shot 1.5B LLM
coder (agreement 66.1% with the human label) makes it 2.2% narrower than
hand-coding alone at n = 400. The programme's H3 (a 20% gain) is not reached by
any coder tried. Agreement is the wrong axis: on this corpus a constant code
agrees 0.673, so the real coders at 0.66 to 0.69 have Youden J of only 0.01 to
0.21, and a synthetic coder with each one's sensitivity and specificity and
independent errors reproduces its width ratio to within 0.006 (0.98 to 0.996 at
n = 400). A 20% gain needs J of about 0.5.

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

The pilot-based plan does not carry over to rare categories (milestone 6r,
GoEmotions groups, 500 draws per cell). With fear at 1.15% and a 400-item pilot,
planned audits are 25 to 30% below the oracle size (291 against 398; 953
against 1,347), the mean half-width is 1.40 and 0.89 points against targets of
1.0 and 0.5, and coverage is 73% at the 0.5-point target. A 1,500-item
pilot restores sadness (2.3%; coverage 93%) but not fear (22% of audits end
wider than 1.25 times the target). The oracle plan itself is sound. The
evidence is two categories on one corpus; no pilot-size rule is derived.

A conservative pilot variance fixes the coverage but not the cost (milestone 6s,
same corpus and draws). Using the Wilson upper bound on each group's pilot
prevalence as the variance input, no audit ends wider than 1.25 times the target
and fear covers 92.0% and 94.4% (1.0 and 0.5 points, pilot 400; plug-in 70%),
but the planned audit is 3.80 and 2.65 times the oracle size for fear (sadness
2.51 and 1.82). With a 1,500-item pilot the factor is 1.5 to 2.3. Shrinking each
group's variance towards the pooled pilot variance (weight 30) lifts the plan to
0.86 times the oracle for fear and leaves coverage at 78% (1.0 point). One
corpus, normal-approximation interval, constants untuned.

A sequential audit does not escape the problem (milestone 6t, same corpus). The rule that stops when the plug-in half-width meets the target, which covered 93 to 96% at a 45% prevalence, covers fear (1.15%) at 89.8% and 63.8% (1.0 and 0.5 points) and sadness (2.3%) at 86.2% and 72.0%, with mean audit sizes near the oracle. A fixed-size audit of the same size covers 91 to 94%, so the loss is from the data-dependent stopping time. Requiring 20 or 40 audited positives before stopping lowers fear coverage to 47% and 41%. Two stopping fixes fail too: stopping on a Wilson-upper-bound half-width covers fear 51 to 64% and sadness 68 to 74% at 1.9 to 5.5 times the oracle size (6u), and a wider critical value, up to a Bonferroni 3.33 over 57 looks, leaves fear at 0.5 point at 64% (6v). The cause is a downward bias at the stop, not only a narrow standard error (6w): the standardised error (estimate minus truth over reported se) of stopped audits has mean -1.4 (fear) and -1.1 (sadness) at the 0.5-point target and sd 1.4 to 1.6, against mean -0.2 to -0.3 and sd 1.1 to 1.2 for fixed-size audits of the same sizes, and among stopped audits the reported se and the absolute error are negatively correlated (-0.35 to -0.67). A valid sequential audit at a rare category needs a stopping rule that uses no audit labels; none is given here. What does work needs no labels in the size either: planning the audit from the coder's own positive share per group (variance proxy pf(1-pf), `h6x_label_free.py`, milestone 6x) covers 91.8 to 94.4% in the four cells at 1.9 to 2.8 times the oracle size (doubling the proxy variance: 92.6 to 95.2% at 2.4 to 4.5 times). A control that removes the coder and the strata (milestone 6y, `h6y_confseq.py`: pooled human labels, stop when the half-width reaches 0.5 or 1.0 point, 500 draws) shows the collapse is specific to the stratified tuned-PPI estimator: the plug-in normal interval covers 90.4 to 95.0% at the stop (fear 1.0 and 0.5 point, sadness 1.0 and 0.5 point: 95.0, 90.6, 90.4, 93.0), Wilson 95.2 to 99.6%, and a hedged betting confidence sequence for sampling without replacement 96.6 to 98.0%, the last at 2.2 to 3.5 times the fixed-size Wald audit (Wilson 1.2 to 1.5 times). This is the same corpus and one coder that over-flags by design (positives about three times the true share), so it over-plans; it is valid because no audit label enters the size.

*A coder-assisted confidence sequence is valid but does not pay (milestones 6z and 6aa; `h6z_strat_cs.py`, `h6aa_pilot_lambda.py`, 300 draws per cell, coverage +/- 2.5 points).* Betting on the PPI rectifier within each of the four groups, combined by a union bound at level 0.05/4, covers 99.3 to 100% at the stop on fear and sadness (targets 1.0 and 0.5 point), while the plug-in tuned stratified rule on the same stream covers 89.7 / 65.3 (fear) and 83.3 / 67.7 (sadness). With lambda = 1 it stops at 5,484 / 6,035 / 5,951 / 6,394 items of a 6,683-item corpus (fear 1.0, fear 0.5, sadness 1.0, sadness 0.5), 2.9 to 13.8 times the oracle size and more than the pooled human-only sequence of 6y in every cell. Freezing lambda from the first 100 items of each group (a predictable weight, valid because it uses only items seen before the sequence starts) cuts this to 4,543 / 5,387 / 4,932 / 5,839 (8 to 17% fewer items), coverage 100% in all four cells, but the pooled human-only sequence still needs only 1,075 / 3,437 / 2,692 / 4,984. So at a rare category with a naive-Bayes coder that over-flags, the stratified coder-assisted sequence is dominated: the union bound and the four-way stratification cost more than the coder saves. Coverage of 100% shows the sequence is conservative, not that its level is tight.

*Audit design with a real LLM coder (milestones 6ab to 6ai; `h6ab_llm_goemotions.py` to `h6ai_floor_indep.py`, GoEmotions test part of 6,683 items, zero-shot Qwen2.5-1.5B-Instruct, 500 draws per cell, coverage +/- 2 points).* The coder's gain over human-only is small at a rare category (3 to 9% of the half-width at fear and sadness, 1.14x smaller oracle audit; H3's 3x bar is not met) and tracks its informedness (admiration, Youden J 0.65: about 9%; neutral, J 0.20: about 1%). Per-stratum tuning of lambda undercovers at n = 400 (85 to 90%); a single pooled lambda removes that extra loss, and a Wilson interval on the effective sample size n_eff = p(1-p)/se^2 of the PPI estimate keeps the gain (3 to 8% narrower than human-only Wilson) with coverage of 92 to 97% in most cells. Stratifying the audit by the four corpus groups buys nothing from 1% to 23% prevalence (about 1% of the half-width) because the groups' prevalences differ by under 1.5x, and at 1 to 2% prevalence it costs validity (human normal coverage 85 to 88% at n = 400 against 96% pooled). Stratifying by the coder's own label does pay where the coder separates prevalence strongly: the half-width falls 15 to 25% in fear, sadness and admiration and 0.4 to 0.7% in neutral, but at a rare category n = 400 covers only 88 to 91% (5 positives per cell), so it needs about 1,000 audited items to be valid (92 to 94%). WE covers at least 93% in 51 of 64 coder-cell cells and has no coverage theorem. One corpus, one 1.5B model, oracle allocation. Replacing the oracle with a Neyman allocation estimated from a 30% pilot (milestone 6ah) shows a larger apparent gain but breaks validity: coverage at n = 400 is 49 to 84% in fear, sadness and admiration, since the coder-negative cell is starved; size-proportional allocation over the same cells is valid and gains nothing, so the gain comes from the variance-based allocation alone. A floor of 35% of n on each cell restores validity only for the common category (admiration: 91 to 92% at n = 400, 93 to 94% at n = 1,000, 21% narrower than pooled) and not for fear or sadness (50 to 92%); a separate pilot, kept out of the estimate, is valid at admiration but loses the whole gain (milestone 6ai). A screen that uses coder cells only when the pilot's estimated Youden J is at least 0.3 pools when the coder is empty (NaijaSenti, J at most 0.21: half-width within 0.1% of pooled) and keeps the admiration gain, but stays invalid at fear and sadness with n = 400 (75 and 87% WE coverage; milestones 6aj, 6ak). Adding the requirement of at least 20 human positives in the pilot (milestone 6al, `h6al_guard.py`) sends the rare categories to the pooled stratum and gives WE coverage of 92.6 to 96.4% in all 32 cells, with admiration at n = 1,000 still 17.6% narrower than pooled (94.6%) and no gain at n = 400; the threshold values 0.3 and 20 were each fixed once, one informative-coder category carries the gain, and the data-dependent choice has no coverage theorem.

## 7 Regression coefficients and small audits (H5 second half; the real LLM, H3 first look)

Data: the NaijaSenti test part; outcome = the human negative-sentiment label,
regressed on language dummies and log tweet length (five coefficients); truth is
the same OLS on all items (for the LLM comparison, on a seeded 6,000-tweet
subsample). Scripts `h6g_regression.py` to `h6n_width.py`, `llm_code.py`,
`h3_llm_width.py`; numbers from `LOG.md` entries 6g to 6n and milestone 5.

*Validity at n = 400.* The regression run on a stand-in coder's own codes covers
the corpus coefficients in 0 of 15 cells (biases up to +0.52, sign flips between
coders). Prediction-powered OLS covers 93.6 to 95.7% but is 1.08 to 1.41 times
wider than hand-coding; choosing the weight per coefficient (PPI++) keeps
coverage at 93.3 to 95.6% and the standard error at 0.99 to 1.00 times
hand-coding for the two weak coders (0.935 to 0.988 for the 74%-agreement one).

*Small audits.* At n = 60, 100, 200 (3,000 paired draws) human-only OLS with a
normal interval already covers only 91.6, 92.9, 94.0% on average, and tuned
PPI++ loses a further 0.7, 0.5, 0.35 points. Dividing each audit row's
influence by 1 - h_i (HC3 type, h_i from the blended design matrix; heuristic,
not derived) and using t quantiles lifts tuned PPI++ to 93.1 / 94.0 / 93.8% and
two-fold cross-fit PPI++ to 94.3 / 95.2 / 94.9% (n = 60 / 100 / 200, lexicon
coder; 1,500 draws). The shortfall was mostly the missing leverage term, not
the choice of weight.

*Is it narrower, once valid?* Against human-only HC3 + t, tuned PPI++'s mean
half-width ratio at n = 400 is 0.995 and 0.994 for the two 0.68-agreement
stand-ins and 0.961 for the 0.743-agreement one. At n = 60 the ratios are lower
(0.957, 0.956, 0.908) but coverage there is 0.5 to 1.3 points under
human-only's, so part of that is selection of the weight on the audit, not free
efficiency. Cross-fit costs width: 1.03 at n = 400 and 1.09 to 1.18 at n = 60.

*A real LLM coder.* Qwen2.5-1.5B-Instruct, zero-shot, one fixed prompt
(score = logit(Yes) - logit(No), code = score > 0, no threshold tuned on human
labels), coded 6,000 NaijaSenti tweets on 4 CPU cores in about 21 minutes. It
agrees with the human label 66.1% of the time (sensitivity 0.439, specificity
0.769), below the in-language naive Bayes (73.5%). Tuned PPI++ + HC3 + t
half-width ratio to human-only, n = 60 / 100 / 200 / 400: LLM 0.942 / 0.960 /
0.971 / 0.978; in-language naive Bayes 0.918 / 0.941 / 0.956 / 0.966; the two
weakest stand-ins 0.958 to 0.996. Coverage is 93.2 to 94.9% for every coder at
n >= 100 (600 draws, about 0.9 points of noise per cell). The LLM beats the two
stand-ins with the same agreement because its errors are less one-sided. No
coder reaches the 20% gain that H3's break-even claim needs, so H3 as stated
is **untested, not refuted**: the model is small and handles Hausa, Igbo and
Yoruba badly.

## 8 What a coder must be to pay (H3 follow-up; negative for small zero-shot models)

Same corpus, outcome, regression and estimator as Section 7 (tuned PPI++ + HC3
+ t against human-only HC3 + t; 600 draws per cell). Scripts `h5b` (via
`h3_llm_width.py`), `h5c_calibrated.py`, `h5d_breakeven.py`, `h5e_correlated.py`,
`h5f_text_error.py`, `h5g_fitted.py`; the plans written before each run are in
`LOG.md` milestones 5b to 5g. Milestone 5g was run before its hypotheses
were written down (disclosed there), so read it as descriptive.

*Size is not the driver; the cut is.* Qwen2.5 0.5B, 1.5B and 3B (zero-shot, cut
at score > 0) agree with the human label 0.668, 0.661, 0.689, and the width
ratio at n = 400 is 0.996, 0.978, 0.993. The 0.5B and 3B models call only 2.5%
and 3.1% of tweets negative (truth 32.7%), so their codes carry almost no
signal; the 1.5B model happened to be near-calibrated at 0. Choosing the cut on
100 human labels and charging them to PPI++ (comparator: human-only with n + 100
labels) loses for all three models: ratio 1.42 to 1.44 at n = 100 and 1.11 to
1.13 at n = 400. With models this small there is no regime at n = 100 to 400
where spending labels on a cut beats labelling more.

*How good must a coder be?* With a synthetic coder that flips the human label
independently with probability 1 - a, the ratio at n = 400 is 0.984 (a = 0.60),
0.934 (0.70), 0.898 (0.75), 0.811 (0.80), 0.656 (0.90): H3's 20% gain needs
roughly a = 0.80 here, and almost any informative independent coder helps a
little. Coverage of tuned PPI++ falls below 93% at n = 100 for a >= 0.90
(91.8, 89.0), the in-sample weight selection over-shrinking the interval.

*Real errors are not independent.* At matched agreement, errors tied to the
group or to a text feature ("@" present) leave the ratio at 0.88 to 0.97 for
a = 0.70 and 0.95 to 0.99 for a = 0.60 (n = 400), against 0.936 and 0.979 for
independent flips; length- or label-dependent errors are the least favourable
(0.965 to 0.992). A synthetic coder whose flip probability is a logistic
regression fitted to the real 1.5B and 3B errors reproduces their n = 400
ratios (1.5B: real 0.978, fitted 0.985; 3B: 0.993 and 0.993) with coverage
93.3 to 95.3%. This is a descriptive fit on one corpus, one prompt and one error draw per
cell.

*Informedness, not agreement, sets the gain (milestone 5h; this corrects the
reading in the previous paragraph).* On this corpus (32.7% negative) a constant
"not negative" code agrees 0.673, so agreement 0.66 to 0.69 says little. The
real coders' Youden J (sensitivity + specificity - 1) is 0.008 (0.5B, fixed
cut), 0.208 (1.5B) and 0.061 (3B; sensitivity 0.072, specificity 0.989), and at
best 0.033, 0.212 and 0.194 with a cut chosen in-sample; the synthetic
"agreement 0.70" coders above have J of about 0.40. A synthetic coder with each
real coder's sensitivity and specificity and independent errors gives the real
n = 400 width ratio to within 0.006 in all six cases (for example 3B fixed:
real 0.993, matched 0.987; 1.5B fixed: 0.978 and 0.980), against 0.937 for a
symmetric coder at agreement 0.69. So error correlation with the text, beyond
sensitivity and specificity, costs nothing measurable here, and the earlier
errors-tied-to-text explanation is not needed. Matched PPI++ coverage is 94.3
to 95.5% at n >= 200. From the independent-flip sweep, a 20% gain needs J of
roughly 0.5 to 0.6 (ratio 0.898 at a = 0.75, J 0.5; 0.811 at a = 0.80).
Limits: the best-J cut is scored on the items that chose it, one coder draw per
cell (realised J differs from the target by up to 0.02), one corpus and one
prompt. Whether a 7B or fine-tuned coder reaches J above 0.5 is untested.

*A real LLM at a rare category (milestone 6ab; `llm_code_goemotions.py`, `h6ab_llm_goemotions.py`; 500 draws).* The same Qwen2.5-1.5B-Instruct, one zero-shot yes/no prompt per category fixed before any score was seen, codes the 6,683-item GoEmotions test part for fear (1.15%) and sadness. Sensitivity / specificity: fear NB 0.247 / 0.969, LLM with a label-free cut (coder-positives 3x the train prevalence) 0.481 / 0.980; sadness NB 0.396 / 0.922, LLM 0.682 / 0.941, so Youden J roughly doubles (0.46 and 0.62 against 0.22 and 0.32). The oracle audit size at a 0.5-point target for tuned stratified PPI against human-only falls only 8.4% (fear) and 9.3% (sadness) with that cut, and by at most 12.1% (1.14x; sadness, score > 0 cut), far from H3's 3x. At n = 400 coverage of tuned PPI is 85.2 to 89.0% for fear (human-only 86 to 88%, about four positives per group), and 92.0 to 94.8% at n = 1,000 apart from one cell at 90.8%. At a 1 to 2% prevalence the rectifier variance is dominated by the few positives the coder misses or falsely flags, so a 1.5B zero-shot coder buys a few percent of width. One corpus, one model and prompt, oracle weights and allocation in the sizing table, nominal intervals.

## 9 Limits and what remains

1. **One small real LLM.** H3 (a real instruction-following model changes
   the break-even audit size by 3x or more) is untested at the scale it
   needs: the only model run is a zero-shot 1.5B model on two corpora
   (Sections 7 and 8, milestone 6ab). A larger or multilingual model, few-shot prompts and a
   second corpus are open, and need a GPU or a paid API key (an owner step).
2. Two corpora for group shift (NaijaSenti, GoEmotions by subreddit type), one
   for rare categories, and two for sizing: the size rule's plug-in half-width
   matches the simulated one to 0.2% on the subreddit corpus too (ratio 0.999
   to 1.002; the rule hits 3.00 and 2.00 points; `h6o_reddit_sizing.txt`), and
   there the stand-in coders' plans need 1.23 to 1.58 times the human-only plan's
   audit size, because their residual variance exceeds that of the label
   (lambda = 1; the rule does not yet cover tuned PPI++). The proposal asked for
   three corpora.
3. Truth is a corpus-wide hand code, not an independent gold standard.
4. The floor multiplier (5) is fitted on the corpus it was first reported on.
5. The coder-assisted betting confidence sequence (milestones 6z, 6aa) uses a union bound over four groups and a lambda frozen from a 100-item pilot; a joint betting process or a sharper coder could change the verdict that it is dominated by the pooled human-only sequence.
6. Regression coefficients (Section 7): OLS only, no logistic regression; the HC3 leverage term for the blended equation and the t degrees of freedom are heuristics, not derived; the tuned interval's width is a minimum over a weight grid, so its small-n narrowness is partly selection.

## 10 Reproducibility

Each table is written by one script in `experiments/` (about 30 s to 3 min
each); data come from the public NaijaSenti and GoEmotions releases through the
loaders of `qual-dialect` and `qual-real`; seeds are fixed in the scripts. Tests:
`python3 -m pytest research/llm-coding-inference/test_llmci.py`.

## Status of each section

| Section | State |
|---|---|
| 1 Introduction | drafted, needs the real-LLM result to state the headline |
| 2 Related work | drafted; Gligorić et al. and Fisch et al. still to be read in full |
| 3 to 6 | numbers current as of milestone 6f; Section 6 gained 6z and 6aa (checked against `h6z_strat_cs.txt`, `h6aa_pilot_lambda.txt`) |
| 7 | added in draft 1 from LOG.md 6g to 6n and milestone 5; numbers copied from the log, not yet re-derived from the result files line by line |
| 8 | added in draft 1.1 from LOG.md 5b to 5g, 5h added in 1.2 (checked against `h5h_informedness.txt`); numbers checked against `experiments/*.txt` for 5b, 5d, 5g, the rest copied from the log |
| 8 (6ab paragraph) | added 2026-10-28, checked against `h6ab_llm_goemotions.txt` |
| 9 | limits; still lists the open model and corpus work (7B untested) |
| LaTeX in the venue's format | not started; needs the venue's current template |
| Owner step | submission (publishes under a name) |

## References

See [`references.bib`](references.bib).
