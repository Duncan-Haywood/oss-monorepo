# Example data

## `premier-league-2023-24.csv`

All 380 results of the 2023-24 English Premier League season.

- Source: openfootball, `football.json`, file `2023-24/en.1.json`,
  https://github.com/openfootball/football.json (raw file
  https://raw.githubusercontent.com/openfootball/football.json/master/2023-24/en.1.json).
- Licence: the project's README states "The football.json schema, data and
  scripts are dedicated to the public domain. Use as you please with no
  restrictions whatsoever." Match results are also facts.
- Retrieved: 2026-11-18. SHA-256 of the JSON file as downloaded:
  `03e13eafbf78dfe00d7e89dd3bf6643986eb6e8fd86c7664aeb8c5bc0bed88d0`.
- Transformation: one row per match, sorted by date then home team, with
  columns `date,home,away,home_goals,away_goals` from the full-time score.
  " FC" and "AFC " were stripped from club names (so "AFC Bournemouth" is
  "Bournemouth"). Nothing else was changed.
- Check: points from these results (3 for a win, 1 for a draw) give
  Manchester City 91, Arsenal 89 and Liverpool 82, the published final
  table. Everton (48) and Nottingham Forest (36) are shown before the points
  deductions they received that season, which are not part of the results.

## `coffee-taste-test.csv`

Made up for illustration and labelled so on the page: 120 blind paired
tastings of five coffees, as `preferred,other,count`. FSL-1.1-MIT licensed with the
rest of this directory. Not a real tasting.
