# How well does a small maritime segmentation network see floating obstacles, and how much do fog and sun glint cost? MaSTr1325 on a CPU

**Status: preliminary; milestone 9a of `marine-detect` (track 23), a sub-study of the
[`marine-hull`](../marine-hull/PROPOSAL.md) programme.** An autonomous boat's collision avoidance
([`marine-colregs`](../marine-colregs/README.md)) is only as good as what its camera finds on the water. This step trains
a published lightweight segmentation network on the public MaSTr1325 dataset on four CPU cores, scores it on held-out
sequence blocks by whether it finds each *floating* obstacle (not just pixel IoU), and measures what physically modelled
fog and sun glint do to that. Research code, not a certified perception system.

**Live page:** https://marisstella.app/research/marine-detect/

## Result (300 held-out frames from 16 sequence blocks, 80 floating obstacles, 3 seeds, mean and 95% t-interval)

| model | mIoU | obstacle IoU | floating obstacles found | of those at least 16 px (n = 32) | false alarms per frame |
|---|---|---|---|---|---|
| pixel MLP (colour, saturation, row) | 0.845 | 0.635 | 9.2% +- 1.8 | 11.5% | 2.09 |
| LR-ASPP MobileNetV3, clean training | 0.967 +- 0.002 | 0.921 | 34.6% +- 7.2 | 61.5% +- 17.9 | 0.06 |
| LR-ASPP, fog + glint augmentation | 0.967 +- 0.001 | 0.920 | 35.0% +- 6.2 | 64.6% +- 4.5 | 0.08 |

Re-scored on 2026-11-18 (retrained, same code and data) after the
[2026-11-17 quality audit](../../portfolio/quality/audits/2026-11-17-marine-detect.json) found that obstacles were
4-connected with no size floor, which cut one diagonal pole into a run of 1-pixel "obstacles" (204 components, 80 of
them single pixels). Obstacles are now 8-connected and at least 4 px, the same floor false alarms always had. Scored
the old way on the same new predictions, recall is 31.2% +- 4.9 and 34.0% +- 4.6 of 204, matching the first run's
31.9% and 33.7%, so the change of rule, not retraining noise, accounts for the differences below. The old run's files
are in [`experiments/runs-4conn/`](experiments/runs-4conn/) and
[`experiments/results-4conn.txt`](experiments/results-4conn.txt).

![Recall and false alarms against fog and glint](experiments/fig_degradation.png)

- **A 0.97 mIoU hides a detector that misses most floating obstacles.** Pixel IoU is dominated by water, sky and
  shore. Of the 80 obstacle components surrounded by water, the network covers half the pixels of about a third
  (35%). The result holds under both counting rules (31 to 35%). 48 of the 80 are 4 to 15 pixels at 320x240 (10 to
  40 px in the 512x384 originals): distant buoys and swimmers and short thin structures; recall there is 15 to 17%.
  Larger objects: 62 to 65% (32 to 256 px 53 to 72%, over 256 px 93 to 100%; n = 32, so the object-sampling interval
  alone is about +-17 points). 61 components of 1 to 3 px are no longer counted; at that size an object cannot be
  told from annotation noise.
- **Fog costs the clean-trained network most of its large-object recall, with a wide seed spread.** At transmission
  0.3 (an object at 31% of the visibility range) recall of objects of at least 16 px falls from 62% to 29% +- 35, and
  to 23% +- 60 at t = 0.15, while mIoU only drops from 0.967 to 0.876. Each seed loses large-object recall under fog;
  how much varies a lot between seeds. The pixel MLP finds nothing at t = 0.3.
- **Fog augmentation makes recall fog-invariant, but on the same fog model it was trained on.** With fog and glint in
  training, large-object recall stays at 62 to 66% across every fog level and all-object recall at 32 to 35%. The
  first version reported all-object recall falling from 34% to 24%; that fall came from single-pixel fragments and is
  gone under the new rule. Real fog thickens with range and is not this uniform affine change, so this is an upper
  bound on what augmentation buys.
