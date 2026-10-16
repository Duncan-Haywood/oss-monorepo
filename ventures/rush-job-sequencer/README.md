# Rush job sequencer

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/rush-job-sequencer/>

After using this, you can now see which order to do a queue of rush jobs in so that the total cost of lateness is as small
as it can be, with every possible order checked exactly, which used to take a gut call about who shouts loudest.

Free, runs in the browser, nothing is uploaded. Open `index.html`.

- Up to 14 jobs, each with hours of work, a due time, a flat cost if late and a cost per hour late.
- The cheapest order, found by dynamic programming over every subset of jobs (exact, not a heuristic).
- The exact order against the usual rules: as received, earliest due date, shortest job, biggest penalty per hour of work.
- What one more hour and four more hours of capacity (overtime or help) would save.
- The single job whose removal (outsourcing, declining) saves the rest of the queue the most.
- Whether the order holds if every estimate is 20% off.
- CSV download.

```
node --test
```

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or implied. It is not legal, tax,
accounting, compliance, or financial advice. **You are responsible for reviewing and verifying its output before relying on
it.** To the maximum extent permitted by law, the authors accept no liability for any loss or damage arising from its use.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or taken offline without
notice. Do not use this as a system of record.

MIT licence. Optional support: https://github.com/sponsors/Duncan-Haywood
