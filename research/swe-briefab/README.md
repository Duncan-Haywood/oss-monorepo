# Did research brief v1 change how runs go? A same-days comparison of v0 and v1 on the run ledger (preliminary, observational)

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/swe-briefab/

Pure Python standard library. Track 10 (the software-engineering loop), the real-data counterpart to `swe-prompt`, which could only simulate an experiment because every ledger row was prompt 0. Produced with AI assistance (Claude). **Preliminary: v1 was assigned by the router's random draw, but the logged task labels differ between arms, so this is not a clean randomised trial.** All numbers are in `experiments/results.txt`.

## Question

The router draws research prompt v0 or v1 for each research run. v1 is a candidate; on 15 to 18 October 2026 both were live. Over those four days, did v1 runs differ from v0 runs in errors, friction, cost or time?

## Results

Research runs dated 15 October or later: 342 on v0, 67 on v1.

- **Cost and time did not differ detectably.** Median cost $0.835 (v0, 152 priced) vs $0.820 (v1, 57): difference -$0.015, bootstrap 95% -0.148 to +0.111, permutation p = 0.72. Median wall time 3.16 vs 3.91 min (p = 0.33); median output tokens 13,433 vs 12,965 (p = 0.78).
- **Errors look lower on v1 only before accounting for task mix.** 7.5% of v1 runs record an error (5 of 67, Wilson 3.2% to 16.3%) against 17.0% of v0 runs (58 of 342, 13.4% to 21.3%); difference -9.5 points (-16.6 to -1.5), p = 0.058. But v0 drew many `extend` (73) and `new-project` (30) tasks that v1 almost never logged (0 and 1), and the label is missing on most v1 runs. Restricted to the 150 runs with no task label, the rates are 9.6% vs 8.3% (p = 1.0). The drop is task mix, not demonstrated brief effect.
- **v1 runs record more documentation friction, and it survives the same restriction.** Mean `doc_friction` entries 0.72 (v0) vs 1.24 (v1), difference +0.52 (+0.36 to +0.69), p = 0.0001; among unlabelled runs 1.02 vs 1.28 (+0.26, +0.05 to +0.48, p = 0.009). This could mean v1 sends runs into more stale instructions, or that later runs report more (the record format and the "list every instruction" request are the same text for both). The ledger cannot separate those.
- **Success and deviations:** 99.1% vs 100% success (8 non-success rows in the whole track; no test is meaningful) and 4.7% vs 3.0% of runs recording a deviation (p = 0.75).

So: no evidence yet that v1 is better or worse on cost, time, errors or success; a higher friction count worth a look at which v1 instructions the entries name.

## Method

`src/swe_briefab/__init__.py`. Reads every `prompts/runs/*.json`, keeps `track == "research"`, `prompt_version` 0 or 1, dated 2026-10-15 (the first v1 run) or later, so both arms overlap in time. Per run: has an error, outcome success, number of `doc_friction` entries, has a deviation, `cost_usd`, `wall_minutes`, `tokens_out` (missing values dropped). Differences use a 4,000-draw percentile bootstrap; p-values are two-sided permutation tests (10,000 shuffles); proportions use Wilson intervals. Means for rates and counts, medians for the heavy-tailed cost, time and tokens.

## Reproduce

```
cd research/swe-briefab
python3 -m unittest discover -s tests
python3 experiments/run.py      # rewrites experiments/results.txt from prompts/runs/
```

The ledger grows, so a re-run on a later checkout gives larger n; the committed `results.txt` is the snapshot above.

## Limitations

- Observational. The task label (`task`) is a free field most runs leave blank, and the two arms differ in what it holds; unlabelled runs are the only like-for-like subset, with 114 v0 and 36 v1 runs, too few to detect a few points of difference.
- Seven metrics were tested without correction; treat p = 0.0001 as the only clear signal and the rest as noise.
- Runs are not independent (parallel sessions share a repository and a day), which makes the intervals optimistic.
- Error and friction counts depend on how honestly each run fills in its record, and v1's own text differs from v0's in a few places (it drops the project-page paragraph and adds the idea-dupe script), so a difference cannot be traced to one line.
- Cost is priced on only 209 of 409 runs. Nothing here measures project value or correctness (`swe-value`, `swe-audit`).

## Next steps

Stratify by the task actually performed (derive it from the PR and files touched rather than the free label), read which instructions v1's extra friction entries name, and rerun after a few weeks; if v1 is to be tested for real, `swe-prompt`'s mixture SPRT with blocked assignment by task is the design.

## Owner steps

None.

## Builds on

`swe-prompt` (the sequential-testing design), `swe-ledger` (the ledger fields). Wilson (1927), JASA 22(158): 209-212, for the interval; Efron (1979), "Bootstrap methods: another look at the jackknife", *Annals of Statistics* 7(1): 1-26; Fisher (1935), *The Design of Experiments*, for the permutation test. These are cited from memory and not re-checked online.

## Outside dependencies

None beyond the Python standard library.

MIT.
