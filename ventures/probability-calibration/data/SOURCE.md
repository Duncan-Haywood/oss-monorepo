# Example data

`nfl-elo-2010-2020.csv`: FiveThirtyEight's NFL Elo forecasts and results for
the 2010 to 2020 seasons (regular season and playoffs), one row per game.

- **Source:** `data/nfl_games.csv` in the
  [fivethirtyeight/nfl-elo-game](https://github.com/fivethirtyeight/nfl-elo-game)
  repository, which accompanies FiveThirtyEight's NFL forecasting game,
  downloaded from
  `https://raw.githubusercontent.com/fivethirtyeight/nfl-elo-game/master/data/nfl_games.csv`.
- **Retrieved:** 2026-11-16.
- **SHA-256 of the downloaded file:** `af16cf3c5848393057fad07feea278f0a85ab7b57ddbfe42ed96b5c80e7d519d`
  (16,810 games, 1920-09-26 to 2021-02-07).
- **Licence:** MIT, "Copyright (c) 2021 ABC News Internet Ventures" (the
  repository's `LICENSE`, which permits copying, modification and
  redistribution with the notice kept). The notice:

  > Copyright (c) 2021 ABC News Internet Ventures
  >
  > Permission is hereby granted, free of charge, to any person obtaining a copy
  > of this software and associated documentation files (the "Software"), to deal
  > in the Software without restriction, including without limitation the rights
  > to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
  > copies of the Software, and to permit persons to whom the Software is
  > furnished to do so, subject to the following conditions:
  >
  > The above copyright notice and this permission notice shall be included in all
  > copies or substantial portions of the Software.
  >
  > THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
  > IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
  > FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
  > AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
  > LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
  > OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
  > SOFTWARE.

## What was changed

`build_example.py` (standard library) keeps seasons 2010 to 2020, drops the 9
games in those seasons that ended in a tie (`result1` = 0.5, an outcome a
win probability does not cover), keeps 2,930 games, renames the columns and
rounds `elo_prob1` to 6 decimals:

| Column | From | Meaning |
| --- | --- | --- |
| `date`, `season`, `playoff` | same | game date, season, 1 for a playoff game |
| `home`, `away` | `team1`, `team2` | team abbreviations; `team1` is the home team (on a neutral site, the designated one) |
| `elo_prob_home` | `elo_prob1` | the Elo model's pre-game probability that the home team wins |
| `home_won` | `result1` | 1 if the home team won, 0 if it lost |

SHA-256 of the result: `e8a18fdada4cbf837d5400021b9becb0164d69fcbe9d8c4c8681972b8f2c2101`.

The probabilities are FiveThirtyEight's simple Elo model as published in that
file (the repository's `forecast.py` regenerates them), not its
quarterback-adjusted forecasts. Nothing here is affiliated with or endorsed by
FiveThirtyEight or ABC News.
