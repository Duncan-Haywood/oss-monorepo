# Next: action items for a later run

Written 2026-10-20, when the owner asked to finish and merge what was done and leave the rest
here. Each item says where its code or detail lives. Take them in order; the first block is what
a user of the calculator would notice.

## Calculator and decision aid

1. **Expose the new inputs in the form.** The extended models and data are on `main`
   (`models_extended` in the bundles, `app/data/race_coverage.json`, `predictor_atlas.json`,
   `acs_occupation_divorce.json`), but the form does not ask for them yet:
   - finer race (8 groups), Asian subgroup and Hispanic origin (ACS cells; per-lens maps in
     `race_coverage.json`);
   - family of origin, siblings and parents' schooling;
   - attendance at 9 levels (with "more than once a week"), prayer, strength of religion,
     fundamentalism, denomination and religion raised;
   - political views (7 points) and party;
   - occupation group, wealth components and housing tenure.

   The per-lens value mappings are in `app/data/race_coverage.json` (race) and in each lens's
   `reproducibility/*/extended_predictors.py` and METHODS.md (the other fields); the extended
   model keys are under `models_extended` in each bundle. Held out these inputs add no skill
   (LOG.md, 2026-10-20 "Race detail, family of origin…"), so show them as factors (atlas and ACS
   cells) and keep the current scoring models unless a later test says otherwise.
2. **Decide what family-of-origin "Other" means** before the field goes in the form: GSS's
   "Other" includes never-married single parents, NLSY97 cannot separate divorce from
   never-married, NSFG merges divorce with a parent's death.
3. **Limitations text**: fixed on 2026-10-20 (wealth, occupation and relationship quality are
   scored by some lenses, occupation by none); recheck it whenever an input is added to the form.
4. **Guided decision flow**, built on the Profile report and Compare options tabs. Follow the
   IPDAS decision-aid standards:
   - name the decision and the options;
   - absolute risk at one horizon as "N in 100", with icon arrays;
   - the probability that one option is better (paired, from the per-model or posterior draws);
   - changeable vs fixed factors, with evidence grades;
   - interventions with trial evidence;
   - values clarification;
   - a one-page summary.
5. **Predictor atlas page**: a browsable view of `app/data/predictor_atlas.json` (1,159 entries,
   each traced to its source).
6. **Profile report**: a true prediction interval needs per-prediction model uncertainty. Today
   the interval resamples only the partner mix. The pooled model's posterior draws (item 9) would
   supply it.

## Models

7. **Flexible models on the large lenses.** NSFG pooled, NLSY79 first marriages, NLSY97, Canada
   GSS, SIPP retrospective and ACS were not run, and these are where boosting earlier showed
   small edges. The loaders are written. See "Action items" in
   [flexible_models/README.md](flexible_models/README.md), which also lists:
   - survival-native models (Cox elastic net, random survival forest, gradient-boosted Cox);
   - the cure model and divorce-vs-widowhood competing risks;
   - out-of-time splits;
   - full-strength reruns of the preliminary lenses;
   - TabPFN, which needs more memory or a GPU.
8. **Pooled multi-survey model: export.** It beats the single-survey models held out in
   HCMST (+4.8 points) and the LA newlyweds (+1.8), and loses slightly in the large surveys. See
   [reproducibility/unified_model/README.md](reproducibility/unified_model/README.md).
   - Run `export.py` after adding the weighted re-levelling of survey baselines.
   - Then move `unified.js.pending` and its parity test into `app/`, but only for the
     surveys where it wins, or after item 9 closes the gap.
9. **Pooled model: improve.** Let more effects vary by survey in the large surveys, or use
   hierarchical boosting, then re-run the person and leave-one-survey-out validation. Fix the
   too-narrow intervals in NSFG and SIPP histories (64% and 62% coverage of a 90% interval).

## Owner asks (cannot be done by an agent)

10. Tell the HCMST principal investigator (Michael Rosenfeld) that the data are used here, as
    the HCMST terms ask.
11. Optional: allow the session network to reach `dataverse.unc.edu` and the NSFH FTP host
    (`elaine.ssc.wisc.edu`), so NSFH (relationship quality measured at two waves) can be added.
12. Decide the demo profile's default race: today "White"; the alternative is "prefer not to
    say", which makes some lenses decline to score.
