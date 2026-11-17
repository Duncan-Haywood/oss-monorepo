# Cull showcase run, 2026-11-17

`PYTHONPATH=src python3 tools/cull_showcase.py --out /tmp/cull-showcase` (needs ffmpeg and Pillow;
fetches five OpenCV sample photos, Apache-2.0, from raw.githubusercontent.com at run time). Each
photo becomes a burst: the original (`orig`) plus copies blurred (Gaussian radius in the script),
darkened (brightness x0.3 or x0.35) or reframed (3 or 4% cropped off one corner and scaled back).
The script exits 1 if a blurred or darkened copy is chosen as a keeper; this run exited 0.

```
baboon_a.jpg     orig   group 1 keeper    score 0.87 
baboon_b.jpg     blur   group 1 alternate score 0.64 
building_a.jpg   orig   group 2 keeper    score 0.86 
building_b.jpg   blur   group 2 alternate score 0.79 
building_c.jpg   shift  group 3 keeper    score 0.86 
butterfly_a.jpg  orig   group 4 keeper    score 0.93 
butterfly_b.jpg  dark   group 4 reject    score 0.57 bad exposure
butterfly_c.jpg  blur   group 4 alternate score 0.81 
fruits_a.jpg     orig   group 5 alternate score 0.79 
fruits_b.jpg     shift  group 5 keeper    score 0.79 
fruits_c.jpg     blur   group 5 reject    score 0.39 blurry
home_a.jpg       orig   group 6 keeper    score 0.91 
home_b.jpg       dark   group 6 alternate score 0.46 
{"alternates": 5, "close_calls": 1, "groups": 6, "keepers": 6, "photos": 13, "rejects": 2, "unreadable": 0}
```

What the known answers say:

- Every blurred or darkened copy lost its group or was rejected (0 of 8 chosen as keeper).
- Two rejects, both right: `butterfly_b` (x0.35, bad exposure) and `fruits_c` (radius 5, blurry).
- Short of right: `home_b` at x0.3 brightness scored exposure 0.28 but stayed an alternate (the
  reject line is lower); `building_c`, a 4% reframe, was not grouped with its original, so the
  "shoot" shows 6 groups for 5 scenes. `fruits_b` (3% reframe) did group, and tied the original.
- Mild blur (radius 2 to 3) is an alternate, not a reject, by design: it loses to the sharp frame.

Five photos and synthetic degradations: a picture of the report and a smoke check, not a
measurement of culling on real shoots. `site/cull-report.webp` is the top of this report
(the butterfly and fruit bursts) screenshotted at 800 px CSS width.
