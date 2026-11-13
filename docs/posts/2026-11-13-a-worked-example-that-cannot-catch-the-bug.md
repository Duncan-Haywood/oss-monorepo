---
title: "Glicko-2 for a club night, and a worked example that cannot catch a swapped symbol"
seo_title: "Elo and Glicko-2 rating changes for a club tournament"
date: 2026-11-13
tags: [tournament-pairing-manager, ratings, verification]
description: "Elo and Glicko-2 rating changes for a club event, and why Glickman's worked example cannot catch a mu-for-phi swap at four decimals."
---

The [tournament pairing manager](https://marisstella.app/tournament-pairing-manager/) runs a Swiss event or a bracket in the browser. Until today it stopped at the standings. The question a club organiser has next is what the evening did to everyone's rating, and they were working that out by hand or in a spreadsheet. A new **Rating changes** panel now does it, under the results, for either system:

- **Elo:** change = K × (score − expected), with expected = 1 / (1 + 10^((opponent − player) / 400)). You set K, and you can count any gap of more than 400 points as 400. Games against an unrated player are not rated for either side, and the table says how many were left out.
- **Glicko-2:** rating, rating deviation (RD) and volatility, following the steps in Mark Glickman's [Example of the Glicko-2 system](http://www.glicko.net/glicko/glicko2.pdf). A new player starts at 1500, RD 350 and volatility 0.06, which are the paper's suggested starting values. Type a player as `Name, 1610, 85` to give an RD.

In both systems the whole event is one rating period, scored against the ratings players brought in, and byes are not games. Glickman's paper says the system works best with many games per player in each period (he suggests 10 to 15 on average), so the page says that a three-round club night gives a rough update. These are estimates for a club's own ladder, not official ratings.

## Checking it

The paper's worked example is a player at 1500, RD 200, volatility 0.06, τ = 0.5, who beats a 1400 (RD 30) and loses to a 1550 (RD 100) and a 1700 (RD 300). The paper gives 1464.06, RD 151.52, volatility 0.05999. `ratings.mjs` gives 1464.0507, 151.5165 and 0.0599960, and that is now a test.

Step 5 of the algorithm, the new volatility, is the hard part: it finds the root of a function by an iterative search (the Illinois method). So a second test solves the same equation by plain bisection on 2,000 seeded random players, with 1 to 9 games each and τ between 0.3 and 1.2. The two agree to a relative gap under 1e-5.

## What the worked example does not catch

The function in step 5 is

f(x) = eˣ(Δ² − φ² − v − eˣ) / (2(φ² + v + eˣ)²) − (x − a) / τ²

where φ is the player's RD on the Glicko-2 scale. Reading the source of the PyPI package `glicko2` 2.1.0 (file `glicko2/glicko2.py`, `Player._f`), the two φ² terms are written with the player's rating, `self.__rating**2`, which is μ, not φ. I did not run that package: this session's sandbox declined to execute downloaded code, so what follows comes from a reimplementation of the one-line variant in `eval/step5-variant.mjs`, beside the paper's version. I have not checked whether a later version or the upstream repository has changed it.

What the swap does, on 5,000 seeded players in each of four rating bands (results in `eval/step5-variant.json`):

- On the paper's own example, the variant gives volatility 0.0599934 against 0.0599960. **Both round to 0.05999**, the precision the paper prints, and the rating and RD agree to within 0.00002. A test that reproduces the worked example to the paper's precision passes with the wrong symbol.
- Across the bands (1450 to 1550, 1300 to 1700, 1000 to 2000, 2000 to 2800) the largest rating gap in a single period was 0.0033 points, the 99th percentile at most 0.0007, and the largest volatility gap 0.00014.

So the practical effect on one club night is nil: nobody's displayed rating changes. The effect compounds through volatility over many periods, and I did not measure that. The lesson I am taking for this repository is narrower. A worked example is a test of the arithmetic you already wrote, at the precision someone else chose. It cannot see a mistake that moves the answer by less than that precision, and here the example's player has μ = 0, which shrinks what a μ-for-φ mix-up can do. An independent second solve of the same equation (bisection here) is cheap, and a variant script that says how big a plausible mistake would be tells you whether the example could have caught it.

## Next

The obvious next step is a ladder across events: load last month's ratings CSV as the starting list, so a club keeps its own rating history with no account anywhere. The CSV the panel downloads already has the columns that needs.

*Written with AI assistance. Not affiliated with any rating body, chess federation, or the authors of the papers and packages named.*
