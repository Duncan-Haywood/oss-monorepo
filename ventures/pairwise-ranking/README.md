# Pairwise ranking: who is really the strongest, from who beat whom?

**Live:** https://marisstella.app/pairwise-ranking/ · free, runs in the browser, nothing uploaded.

Paste head-to-head results (sports fixtures, chess games, a blind taste test,
A-or-B design picks, debate rounds) and get:

- a **rating** for every player from all the results at once (Bradley &
  Terry 1952; Zermelo 1929), on Elo's familiar scale, with a **standard
  error** and interval;
- the **chance each is really ahead** of the next one, a **rank range** and
  the **chance of being top**, by simulation from the fit's uncertainty;
- **draws** by Davidson's (1970) model, or as half a win each, or left out;
- a **home or first-mover advantage** (Davidson & Beaver 1977) with a
  likelihood-ratio test, switched on by home/away headers;
- **win, draw and loss chances** for any pairing, and a head-to-head table;
- an honest answer when **no ranking exists** (Ford 1957): which players
  never lost to anyone outside their group, and a clearly labelled penalised
  fit instead.

## Use it

- **Browser:** open the page, paste or open a CSV, or load one of the two examples.
- **Command line** (Node 18+, no dependencies):

  ```
  node cli.mjs data/premier-league-2023-24.csv --predict "Arsenal,Liverpool"
  node cli.mjs data/coffee-taste-test.csv --csv > ratings.csv
  node cli.mjs results.csv --ties half --home no --json
  ```

  `--help` lists every option and prints the citations.
- **Agents:** `node platform/agents/tools.mjs call pairwise-ranking analyze --input '{"csv":"winner,loser\nA,B\nB,C\nC,A\n"}'`,
  or `{"games":[{"a":"A","b":"B","outcome":"i"}, ...]}` with outcome `i`
  (first wins), `j` or `tie`; the same through the MCP server.
- **JavaScript:** `analyze(input)` returns JSON with a plain-language
  `summary`; `fit`, `fitMM`, `predict`, `readGames` and `strongComponents` are
  exported.

Input shapes (a header row is expected):

| Columns | Meaning |
| --- | --- |
| `winner,loser` | each row is a win for the first name |
| `a,b,result` | result `1`/`0`/`0.5`, `W`/`L`/`D`, `H`/`A`/`D`, `draw`/`tie`, or the winner's name |
| `home,away,home_score,away_score` | the scores decide; blank scores (unplayed) are skipped |

An optional `count`, `n`, `times` or `weight` column repeats a row. Date,
round and week columns are ignored. Comma, semicolon and tab delimiters work.

## Model

Player `i` has log-strength `λ_i`. In a game where `i` is listed first, with
`h = 1` when the first-listed side has the home advantage,

```
u_i = λ_i + α h,   u_j = λ_j,   u_t = δ + (u_i + u_j) / 2
P(i wins), P(tie), P(j wins) = softmax(u_i, u_t, u_j)
```

which is `P(i wins) = H π_i / (H π_i + π_j + ν √(H π_i π_j))` with `π = e^λ`,
`H = e^α`, `ν = e^δ`: Davidson's tie model with a multiplicative order
effect. Without ties and home it is plain Bradley-Terry. Because every
probability is a softmax of utilities linear in the parameters, the
log-likelihood is concave; Newton-Raphson with step halving from zero
converges in 4 to 8 iterations on the examples, and the observed information
gives the covariance. Strengths are centred to mean zero (covariance
transformed to match). Ratings are `1500 + 400 log10(π)`, so a 400-point gap
is 10 to 1 odds between the two. Rank ranges: 4,000 seeded draws from the
normal approximation, ranked each time. Home test: likelihood ratio against
the model without `α`, one degree of freedom.

