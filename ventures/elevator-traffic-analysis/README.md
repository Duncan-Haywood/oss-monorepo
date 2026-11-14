# Elevator traffic analysis: up-peak round trip time, designs and simulated waits

**Live:** https://marisstella.app/elevator-traffic-analysis/ · [How it works](https://marisstella.app/elevator-traffic-analysis/how-it-works.html)

How many lifts does this building need, how big and how fast? Type the floors
above the lobby, how many people go to each, and the lifts you have in mind.
The tool works out the up-peak round trip time, the interval between cars
leaving the lobby and the five-minute handling capacity; searches every
combination of 1 to 8 lifts, common rated loads and speeds for the smallest
designs that meet your targets; and simulates an hour of random arrivals to
show waiting times, which the round trip time method cannot. Everything runs
in the browser.

Who it is for: architects and building services engineers at feasibility
stage, developers checking a proposal, and students learning the method.
Commercial traffic analysis packages exist and a lift consultant uses them for
a real design; this is a free first check.

## Method

The up-peak round trip time formulae of Barney and dos Santos (*Elevator
Traffic Analysis Design and Control*, 2nd edn, 1985) with the improvements in
R. D. Peters, "Improvements to the Up Peak Round Trip Time Calculation",
*International Journal of Elevator Engineers* 3(1), 2000
([PDF](https://download.peters-research.com/library/Improvements_to_the_Up_Peak_Round_Trip_Time_Calculation.pdf)):

- passengers per trip from rated persons (rated load / 75 kg, rounded down,
  as EN 81-20 counts them) and a capacity factor;
- probable stops S and highest reversal floor H for unequal floor populations
  (eqs 3, 4);
- jerk-limited flight times in all three regimes (eqs 13 to 15), with the peak
  acceleration capped at sqrt(vj) for slow lifts (v < a^2/j), unequal floor
  heights (eq 17), the stop-time correction for lifts that do not reach rated
  speed between stops (eq 18) and an express zone (eq 20);
- interval, handling capacity and % population (eqs 10 to 12).

Our own implementation of the published formulae; not affiliated with or
endorsed by the authors.

`sim.mjs` adds two checks of our own:

- `tripSample`: 20,000 trips under the formula's own assumptions, each stop
  flown at its real distance. Over 27 test buildings the formula is within
  -0.83% to +1.39% of the sampled mean (`bench/grid.md`).
- `simulate` / `demandSweep`: Poisson arrivals at the lobby and a plain
  dispatcher (cars fill in turn, leave when full or after a dwell). At 80% of
  the formula's handling capacity the median mean wait was 0.50-0.51 of the
  interval; at 100% it was 0.92-1.03, for dwell times of 4 to 15 s
  (`bench/grid.md`). Indicative only: real group controllers differ.

## Use

- Browser: open `index.html` from any static server.
- CLI: `node cli.mjs --example --search --simulate`, or
  `node cli.mjs building.json --interval 30 --pct 12 [--json]` with the JSON
  the page exports (`node cli.mjs --print-example` shows the format).
- Tests: `node --test engine.test.mjs page.test.mjs` (flight times against a
  numerically integrated profile, the classic equal-floor forms, Monte Carlo
  checks of S, H and RTT, design search, simulation, page wiring, and that
  `bench/grid.md` regenerates byte for byte).
- Bench: `node bench/grid.mjs > bench/grid.md`.

## Limits

Up-peak only: no lunch, down-peak or inter-floor traffic, no multiple
entrances, double-deck cars or destination dispatch, and nothing about car
or shaft sizes, accessibility, fire-fighting lifts or code compliance.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not engineering advice, and it does not
replace a qualified professional. **You are responsible for reviewing and
verifying its output before relying on it**, and for meeting any obligation
it helps you prepare for. To the maximum extent permitted by law, the authors
accept no liability for any loss or damage arising from its use.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may
be slow, broken, moved, or taken offline without notice. We do not promise
uptime, backups of anything you type, or that a URL will keep working. Do not
use this as a system of record. If a tool needs to survive, export your
inputs and run it yourself.

## Privacy and usage counting

Everything runs in your browser; nothing is uploaded and there are no
accounts, cookies or analytics vendor. `usage.mjs` keeps anonymous counts in
this browser's local storage (`analysis_run`, `design_search`,
`simulation_run` and the day), never a floor or a population. The footer
checkbox turns it off and deletes the counts; Do Not Track and Global Privacy
Control are honoured.

## License

MIT, see [LICENSE](LICENSE). Built with AI assistance.
