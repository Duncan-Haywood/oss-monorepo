# X-Trans near-clean lift: its own tune pass, on a fresh set of sample raws (2026-11-19)

Flagship item (portfolio/flagships.yaml photo-editing `next:`, "an X-Trans tune pass for its own k").
eval/near-clean-gate-2026-11-19.md shipped `lift_near_detail` for Bayer at k 12 and left X-Trans off
(`NEAR_DETAIL[6] = None`) because k 12 failed h3 there by one unchanged over-read row.

## Data: a fresh set, because raw.pixls.us is unreachable from this session

raw.pixls.us answered `CONNECT tunnel failed, response 403` here, so the `fourth` and `first` sets cannot be
fetched. The scenes are instead the 60 raws in github.com/drewnoakes/metadata-extractor-images (sparse checkout
of its `arw cr2 dng nef orf pef raf rw2 srw` folders; 55 bodies after grouping `Issue 247-1..4` and
`DJI Phantom 4 (1)/(2)`). No part of the near-clean work has scored these files. The X-Trans layout is taken from
that repo's `Fujifilm X-E1.raf` (`--raf`). Truths, tiles, SNRs, scenarios and seeds are the sweep's own
(`tools/near_clean_gate.py sweep`), unchanged.

Split by body with the sweep's own `split_of` (sha1 of the body name, even = tune): 29 files tune, 31 held.
The cards file that groups bodies is `eval/near-clean-gate-mei-cards-2026-11-19.json`.

## Decision rule, committed before any row was scored

- **Tune** (`split == tune` rows, X-Trans layout, every k in `KS`): `near_clean_gate.py tune` picks k (mean luma
  + colour gain of `ship+k` over `D`, ties to the larger k).
- **Held** (`split == held` rows): `near_clean_gate.py rule --k K` with the tuned K. `NEAR_DETAIL[6]` becomes K
  only if h1 (means within 0.005 dB, every cell within 0.02 dB), h2 (fewer rows lose > 0.1 dB to D, none new)
  and h3 (the worst SNR 200 row improves) all hold. If any fails, X-Trans stays `None` and this note says which.
- **Bayer replication** (reported, not a ship decision; Bayer is already on): the same 60 files on the Bayer
  layout at k 12, all rows through `rule --k 12`, to say whether the 2026-11-19 Bayer result holds on bodies
  outside raw.pixls.us.
