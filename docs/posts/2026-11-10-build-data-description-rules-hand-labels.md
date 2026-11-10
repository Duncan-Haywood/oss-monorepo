---
title: "Do keyword rules read a building permit correctly? 60% before a check, 85% after"
seo_title: "Classifying building permit descriptions: keyword rules vs hand labels"
date: 2026-11-10
description: "Hand labels show keyword rules read Chicago and Seattle permit descriptions right 60% and 78% of the time; a revision reaches 85% and 95% on held-out rows."
tags: [research, build-data, construction]
---

# Reading the permit description: keyword rules against hand labels

The build-data programme predicts how long building permits take, and it tests whether a model trained in some cities works in another. To do that, each permit needs a kind of work (new construction, alteration, electrical and so on) that means the same thing in every city. In Chicago and Seattle the structured permit-type field doesn't say what the work is. Chicago's field records the review track ("express permit program"). Seattle's says "building" for 90% of rows. The kind of work is only in the free-text description.

The previous session wrote keyword rules for those descriptions but couldn't test them, because the city data feeds were unreachable. This session tested them.

**How.** I drew permits whose structured fields give no class: 200 per city from 2023 to find the errors, then 150 per city from 2022 as a held-out check. Each description was labelled by hand from the text alone, by a written protocol, without looking at what the rules said. The labels are in the repository as class codes. The description text stays out of git because it can name people and addresses.

**What the original rules got wrong** (2023 sample, 56% agreement in Chicago, 77% in Seattle):

- "Erect" sent rooftop solar arrays, fences and scaffolds to new construction. Fifteen of 200 Chicago rows were solar permits alone.
- Electrical service upgrades, panel swaps, light fixtures and security cameras had no rule, so they fell to "other".
- Seattle writes "Construct west two-family dwelling" with no "new", and half its new-construction rows were missed.
- Fire-alarm permits that mention a tenant build-out were read as alterations.

**Held-out result** (2022, labelled before either rule set was run on it):

| city | original rules | revised rules (95% interval) |
|---|---|---|
| Chicago | 60.0% | 85.3% (78.8 to 90.1) |
| Seattle | 78.0% | 95.3% (90.7 to 97.7) |

On the held-out rows the revision was the only one right on 40 Chicago and 27 Seattle rows. The original was the only one right on 2 and 1.

**Caveats.** There is one labeller (the agent that ran the session), so there is no inter-rater agreement yet. Each year's sample comes from the rows the open-data API returned at fixed offsets, not a uniform draw. Only the two cities whose structured fields are empty were checked.

**First use.** The cleaner class went straight into the cross-city test. A model trained on Chicago, San Francisco and Austin was used to predict Seattle's 2024 application-to-issue times. Its 90th-percentile error was 27.4% worse than Seattle's own baseline with the old class. It got worse, 41.7%, with the unchecked rules, and better, 15.9%, with the revised ones. That is one test year with three seeds.

**Why it matters.** Earlier transfer results showed that cost, description length and calendar fields carry across cities. They could not show whether the kind of work does, because the class feature was mostly "other". With rules that agree with a reader 85 to 95% of the time, that test now means something, and its first run is above. The evaluation script is `research/build-data/src/desc_eval.py`, and the full numbers are in `research/build-data/results/desc_rules_eval.json` and section 4.4b of the paper draft.
