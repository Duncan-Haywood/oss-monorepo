# Do open permit records predict how long a permit and the build behind it take, better than each city's own averages?

Do open building-permit feeds predict how long a permit and the build behind it take? Research programme, AI-assisted; see [`PROPOSAL.md`](PROPOSAL.md) and [`LOG.md`](LOG.md). Relates to the construction data warehouse and `ventures/wall-framing-takeoff`.

**Live page:** https://duncan-haywood.github.io/oss-monorepo/research/build-data/

**Live page:** [marisstella.app/research/build-data/](https://marisstella.app/research/build-data/)

**Status (milestone 1 done):** loaders, one schema and datasheets for Chicago, San Francisco and Austin. 4,532,374 permit rows pulled; no model has been run yet. Descriptive finding so far: in Chicago and San Francisco the median application-to-issue time is 0 days (most permits issue over the counter) while the 90th percentile is 56 and 70 days; in Austin the median is 6 days and the 90th percentile 176. Issue-to-completion medians are about 105 days (SF) and 103 days (Austin).

- [`permits.py`](permits.py): SoQL pull, schema mapping, manifest (`python3 permits.py pull chicago sf austin`; stdlib only; cache in `data/`, gitignored).
- [`manifest.json`](manifest.json): row and date counts per feed.
- [`datasheets/README.md`](datasheets/README.md): licences, definitions, what each feed cannot show.
- `python3 -m pytest test_permits.py`.

Limitations: Chicago's licence field says only "See Terms of Use", so no Chicago rows are redistributed; permit-type vocabularies are not harmonised across cities yet.
