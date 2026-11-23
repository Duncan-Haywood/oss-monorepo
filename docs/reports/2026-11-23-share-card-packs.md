---
kind: analysis
subjects: [pages]
topics: [hosting, ci]
date: 2026-11-23
title: Share cards packed into 512 files give the shard Worker about 8,000 files of headroom
description: The shard held 19,635 of 20,000 files on 2026-11-23; 8,471 were share cards. Packing them leaves 11,494 locally. The site Worker (19,183) is next.
---

# Share cards packed into 512 files

## Where the Workers stood

The `deploy-cloudflare` job of Portfolio Pages run 45108032707 (2026-11-23
03:54 UTC, commit 92cac7bc2) uploaded:

| Worker | files | free-plan limit | left |
|---|---:|---:|---:|
| shard (`research/`, `writing/`, `dev/`, `changepoint-detector/`, `hearth-and-horizon/`) | 19,635 (533 new + 19,102 already uploaded) | 20,000 | 365 |
| site | 19,183 (43 + 19,140) | 20,000 | 817 |

The 2026-11-20 move left about 18,700 in each, so the shard was growing
about 300 files a day (mostly `writing/`: a post is an `index.html`, a
`share-card.png`, and pagination pages). At that rate it would have gone
over 20,000 and blocked every deploy (`split.mjs` refuses) within about a day.

## What the files were

A local build of the same tree (`node build.mjs --out=dist --audio-cdn`,
2 min 46 s, 8,533 cards drawn cold) had 37,185 files before `dev/` and the
daily brief were added. Of them 9,956 were `share-card.png` (474 MB), and
8,471 of those were under the shard's directories:

| directory | files | share cards |
|---|---:|---:|
| `writing/` | 14,728 | 7,355 |
| `research/` | 3,254 | 1,114 |
| `changepoint-detector/` | 911 | 1 |
| `hearth-and-horizon/` | 559 | 1 |

Cards are read only by link-preview fetchers, never by a page, so they are
the files that can be served by code without a reader noticing.

## The change

- `cardpack-build.mjs` (called by `split.mjs` on the shard after the split)
  appends each card to one of 512 pack files picked by an FNV-1a hash of its
  URL path and deletes the original. A pack is a 4-byte header length, a
  JSON header `{path: [offset, length]}` and the PNGs.
- `shard/worker.mjs` answers a `GET`/`HEAD` for `.../share-card.png` by
  fetching that one pack from its own assets and returning the bytes with
  `Content-Type: image/png`, a one-day `Cache-Control` and the security
  headers (a Worker-built response does not get `_headers` rules; they moved
  to `security-headers.mjs` so the Worker can import them without `node:fs`).
  Anything else, or a card not in its pack, falls through to the assets
  as before.
- Card requests were already metered: every path under `SHARD_DIRS` runs
  `router.mjs`. The request count does not change.

## Checked

- On the local build: `split.mjs` reports `site Worker: 17733 files; shard
  Worker: 11494 files` and `shard share cards: 8471 packed into 512 file(s)`
  (4.6 s). Largest pack 1,416 KB; all packs 390 MB.
- Every one of the 8,471 cards fetched through `shard/worker.mjs` with an
  ASSETS stub over the packed directory came back byte-identical to the
  built PNG, 0.7 ms per card including the disk read (the free plan allows
  10 ms of CPU per request; most of a fetch is I/O, not CPU).
- `node --test "cloudflare/*.test.mjs"`: 17 pass, 5 of them new
  (`cardpack.test.mjs`).
- Not checked here: the real Cloudflare runtime. The first deploy after the
  merge is the check. Fetch any `/writing/<slug>/share-card.png` and expect
  `200 image/png`, then look for the `shard share cards:` line in the job log.

## Next: the site Worker

The site Worker had 817 files left and grows about 160 a day (19,183 on
2026-11-23 against about 18,700 on 2026-11-20), so roughly five days. About
1,450 of its files are tool share cards. Packing them the same way needs the
router to run for card paths: `run_worker_first` would need a pattern such
as `/*/share-card.png`, and whether Cloudflare's pattern `*` spans `/` has
not been checked by any run. A wrong pattern either fails the deploy or
leaves tool cards 404, so try it in its own PR and check the live card after
the deploy. The other options stand: Workers Paid ($5 a month, 100,000 files,
owner's call) or a third Worker (workflow change, owner-approved).
