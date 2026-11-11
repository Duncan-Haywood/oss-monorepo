# Log

## 2026-11-11 · Milestone 9a: MaSTr1325 baseline, fog, glint and object size

- Question: does a CPU-trainable published segmentation network find the obstacles a USV must avoid, and how much do fog and sun glint cost? Data: MaSTr1325 (22 MB + 2 MB from data.vicos.si, CC BY 4.0), split by hashed blocks of 25 consecutive frames (1025 / 300).
- First pass counted zero floating obstacles: MaSTr1325 annotators leave an unknown margin round each object, so a 1-pixel ring saw only ignored pixels. Fixed with a 3-pixel ring that skips unknowns; counts are stable for rings of 3 to 8 px (204 to 189). Reran with per-object records so size and range could be binned afterwards.
- 173 of the 204 floating components are under 16 px at 320x240. A crop montage showed both real distant buoys and swimmers and fragments of thin structures (poles, a mooring line), so recall is reported above and below 16 px.
- Outcome (`experiments/results.txt`): LR-ASPP mIoU 0.967, floating recall 32% (60% for 16 px or more); uniform fog t = 0.15 cuts large-object recall to 23% (clean training) and 61% (fog + glint augmentation); glint leaves recall flat but takes the clean net's false alarms from 0.08 to 0.28 per frame. The pixel MLP finds 8% and nothing at t = 0.5.
- Not yet: MODS evaluation, WaSR, depth-dependent fog, the link to `marine-colregs`.
