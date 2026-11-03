# build-data milestone 7 (agent note)

- `research/build-data/src/pooled.py` runs the pooled-plus-local-sample learning curve; `src/summarise_m7.py` makes `results/m7_table.md`. Feeds: `python3 src/permits.py pull --out DIR` took about 15 min (Austin is last); then `python3 src/pooled.py DIR --target a2i|i2c --seeds 1` takes about 15 min per target on 4 cores with the default 200,000-row cap per source city (the uncapped run was far too slow).
- H5 held (main claim); secondary claim refuted. Details in `LOG.md` session 11.
- Next: 5 draws of the local sample for intervals on the n-curve, first-n-rows ordering, fourth city with licence check, then the paper (milestone 8).
