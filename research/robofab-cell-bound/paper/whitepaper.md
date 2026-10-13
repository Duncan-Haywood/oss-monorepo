# A utilisation bound against a discrete-event twin for a robot-arm, 3D-printer and inspection cell

*Produced with AI assistance (Claude). Stylised, simulation-only; no physical cell was built or measured.*

## Question
For a cell in which one arm loads and unloads P printers and parts are inspected (failed parts are reprinted), how well does a utilisation bound predict the throughput of a stochastic simulation, and which upgrade pays off?

## Setup
See `README.md` (Method). Two job types, closed loop of fixed work in progress, 20 seeds per row, lognormal noise with coefficient of variation 0.3 or none.

## Findings (all in `experiments/results.txt`)
1. The bound is attained to within 1% at 1 to 4 printers and within 2% from 16 printers on, and is 10 to 11% optimistic at 10 and 12 printers, where the printers and the arm are both close to saturation.
2. Only upgrading the resource the bound names raises throughput; after the arm is 25% faster the bound passes the bottleneck back to the printers.
3. WIP beyond one job per printer plus one lengthens flow time (Little 1961) without raising throughput.
4. Dispatch rules for the arm made no measurable gain in this setup; the comparison is weak by construction (see Limitations in the README).

## Limitations and status
Stylised parameters of my choosing; no measured data. The model omits travel, breakdowns and changeovers. See the README.

## References
Little, J. D. C. (1961), *Operations Research* 9(3):383–387 (`refs.bib`; not re-checked in this run).
