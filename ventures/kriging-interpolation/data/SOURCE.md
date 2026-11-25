# Example data

## `era5-wave-height-2024-01.csv` (the page's example and a verification dataset)

- **What:** median significant wave height (metres) over the 744 hourly values
  of January 2024 at 371 ocean points of a 10-degree longitude-latitude grid
  (70°S to 70°N; points over land or sea ice in that month have no value and
  are absent). Columns `lat`, `lon`, `hs_m`.
- **Dataset:** ERA5 reanalysis, ocean-wave component (Hersbach et al. 2020,
  *The ERA5 global reanalysis*, Quarterly Journal of the Royal Meteorological
  Society 146(730), 1999-2049, doi:10.1002/qj.3803), served by the Open-Meteo
  marine API (`models=era5_ocean`), which snaps each request to its nearest
  0.5-degree wave-grid point.
- **Licence:** CC BY 4.0. Contains modified Copernicus Climate Change Service information (2024).
  Neither the European Commission nor ECMWF is responsible
  for any use that may be made of the Copernicus information or data it
  contains.
- **How it got here:** retrieved on 2026-11-16 by this repository's
  `research/marine-hull/experiments/fetch_era5_sites.py` (milestone 6x), which
  wrote `research/marine-hull/experiments/data/era5_grid_2024.csv` (SHA-256
  `eb9ada685cf53d5e2c1dfc7424f5e554e7ec56100e3c4ce79a09f3122d1d6e99`
  when this file was made). This file keeps that file's rows with `month`
  equal to 1 and its `lat`, `lon` and `hs_med` columns (renamed `hs_m`); no
  value was changed:
  `awk -F, 'NR==1{print "lat,lon,hs_m"} NR>1 && $3==1 {print $1","$2","$5}' era5_grid_2024.csv`.
- **Why this one:** it is real, openly licensed and already in the
  repository. This session's network proxy refused the USGS, NOAA and EPA data
  hosts, so no new download was possible. A dense field data set (soil
  samples, wells) would be a better example of the tool's usual job; the
  10-degree grid is coarse for kriging.

## The soil-sample example (`SAMPLE_TEXT` in `engine.mjs`)

Made up for illustration, labelled so on the page; FSL-1.1-MIT licensed with the rest
of this directory.

## `../eval/simulation.json`

Simulated, not data: 40 Gaussian random fields drawn by `eval/simulate.mjs`
(seed 7) with a known covariance, used to check the tool's errors and bands
against the truth.
