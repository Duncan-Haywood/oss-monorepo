# Decision-aid design checklist for the divorce-risk app

The app is moving from a risk calculator to a **decision aid**: something that helps a person choose
a partner, time a marriage, decide whether to cohabit first, take a relationship course or start
counselling. Decision aids have their own evidence base and standards, mostly from health care. This
page summarises them and turns them into a checklist for the app's views.

Every claim below cites a record in [`evidence.json`](evidence.json) (id in brackets). Each record's
quote is checked verbatim against its source text and its DOI at Crossref by `scripts/build.py`. How
strong the evidence is for each input the app can change is in [FACTORS.md](FACTORS.md); what changing a
decision did in trials is in [EVIDENCE.md](EVIDENCE.md).

## What the standards and trials say

**Decision aids work, on the outcomes that matter for a decision.** A Cochrane review of randomised
trials found that decision aids probably make choices more consistent with people's informed values
(RR 1.75, 95% CI 1.44 to 2.13; 21 studies, 9,377 people), improve accurate risk perception (RR 1.94,
1.61 to 2.34), and do not increase decision regret [Stacey2024_decision_aids_cochrane]. These are health
decisions; that the same holds for relationship decisions is an assumption.

**IPDAS (International Patient Decision Aid Standards).** An international Delphi kept 74 of 83 quality
criteria in 12 domains: systematic development, information about options, presenting probabilities,
clarifying values, patient stories, guiding/coaching, disclosing conflicts of interest, internet
delivery, balanced presentation, plain language, up-to-date evidence, and establishing effectiveness
[Elwyn2006_IPDAS_criteria]. A later Delphi split 44 items into 6 qualifying criteria (needed to count as
a decision aid), 10 certification criteria (omitting one carries a high risk of harmful bias) and 28
quality criteria [JosephWilliams2014_IPDAS_minimum]. IPDAS rates the design of an aid, not the quality of
its underlying evidence; that is what FACTORS.md is for.

**Absolute, not relative, risk.** Relative risk reductions are understood no better than absolute ones
but look larger (SMD 0.41) and are more persuasive (SMD 0.66, 0.51 to 0.81) [Akl2011_RRR_vs_ARR]. A
systematic review of 91 studies found absolute risk formats more accurate and less likely to sway
decisions than relative ones, and numbers-needed-to-treat reduced understanding
[Zipkin2014_risk_communication_review].

**Same denominator, same time frame, same format.** Give each chance over a stated period with a
defined denominator; when comparing options, use the same denominator and format and add the absolute
difference [Trevena2013_primer_denominators]. The 2021 IPDAS update repeats this and adds: interpret the
numbers for readers of varying numeracy, and avoid accidental "nudging" toward an option
[Bonner2021_probabilities_update].

**Icon arrays and other visuals.** Icon arrays improved understanding for both low- and high-numeracy
people; the array size changed how serious a risk felt (1,000 icons felt more serious than 100), so the
size must stay fixed across comparisons [Galesic2009_icon_arrays]. Visual aids also reduce gain/loss
framing effects, which hit low-numeracy readers hardest [GarciaRetamero2010_framing; Zipkin2014_risk_communication_review].

**Show uncertainty.** Communicating a numeric range made people see the uncertainty with only a small
loss of trust, mostly when uncertainty was expressed in words rather than numbers
[vanderBles2020_uncertainty_trust].

**Values clarification.** Explicit values-clarification exercises reduced values-incongruent choices
(risk difference −0.04, −0.06 to −0.02) and decisional conflict; multicriteria decision analysis did best
[Witteman2021_values_clarification].

## Checklist

Status is read from the app's code on 2026-10-20 (`app/index.html`, `compare-ui.js`, `summary.js`):
**met**, **partly** or **not yet**. Features: *Scenario* = the couple estimate and lens summary;
*Partners* = "Me + many people" ranking and "Just me"; *What-ifs* = "What the models link to lower risk";
*Dashboard* = "Your dashboard" (partner traits, what-ifs, non-negotiables).

