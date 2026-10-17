# Dining Room Table Mix Optimizer

A free browser tool for restaurant, café and bar owners: **enter your dining floor, the table types you can buy, and who actually walks in (party sizes and how long each stays), and get the number of 2-tops, 4-tops and 6-tops that seats the most guests.** It reports the extra guests a service with a standard error, the parties no longer turned away, and what that is worth a month. Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/dining-room-table-mix-optimizer/

After using this, you can **stop buying a room of four-tops by habit**: see what each table type is worth in your room, and know when one more table of a type stops helping.

## Model

- A busy service is simulated: parties arrive as a Poisson process at the average rate you give over the window, with sizes drawn from your mix and stays drawn lognormally (CV 0.3) around your average for that size.
- A party takes the smallest free table that holds it; if none does and joining is allowed, the two free tables whose seats add up to the smallest sufficient number. Otherwise it queues and leaves when its patience runs out. When a table frees, the queue is scanned in arrival order and the first party that fits is seated.
- Every candidate mix is scored on the same 60 pre-drawn services (common random numbers). The search starts from today's mix and from an empty room, and takes the best add, remove, swap or one-for-two move that fits the floor and the per-type caps until none helps.
- Today's and the recommended mix are then re-measured on 300 independent services; the gain is the mean of paired differences, shown with its standard error.
- Check: with one party size, one table type and no waiting, the model is an Erlang-B loss system, whose blocking does not depend on the stay distribution. A test compares the simulator with the closed form.

Not modelled: layout and aisles, accessibility, fire-code occupancy, bar and booth seating, reservations versus walk-ins, check size varying by party size, table and chair cost, day-of-week swings.

## Run

Open `index.html` through any static server. Tests: `node --test`.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or
implied. It is not legal, tax, accounting, compliance, investment or financial advice and does not replace a qualified professional.
**You are responsible for reviewing and verifying its output before relying on it.** To the maximum extent
permitted by law, the authors accept no liability for any loss or damage arising from its use.

**Privacy.** Nothing is uploaded. Anonymous feature counts (`analysis_run`, `example_loaded`,
`report_downloaded`) are kept only in local storage, can be switched off on the page, and honour Do Not
Track.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or
taken offline without notice. Do not use this as a system of record.

Free and open source (MIT, see `LICENSE`). Optional support:
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood).