- **Glint does not hide obstacles; it creates false ones.** Recall is flat under glint for every model, but the
  clean-trained network's false alarms on open water rise from 0.06 to 0.27 per frame at glint strength 0.9 (4.6x);
  with augmentation they stay at 0.08 to 0.09.
- **No clear range trend.** The first version found obstacles within 10 rows of the water edge (far away on a flat
  sea) 10 to 26% of the time. Under the new rule the nearest-horizon group (under 5 rows, n = 28) is found 48% of the
  time, 5 to 10 rows 14 to 16%, 10 to 20 rows 30%, 20 to 40 rows 57% (n = 7). With bins this small and no monotone
  pattern, the range claim is withdrawn.
- Full tables, by size and by rows below the water edge, and the old rule on the same predictions:
  [`experiments/results.txt`](experiments/results.txt). Training takes 11 to 12 minutes per LR-ASPP run on 4 CPU
  cores. CPU training is not bit-reproducible.

## Method and reproduce

```bash
cd research/marine-detect
pip install -r requirements.txt                       # CPU torch is enough
PYTHONPATH=src python3 -m pytest tests -q             # metric and degradation tests, no torch needed
# MaSTr1325 (CC BY 4.0), 22 MB + 2 MB, unpacked into one directory:
curl -O https://data.vicos.si/borja/mastr1325_dataset/MaSTr1325_images_512x384.zip
curl -O https://data.vicos.si/borja/mastr1325_dataset/MaSTr1325_masks_512x384.zip
unzip -q MaSTr1325_images_512x384.zip -d mastr && unzip -q MaSTr1325_masks_512x384.zip -d mastr
PYTHONPATH=src python3 experiments/run.py --data mastr --cache mastr320.npz    # about 2 hours on 4 cores
PYTHONPATH=src python3 experiments/horizon.py --data mastr --cache mastr320.npz
python3 experiments/aggregate.py > experiments/results.txt
python3 experiments/figure.py
```

SHA-256 of the two archives used here are pinned in `src/marine_detect/data.py`; `data.verify_archive(<zip>)` checks
a download against them (both matched on 2026-11-18).

- **Data.** MaSTr1325 (Bovcon et al. 2019): 1325 frames at 512x384 from a small USV in the Gulf of Koper, with
  per-pixel labels obstacle/environment, water, sky and unknown (ignored). Frames come from sequences, so a random
  frame split leaks near-duplicates into test. The split here is by blocks of 25 consecutive ids, hashed: 1025 train
  frames, 300 test frames. Everything runs at 320x240.
- **Models.** LR-ASPP on an ImageNet MobileNetV3-Large backbone (Howard et al. 2019; torchvision), 3 classes, AdamW
  with a one-cycle schedule, 10 epochs, batch 8, horizontal flips; trained twice, once on clean frames and once with
  fog and glint augmentation (each applied with probability 0.5, t from 0.15 to 1, glint 0 to 0.9). A per-pixel MLP on
  colour, saturation and image row is the classical rung (3 epochs). Three seeds each.
