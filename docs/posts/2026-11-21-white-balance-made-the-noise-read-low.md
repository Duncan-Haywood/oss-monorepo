---
title: "White balance made our noise estimate read low. The fix was a colour ratio, then the old rule"
seo_title: "Estimating white-balanced raw noise with patch PCA: ratios first"
date: 2026-11-21
tags: [photo-editing, raw, demosaic, noise-estimation, pre-registration]
description: "Patch PCA read white-balanced raw noise at about half its true level. Colour ratios first, then Chen's rule, gain 0.21 dB held out at low SNR."
---

The photo developer in `ventures/photo-editing` reads how noisy a raw file is
from the frame itself, so its noise-aware demosaic can smooth where edges are
not worth keeping. The read is patch PCA. It keeps 6 x 6 patches of the mosaic
with little texture, takes their covariance, and reads the noise variance from
the small eigenvalues using Chen, Zhu and Heng's 2015 rule.

The rule assumes every sensel in a patch has the same noise. After white
balance they don't: red and blue are multiplied by more than green, so their
noise is louder. The eigenvalue rule then settles nearer the quiet green. On
held-out tiles it read white-balanced noise at a median **0.52 to 0.62 of the
true sigma** at SNR 60 to 12. With equal noise it read 0.76 to 0.79.

## Two earlier tries, and what they showed

On 2026-11-19 we tried reading the smallest eigenvalue over its
Marchenko-Pastur edge, once for the whole patch and once per colour. Both
failed their committed test. Dense foliage fills even the quietest direction
of a patch. Dividing by the edge, about 0.57 for the ~590 patches a bin keeps,
then amplifies that texture by 1.75x. Reading higher everywhere fixed the white
balance and broke the foliage.

So this run split the job in two. The colours' noise *ratios* come from the
per-colour reads: texture is mostly common to the colours, so it moves a ratio
less than it moves a level. Each colour is then scaled to equal noise, and the
*level* comes from Chen's rule as before, with no Marchenko-Pastur division.

## A synthetic check found a second cause

On a synthetic white-balanced ramp, the ratio read (`mpcw`) closed only about a
fifth of the gap: 0.73 became 0.83 at SNR 12. The rest came from the patch
selection. Liu's weak-texture test drops a patch when its gradient energy is
above what noise of the *current read* would give. When that read is low, the
test throws away the noisiest pure-noise patches, and the read stays low.
Running the selection on the whitened read as well (`mpcws`) brought the
synthetic reads to 0.97 to 0.98 from SNR 60 down.

## The test, committed before any real row

The pick and the test were committed and pushed before the sweep ran. The data
was 60 public raws from metadata-extractor-images, split by camera body into
tune and held-out halves, because raw.pixls.us refused this session.

- **Pick (tune):** the candidate with the higher mean gain over directional.
  It also had to beat what ships and add no rows losing over 0.1 dB.
- **Test (held out):** means within 0.005 dB, no new losing row, and at least
  +0.02 dB luma on the white-balanced SNR 25 and 12 rows.

| tune, 162 rows | luma over directional | losing rows |
|---|---|---|
| what shipped (Chen) | +0.566 | 6 |
| `mpcw` | +0.640 | 6 |
| `mpcws` | +0.856 | 10 |

`mpcws` gained most but added four losing rows, so the rule picked `mpcw`. Held
out, `mpcw` passed all three hypotheses: +0.095 dB luma on average, **+0.21 dB
on the white-balanced SNR 25 and 12 rows**, and no row newly worse than
directional. It is now the default noise read for Bayer files. X-Trans keeps
Chen's rule, since it was not tested.

## The one that got away, for now

Held out, `mpcws` would have passed too, at three times the gain (+0.31 dB
luma, +0.67 dB on the low-SNR white-balanced rows, no losers). All ten of its
tune losers come from one file: a Pentax K-1 Mark II frame shot at ISO 1600
for 30 seconds. Its "clean" truth is grainy. The raw-read grain passes the
sweep's cleanliness test, but the frame read of the clean mosaic is 2 to 4
times higher.

It is tempting to drop that file and ship the bigger gain. That would mean
changing the rule after seeing the answer. So `mpcws` stays an option
(`eig="mpcws"`), and the next run starts by committing how a noisy truth is
judged, before scoring it again.

Rows, output and the reproduce commands:
`ventures/photo-editing/eval/noise-pca-whitened-level-2026-11-21.md`.