| # | Requirement | Evidence | Applies to | Status today |
|---|---|---|---|---|
| D1 | State the decision being supported (whom to marry, when, whether to cohabit first, whether to take a course or counselling) and list the options, including "do nothing" and options the models cannot score (relationship education, counselling). | Elwyn2006_IPDAS_criteria; JosephWilliams2014_IPDAS_minimum | Scenario, Dashboard | **not yet**: the page frames itself as an odds calculator; education and counselling are absent. |
| D2 | Every probability is an absolute chance with a time frame (for example, with an illustrative number: "12 in 100 couples like you separate within 10 years"), never a bare percentage or relative risk alone. | Trevena2013_primer_denominators; Bonner2021_probabilities_update; Akl2011_RRR_vs_ARR | all | **met** for estimates ("by 10 y") and what-ifs ("+2.1 pts at 10 y"); population percentiles are relative and should sit next to the absolute number. |
| D3 | One denominator and format across everything compared on screen; when lenses have different horizons or units, do not rank them against each other, and say why. | Trevena2013_primer_denominators; Bonner2021_probabilities_update | Scenario, Partners | **partly**: estimates use % by horizon, but ACS baselines use "per 1,000 per year" and lens horizons differ (2, 2.2-8.4, 5/10/20 years). |
| D4 | Effects of a change are shown as an absolute difference from the person's own baseline (percentage points over the same horizon), not as "x% lower risk". | Akl2011_RRR_vs_ARR; Zipkin2014_risk_communication_review | What-ifs, Dashboard | **met** (points against the current estimate). Keep it when adding interventions: show "7.6 vs 11.9 in 100 divorced at 2 years", not "OR 0.60". |
| D5 | An icon array (fixed 100 icons, whole population shown) for the main estimate and for each compared option. | Galesic2009_icon_arrays; GarciaRetamero2010_framing; Trevena2013_primer_denominators | Scenario, What-ifs, Partners | **not yet**. |
| D6 | Show uncertainty as numbers: the range across models plus, where published, the 95% interval of each published effect; say in words that ranges are not exhaustive. | vanderBles2020_uncertainty_trust; Bonner2021_probabilities_update | all | **partly**: model ranges and agreement counts are shown; published intervals for interventions are not. |
| D7 | Next to every changeable input, show its evidence grade from `factor_grades.json` (experimental / quasi-experimental / observational / cross-sectional) and one plain sentence on what a person can conclude. | FACTORS.md (all factor grades) | What-ifs, Dashboard | **partly**: a blanket "associations, not causes" note; no per-factor grade. |
| D8 | Options with trial evidence (relationship education, counselling) appear as options with their trial results in absolute terms, the population tested, follow-up length, and the nulls (Building Strong Families, Supporting Healthy Marriage), not as a model adjustment. | Stanley2014_PREP_Army_2yr_pooled; BSF2012_36mo_romantic; SHM2014_30mo_married; Christensen2010_IBCT_TBCT_5yr | Dashboard, Scenario | **not yet**: `app/data/decision_evidence.json` now holds the verified records. |
| D9 | Balanced presentation: show what each option costs or risks as well as its benefit, give both frames at least once (illustrative: "88 in 100 stay married, 12 in 100 divorce"), and do not order options to steer. Rank partners only into tiers the models can tell apart. | Elwyn2006_IPDAS_criteria; Bonner2021_probabilities_update; GarciaRetamero2010_framing | Partners, What-ifs | **partly**: partner rankings already mark an indistinguishable top tier; estimates use only the "no break-up" frame. |
| D10 | An explicit values-clarification step before results: what matters to the person (for example faith, children, career, location), weighted, then used to filter or weight options; non-negotiables are part of this. | Witteman2021_values_clarification | Dashboard, Partners | **partly**: the dashboard's locks and exclusions are a hard-constraint form of it; no weighting. |
| D11 | Plain language for readers of varying numeracy: a one-sentence interpretation under each number. | Bonner2021_probabilities_update; Elwyn2006_IPDAS_criteria | all | **partly**. |
| D12 | Say what the evidence cannot do: no number for factors with no outcome data (counselling vs no counselling on divorce has no long-term untreated control), and refuse profiles outside a lens's data. | Christensen2010_IBCT_TBCT_5yr; FACTORS.md | all | **met** for out-of-distribution refusals; to be applied to interventions. |
| D13 | Date the evidence and link every number to its source and quote; disclose funding and conflicts (none) and that the tool is not advice. | Elwyn2006_IPDAS_criteria | all | **partly**: "Not advice of any kind" and source links exist; evidence dates and a conflicts line do not. |
| D14 | Establish effectiveness: test the aid with users (understanding of the absolute numbers, values congruence, decisional conflict) before claiming it helps decisions. | Stacey2024_decision_aids_cochrane; Elwyn2006_IPDAS_criteria; JosephWilliams2014_IPDAS_minimum | all | **not yet**. |

## How to use the data

`app/data/decision_evidence.json` has three lists, all verified records only:

- `interventions`: trials, natural experiments and observational anchors, each with `design_class`,
  `population`, `n`, `outcome`, `estimate`/`ci_low`/`ci_high` in `unit`, `effect_text` (absolute,
  plain language), `follow_up`, `caveats`, `citation`, `doi`, `quote` and `provenance`.
- `factor_grades`: for each input the app can change, the strongest design, direction, size, what a
  person can conclude, and its evidence (with quotes).
- `design_standards`: the records cited on this page.

Effects from different designs and populations are not interchangeable and must not be multiplied
into a lens's estimate: a trial's absolute difference applies to the trial's population and follow-up.
