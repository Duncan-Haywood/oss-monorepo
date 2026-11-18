# Turned pages, drawn: before and after straightening

Written by `node eval/deskew-synthetic.mjs`. Nine drawn staves on a 2000 x 3000 page, turned and lightly speckled;
"right" counts heads read at the right clef-relative step in the right order. The slope column is the turn
estimateSkew found (0 when the drift is under `DESKEW_MIN_DRIFT` pixels and the page is read square).

| line px | turned (deg) | found (deg) | staves, square | right, square | staves, straightened | right, straightened | heads | estimate ms |
|---|---|---|---|---|---|---|---|---|
| 3 | 0 | 0 (not straightened) | 9 | 99 | 9 | 99 | 99 | 221 |
| 3 | 0.1 | 0 (not straightened) | 9 | 99 | 9 | 99 | 99 | 171 |
| 3 | 0.2 | 0 (not straightened) | 9 | 99 | 9 | 99 | 99 | 186 |
| 3 | 0.3 | 0.30 | 9 | 99 | 9 | 99 | 99 | 189 |
| 3 | 0.4 | 0.40 | 9 | 89 | 9 | 99 | 99 | 177 |
| 3 | 0.5 | 0.50 | 4 | 1 | 9 | 99 | 99 | 160 |
| 3 | 0.8 | 0.80 | 0 | 0 | 9 | 99 | 99 | 168 |
| 3 | 1.2 | 1.20 | 0 | 0 | 9 | 99 | 99 | 210 |
| 3 | 2 | 2.00 | 0 | 0 | 9 | 99 | 99 | 167 |
| 3 | 2.5 | 2.50 | 0 | 0 | 9 | 99 | 99 | 155 |
| 6 | 0 | 0 (not straightened) | 9 | 99 | 9 | 99 | 99 | 193 |
| 6 | 0.1 | 0 (not straightened) | 9 | 99 | 9 | 99 | 99 | 175 |
| 6 | 0.2 | 0 (not straightened) | 9 | 99 | 9 | 99 | 99 | 236 |
| 6 | 0.3 | 0.30 | 9 | 99 | 9 | 99 | 99 | 247 |
| 6 | 0.4 | 0.40 | 9 | 99 | 9 | 99 | 99 | 221 |
| 6 | 0.5 | 0.50 | 9 | 36 | 9 | 99 | 99 | 278 |
| 6 | 0.8 | 0.80 | 9 | 4 | 9 | 99 | 99 | 230 |
| 6 | 1.2 | 1.20 | 0 | 0 | 9 | 99 | 99 | 221 |
| 6 | 2 | 2.00 | 0 | 0 | 9 | 99 | 99 | 226 |
| 6 | 2.5 | 2.50 | 0 | 0 | 9 | 99 | 99 | 193 |