- **Scores.** Pixel IoU per class, and two detection-style scores in the spirit of MODS (Bovcon et al. 2022), which
  MaSTr1325 has no boxes for: a *floating obstacle* is an 8-connected obstacle component of at least 4 pixels that
  does not touch the frame and whose 3-pixel ring (unknown pixels skipped) is mostly water; it is *found* when at least
  half its pixels are predicted obstacle. A *false alarm* is an 8-connected predicted obstacle blob of at least 4
  pixels lying wholly on ground-truth water; a blob touching an unknown pixel is not counted (it may be an unlabelled
  object). The 4-pixel floor and the half-cover rule are this study's choices, not the MODS protocol, which scores
  boxes. The test blocks hold 80 floating obstacles (204 under the first version's 4-connected, no-floor rule).
- **Fog** is the atmospheric scattering model I = J t + A (1 - t) (Koschmieder 1924; Narasimhan and Nayar 2002;
  synthetic fog for segmentation as in Sakaridis et al. 2018), with uniform transmission t and airlight 0.8. With
  the 2% contrast threshold an object seen through transmission t sits at d / V = -ln(t) / 3.912 of the
  meteorological visibility V: t = 0.5 is an object at 18% of the visibility range, t = 0.15 at 48%.
- **Glint** is stylised: three saturating Gaussian highlights (sigma 6% of the width) centred on random water pixels,
  added and clipped at 1; its strength is swept 0.3 to 0.9 because no glint statistics for this site exist.
- **Range.** Each floating obstacle's waterline row is compared with its frame's water edge (median topmost water
  row, from the ground truth); on a flat sea, rows below the edge fall roughly as 1 / range.

## Related work

- Bovcon, Muhovič, Perš and Kristan (2019), *The MaSTr1325 dataset for training deep USV obstacle detection models*,
  IROS, doi:10.1109/IROS40897.2019.8967909. The data used here.
- Bovcon and Kristan (2022), *WaSR: a water segmentation and refinement maritime obstacle detection network*, IEEE
  Transactions on Cybernetics, doi:10.1109/TCYB.2021.3085856. The strong published baseline this step does not yet
  reproduce (it needs the IMU channel and a ResNet-101 encoder).
- Bovcon, Muhovič, Vranac, Mozetič, Perš and Kristan (2022), *MODS: a USV-oriented object detection and obstacle
  segmentation benchmark*, IEEE Transactions on Intelligent Transportation Systems, doi:10.1109/TITS.2021.3124192.
  The detection-style protocol the scores here imitate.
- Žust, Perš and Kristan (2023), *LaRS: a diverse panoptic maritime obstacle detection dataset and benchmark*, ICCV,
  arXiv:2308.09618. A larger successor dataset.
- Howard et al. (2019), *Searching for MobileNetV3*, ICCV, arXiv:1905.02244. The backbone and LR-ASPP head.
- Narasimhan and Nayar (2002), *Vision and the atmosphere*, IJCV 48(3), doi:10.1023/A:1016328200723. The scattering model.
- Sakaridis, Dai and Van Gool (2018), *Semantic foggy scene understanding with synthetic data*, IJCV,
  arXiv:1708.07819. Synthetic fog for training and testing segmentation.

Related labs: ARPG (Heckman; perception and sim-to-real for field robots), RECUV (unmanned vehicles).

## Limitations

- 320x240 instead of 512x384, 10 epochs on a CPU, no IMU channel: a baseline, not a reproduction of WaSR's numbers.
- MaSTr1325 has no official test split; the block split is ours, and every frame is from one harbour in fair weather.
- Fog is uniform over the frame (real fog thickens with range), and the glint model has no sourced statistics.
- "Floating obstacle" and "found" are mask-based analogues of MODS, not the MODS protocol, and the smallest
  components include annotation fragments a person would not call an obstacle.

## Next steps

- Evaluate on MODS itself (its sequences and protocol) so the numbers compare with WaSR and the published leaderboard.
- Depth-dependent fog from the flat-sea geometry and the camera height, instead of uniform transmission.
- Turn recall against range into a miss-rate model and feed it to `marine-colregs`: how late does the boat see a
  buoy, and what does that do to its closest point of approach?

AI-assisted (Claude Code).

## Known gaps

From the [2026-11-17 quality audit](../../portfolio/quality/audits/2026-11-17-marine-detect.json):

- Fixed 2026-11-18: 4-connected obstacles with no size floor (now 8-connected, at least 4 px on both the ground-truth
  and false-alarm side; re-scored above). The tests now pin the connectivity, the size floor, the half-cover
  threshold, the water-ring filter, the fog midpoint and the t-quantile; `model.py` (training) is still untested.
- eWaSR (Teršek et al. 2023), the closest lightweight-network result on MODS/MaSTr1325, is not cited.
