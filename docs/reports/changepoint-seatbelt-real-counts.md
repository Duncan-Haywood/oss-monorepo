# changepoint-detector: real count series (2026-10-26)

`data/uk-driver-deaths.csv` (R `UKDriverDeaths`, via Rdatasets on raw.githubusercontent.com, which answers from cloud sessions). `eval/seatbelt-law.mjs` shows `--model poisson --period 12 --overdispersion nb` finds 1983-01 with range95 1983-01..1983-02. Plain Poisson gives 33 changes; mean model adds a 1981-12/1982-02 dip pair. The step is a level change, so a real slope break in counts is still open (flagships.yaml `next:`).
