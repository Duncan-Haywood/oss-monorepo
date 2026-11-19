# Log

## 2026-11-18 · Re-score with 8-connected obstacles and a 4-px floor (quality fix)

- The 2026-11-17 quality audit found ground-truth obstacles labelled 4-connected with no size floor: 80 of 204 were single pixels, many from one diagonal pole. Now 8-connected and at least 4 px on both sides (false alarms already had the 4-px floor). MaSTr1325 archives re-downloaded; both SHA-256 matched the pinned values.
- Counts on the 300 test frames: 204 (old rule), 141 (8-connected, no floor; 36 still single pixels), 80 (8-connected, >= 4 px). Objects of 16 px or more: 31 -> 32.
- Retrained all nine runs and scored both rules on the same predictions. Old rule: 31.2% / 34.0% (first run 31.9% / 33.7%). New rule: 34.6% +- 7.2 / 35.0% +- 6.2 of 80; 16 px and up 61.5% / 64.6%. The headline (most floating obstacles missed) stands.
- Changed: with augmentation, all-object recall no longer falls under fog (32-35%, was 34% -> 24%); the far-obstacle trend is withdrawn (nearest-horizon bin now 48%, no monotone pattern); the clean net's large-object loss under fog has a wide seed spread (t = 0.3: 29% +- 35).

## 2026-11-11 · Milestone 9a: MaSTr1325 baseline, fog, glint and object size

- Question: does a CPU-trainable published segmentation network find the obstacles a USV must avoid, and how much do fog and sun glint cost? Data: MaSTr1325 (22 MB + 2 MB from data.vicos.si, CC BY 4.0), split by hashed blocks of 25 consecutive frames (1025 / 300).
- First pass counted zero floating obstacles: MaSTr1325 annotators leave an unknown margin round each object, so a 1-pixel ring saw only ignored pixels. Fixed with a 3-pixel ring that skips unknowns; counts are stable for rings of 3 to 8 px (204 to 189). Reran with per-object records so size and range could be binned afterwards.
- 173 of the 204 floating components are under 16 px at 320x240. A crop montage showed both real distant buoys and swimmers and fragments of thin structures (poles, a mooring line), so recall is reported above and below 16 px.
- Outcome (`experiments/results.txt`): LR-ASPP mIoU 0.967, floating recall 32% (60% for 16 px or more); uniform fog t = 0.15 cuts large-object recall to 23% (clean training) and 61% (fog + glint augmentation); glint leaves recall flat but takes the clean net's false alarms from 0.08 to 0.28 per frame. The pixel MLP finds 8% and nothing at t = 0.5.
- Not yet: MODS evaluation, WaSR, depth-dependent fog, the link to `marine-colregs`.
