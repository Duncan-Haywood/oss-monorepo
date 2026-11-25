# Example data: radial velocities of HD 164922

`hd164922-rv.csv` holds 401 radial velocities (m/s) of the nearby star
HD 164922, 1996-07-11 to 2015-09-27 (UTC), from three instrument settings:

| `instrument` | What | Rows |
| --- | --- | --- |
| `k` | Keck I / HIRES, before its 2004 detector upgrade | 52 |
| `j` | Keck I / HIRES, after the upgrade | 276 |
| `a` | Automated Planet Finder, Lick Observatory | 73 |

Columns: `time_bjd` (barycentric Julian date), `rv_m_s` (velocity, m/s,
relative to an arbitrary zero point per instrument), `err_m_s` (the
measurement error, m/s, without stellar jitter), `instrument`.

- **Source file:** `164922_fixed.txt` (kept unmodified beside the CSV), from
  the radvel package's example data,
  <https://raw.githubusercontent.com/California-Planet-Search/radvel/master/example_data/164922_fixed.txt>.
  SHA-256 at retrieval:
  `98b23e3931d202be8a84a576115fdda42ca1229b33f73b9952504e687669879d`.
- **Retrieved:** 2026-11-15 by this repository's session.
- **What was changed:** the space-separated columns `time mnvel errvel tel`
  became the CSV columns above; the `svalue` column (every row `\nodata`)
  was dropped. No value was changed.
- **Licence:** radvel is distributed under the MIT License, "Copyright (c)
  2016-2017 Benjamin J. Fulton, Erik A. Petigura, Sarah Blunt, and
  contributors". Its notice is reproduced below as the licence requires. The
  velocities themselves are published measurements.
- **Cite the data:** Fulton, B. J., Howard, A. W., Weiss, L. M., et al.
  (2016). Three Temperate Neptunes Orbiting Nearby Stars. *The Astrophysical
  Journal* 830, 46. doi:10.3847/0004-637X/830/1/46 (arXiv:1607.00007). That
  paper announced HD 164922 c from these data.
- **Cite radvel:** Fulton, B. J., Petigura, E. A., Blunt, S., Sinukoff, E.
  (2018). RadVel: The Radial Velocity Modeling Toolkit. *Publications of the
  Astronomical Society of the Pacific* 130, 044504.

## The planets, for checking the tool

| Planet | Period (days) | Where the period comes from |
| --- | --- | --- |
| b | about 1,200 (1206.3 is the starting value in radvel's `example_planets/HD164922.py`) | Butler et al. 2006; Fulton et al. 2016 |
| c | 75.77 (75.771 in radvel's example) | Fulton et al. 2016 |
| d | 12.46 | Benatti et al. 2020 (HARPS-N), as listed by the NASA Exoplanet Archive; confirmed by Rosenthal et al. 2021 |
| e | 41.76 | Rosenthal et al. 2021, *ApJS* 255, 8 (California Legacy Survey I), as listed by the NASA Exoplanet Archive |

Planets d and e were announced after these data were published and with
more data than these 401 points. The tool's finding that the same 401
points already show peaks at both periods is a retrospective check, made
knowing the answer, not a discovery.

## radvel's FSL-1.1-MIT licence notice

```
The MIT License (MIT)

Copyright (c) 2016-2017 Benjamin J. Fulton, Erik A. Petigura, Sarah Blunt, and contributors.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
