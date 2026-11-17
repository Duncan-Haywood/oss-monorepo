"""Build data/nfl-elo-2010-2020.csv from FiveThirtyEight's nfl_games.csv.

    curl -sSO https://raw.githubusercontent.com/fivethirtyeight/nfl-elo-game/master/data/nfl_games.csv
    python3 -I data/build_example.py nfl_games.csv > data/nfl-elo-2010-2020.csv

Keeps the 2010-2020 seasons (regular season and playoffs), drops the games
that ended in a tie (result1 = 0.5, an outcome the forecast has no
probability for), and renames the columns. The forecast is copied as
FiveThirtyEight published it, rounded to 6 decimals. Standard library only.
"""

import csv
import sys


def main(path):
    out = csv.writer(sys.stdout, lineterminator="\n")
    out.writerow(["date", "season", "playoff", "home", "away", "elo_prob_home", "home_won"])
    kept = ties = 0
    with open(path, newline="") as f:
        for r in csv.DictReader(f):
            if not 2010 <= int(r["season"]) <= 2020:
                continue
            if r["result1"] == "0.5":
                ties += 1
                continue
            out.writerow([r["date"], r["season"], r["playoff"], r["team1"], r["team2"], f"{float(r['elo_prob1']):.6f}", r["result1"]])
            kept += 1
    print(f"kept {kept} games, dropped {ties} ties", file=sys.stderr)


if __name__ == "__main__":
    main(sys.argv[1])
