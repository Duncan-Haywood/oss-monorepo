# Example data

## `portal-rodents.csv`

- **Source:** the Portal Project, long-term monitoring of a Chihuahuan Desert
  ecosystem near Portal, Arizona, published by Weecology at
  <https://github.com/weecology/PortalData> (main branch): files
  `Rodents/Portal_rodent.csv` (79,828 capture records, 1977-2026),
  `Rodents/Portal_rodent_species.csv` and
  `SiteandMethods/Portal_plot_treatments.csv`.
- **Licence:** CC0 1.0 Universal (the repository's `LICENSE`: "Weecology has
  dedicated all copyright and related and neighboring rights to this software
  to the public domain worldwide"). Not affiliated with or endorsed by the
  Portal Project or Weecology.
- **Retrieved:** 2026-11-18. SHA-256 of the raw files:
  `Portal_rodent.csv` `6fee8dcd0c80648bdf812fad0c73c9389c555dc40e9692cc232e60f8d5a7a279`,
  `Portal_rodent_species.csv` `0496f3bba78cc347bc0ab1464303e9ddad5a4dc20914d3a6861ab844dd30dce1`,
  `Portal_plot_treatments.csv` `bc018a448f15d4d56977a679eb1233f6027e09c51b9f83ab674ccf4feadad3e9`.
- **Reshaped by** `python3 -I eval/build-example.py DIR > data/portal-rodents.csv`:
  one row per plot and species (305 rows), with `plot`, `treatment` (the
  plot's treatment since April 2015: unmanipulated control, kangaroo rats
  removed, all rodents removed), `species` (the census code),
  `scientific_name` and `individuals`.
- **What it counts:** distinct rodents caught in 2016-2025, each counted once,
  on the plot where it was first caught in that window. An individual is the
  census `id` column (built from its tag); the few records with no id count
  once each. Rodents not identified to species, and the birds and reptiles
  occasionally trapped, are left out (the species table's `rodent` = 1 and
  `unidentified` = 0). 6,094 individuals of 21 species on 24 plots.
- **Caveat:** counting tagged individuals once over ten years is one choice of
  sampling unit; captures per monthly survey would give different numbers.
  The plots are an experiment; the page's readings are descriptive and pool
  plots and years, not a re-analysis of the project's published results.
