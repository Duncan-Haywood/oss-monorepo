# Where does a small printing cell lose time? A discrete-event twin of an arm, printers and an inspection station

*Produced with AI assistance (Claude). Stylised, simulation-only; all parameters are illustrative, not measured.*

**Question.** In a cell where one arm loads and unloads several 3D printers and one station inspects parts, which resource limits throughput, and does the resource with the highest utilisation tell us which upgrade to buy?

**Model.** See `README.md`. Four stages per part (load, print, unload, inspect), a printer held from the start of loading to the end of unloading, lognormal print times (mean 45 min, CV 0.5), an 8% inspection reject rate that sends the part back to LOAD. 30 parts, 200 replications, common random numbers.

**Findings (from `experiments/results.txt`).**
1. With one arm and one inspection station the printers have the highest utilisation at every size from 1 to 8 printers (0.71 at 8), and makespan falls from 1609 to 285 min. Yet at 6 printers, one extra arm cuts the makespan by 10.9 min (95% half-width 0.7) and one extra inspection station by only 2.3 min, while halving load and unload time saves 21.1 min. The arm is under 40% utilised but its queueing delay keeps printers idle-but-held; utilisation alone ranks the upgrades wrongly.
2. Dispatching: ordering jobs by shortest print time first lowers mean flow time (by 58 min at 3 printers) and raises makespan by about 14 min; longest-first gives the reverse, in line with the textbook behaviour of these rules (Graham 1969; Pinedo 2016). Letting the arm load before it unloads helped the makespan by about 2 min (fifo order) and by about 14 min with longest-first; these are paired differences on identical batches.
3. A deterministic twin (mean print time, no rejects) underestimates the stochastic makespan by 1 to 133 min. The gap is largest with one printer and shrinks, non-monotonically, as printers are added, and the twin is below the realised makespan in 41 to 78% of replications.

**Limits.** One product, no travel time or arm motion planning, no failures except rejects, no setup or material changes, a single batch from empty. The numbers describe the model, not any physical cell; measuring a real cell's times is an owner step.

**References.** Graham (1969), `refs.bib`; Pinedo (2016), `refs.bib`. Bibliographic data checked by web search on 2026-10-13; the paper text was not read.