**Existence.** The plain model has a finite maximum exactly when the
"who beat whom" digraph is strongly connected (Ford 1957; Hunter 2004),
checked with Tarjan's algorithm. With ties or a home term that is necessary
but not sufficient: one win and one tie between two players, or a home side
that won every game, still has its maximum at infinity. So the fit also
watches for a parameter beyond 12 on the log scale. In either case the tool
says so and refits with a normal prior (standard deviation 1.5 on the log
scale unless `--prior-sd` sets one; on every parameter in the runaway case).

**Deviations from the papers.** Davidson & Beaver put the order effect on
the win probabilities; here the home factor also enters the tie term (as the
geometric mean of the two home-adjusted strengths), which keeps the
log-likelihood concave. Elo (1978) is used only for the display scale.

## Verification

- `eval/make_reference.py` fits 30 cases independently in Python
  (numpy 2.5.3, scipy 1.18.1, statsmodels 0.15.0; versions recorded in
  `eval/reference.json`): statsmodels' binomial GLM on a ±1 design (the
  textbook way to fit Bradley-Terry) for the five models without a tie
  parameter, and scipy's BFGS on Davidson's likelihood written out in π form,
  with a central-difference Hessian, for the rest. Cases: the Premier League
  with ties dropped, with and without home advantage; ties as half wins;
  Davidson with and without home; 24 seeded random tournaments of 3 to 10
  players with and without ties and home advantage; and one result set with
  no finite maximum, fitted with a prior. `engine.test.mjs` reproduces every
  strength to 1e-7 (GLM) or 2e-5 (BFGS), every standard error to 1e-6 or
  0.1%, and the log-likelihoods to 1e-6.
- Hunter's MM algorithm (`fitMM`, a different method) and Newton agree to
  1e-9 on the Premier League decisive games.
- Property tests: at the maximum every player's expected score equals the
  actual score (the likelihood equations); row order, side order and names do
  not change the fit; a count column equals repeated rows; predictions sum to
  one and are symmetric on neutral ground; rank ranges are reproducible from
  the seed.
- Random draws whose optimum is at or near infinity are skipped in the
  reference (an optimiser's stopping point on a ridge is not a reference
  value); `engine.test.mjs` tests the engine's handling of those cases
  directly.
- `page.test.mjs` checks the page's worked-example numbers against the
  engine, the citations against `PAPERS`, the disclaimer, the usage events,
  labels and that nothing is sent over the network.

Run: `node --test engine.test.mjs cli.test.mjs page.test.mjs usage.test.mjs`
(about 2 s). Regenerate the reference with `python3 eval/make_reference.py >
eval/reference.json` (about 3 minutes; the Python likelihood is a plain loop).

## Limits

- One strength per player, constant over the period: no form, injuries,
  transfers or time decay. For changing strength, fit one season or window at
  a time.
- Intervals rest on the normal approximation, which is rough for players
  with only a few games and for strengths near the edge of existence.
- Up to 2,000 players and 200,000 rows in the browser, but the fit is slow at
  the top of that range: 500 players took 3.7 s and 2,000 took 147 s in Node
  ([audit 2026-11-20](../../portfolio/quality/audits/2026-11-20-pairwise-ranking.json)).
- A header row the reader does not recognise (for example "Team A,Team B") is
  read as a game between two players with those names; use the documented
  column names.
- Not betting, financial or professional advice; a competition's own rules
  decide standings.

## Credits

Implemented from the papers' mathematics; no third-party code was ported.
Bradley & Terry (1952, doi:10.2307/2334029); Zermelo (1929,
doi:10.1007/BF01180541); Ford (1957, doi:10.1080/00029890.1957.11989117);
Davidson (1970, doi:10.1080/01621459.1970.10481082); Davidson & Beaver
(1977, doi:10.2307/2529467); Hunter (2004, doi:10.1214/aos/1079120141); Elo
(1978), display scale only. Example data: openfootball (public domain), see
`data/SOURCE.md`. Produced with AI assistance.

## No warranty

Provided free and as-is, without warranty of any kind. Statistics on the
results you enter, not betting, financial or professional advice. Not
affiliated with the authors of the cited papers, any league, club,
federation or rating body. MIT licence.
