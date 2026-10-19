# Which couple characteristics predict annual divorce incidence?

**Headline:** in original public U.S. microdata, interpretable models identify broad associations but modest prediction gains among intact marriages. The enriched additive couple model reduced respondent-held-out Poisson loss by about **3.4%** versus a constant rate; more flexible trees/interactions did not improve on it. Higher schooling is associated with lower incidence, but no validated personal matchmaking optimum or safe anniversary cutoff is established.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/marriage-divorce-evidence/

**Live page:** https://marriage-divorce-evidence.duncan1921.chatgpt.site/?view=1

**Try it:** the [divorce odds calculator for couples](app/) ([live](https://duncan-haywood.github.io/monorepo-projects/research/marriage-divorce-evidence/app/)) runs these models in your browser: enter two profiles to see year-by-year divorce odds, the chance of no divorce by year 40, per-input explanations and which changes the models link to lower risk.

[Research homepage](../README.md) · [Claude Code handoff](CLAUDE.md) · [Portable report](Report.html) · [Data sources](DATA_SOURCES.md) · [Model card](MODEL_CARD.md)

## Open it immediately

From this directory run `python3 -m http.server 8080`, then open `http://localhost:8080/Report.html?view=1`. The complete report is a standalone snapshot with reviewed aggregate data embedded. It needs no API key or account. The hosted Sites editing backend is separate; this static copy does not replicate shared owner editing.

## Edit the website

Use Node22.12+ or a compatible newer Node version. Run `cd report-app`, `npm ci`, then `npm run dev -- --host 127.0.0.1`. The report body is in `src/content/report/ReportContent.jsx`, scoped CSS in its adjacent file, and reviewed results/source metadata in `src/data.json`. Preserve the stable artifact ID and source definitions. `npm run build` runs protected-runtime verification before compiling. Do not bypass a failed integrity check. See the app’s AGENTS.md for the supported editing boundaries. The portable config is restored to its original unbound template; it does not carry the live Site project identity or any credentials.

## Reproduce the research

Use Python3.11: `python3 -m venv .venv`, activate it, then `python3 -m pip install -r requirements.txt`. Analysis code/results live under `reproducibility/`. Raw sources, selected inputs, versions and caveats are documented in each folder.

Git contains code, aggregate CSVs, method/audit files and13trained model checkpoints. Individual-record extracts and raw archives are excluded from Git. Restore them from the complete local handoff ZIP with `python3 scripts/restore_inputs.py /absolute/path/to/Marriage_Divorce_Claude_Handoff.zip`, or use the source download/extraction scripts. Official raw ACS/NLSY archives total about1GB. Once inputs are restored, the ML quickstart is:

```sh
OPENBLAS_NUM_THREADS=1 python3 reproducibility/ml_couples/train_models.py
python3 reproducibility/ml_couples/verify_and_manifest.py
OPENBLAS_NUM_THREADS=1 python3 reproducibility/ml_individuals/run_all.py
```

Source-specific pipelines cover ACS, NSFG, NLSY79; joint couple profiles; exact duration exposure splitting; first-birth stages; religion/politics; degree-by-occupation; interpretable ML and held-out calibration. Start with each folder’s METHODS.md/README.md. Rebuilding a report after a full analysis rerun also requires its assembly helpers, documented in reproducibility/README.md.

## Research limits

Annual person-time incidence, ACS past-year report proportions, current divorced prevalence and retrospective dissolution are distinct targets. Do not pool their rows or convert annual rates directly into lifetime risk. NLSY79 is an older cohort, with survivor/attrition selection and approximate respondent-cluster uncertainty rather than complete survey-design variance. Most results are exploratory; the duration adjacent-band tests use Holm adjustment. Tree splits are predictive partitions, not confirmed biological or social thresholds. These models do not establish causal effects, fidelity, personal compatibility or a forecast for an unmarried27-year-old. Wealth/business income and spouse belief histories are not interchangeable with wages or own attendance.

## Provenance and assistance

Prepared19October2026 using official public ACS2023, NSFG2017–2019 and NLSY79 through2022 archives. Analysis and presentation were developed with AI assistance, with independent numerical checks recorded alongside results. Authored project code follows the repository MIT license; source datasets and third-party UI dependencies retain their providers’ terms. No personal financial profile or credentials are included.
