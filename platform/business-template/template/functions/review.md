# Review: is the business working, and are the runs working?

Routed every `review_every` runs (in `ops/routing.json`). It steers the
business and improves these instructions from what the run records measured.

## Steps

1. **Read every run record since the last review** (`ops/runs/`): outcomes,
   blockers, owner asks, friction.
2. **Read the numbers** in `metrics/metrics.csv` and the latest finance
   close. Write `ops/reviews/YYYY-MM-DD.md`: what shipped, what moved, what
   did not, what is stuck on the owner and for how long. Measured numbers
   only; "not measured" where there is no reading, and a fix for that.
3. **Steer.** Adjust the current stage's weights in `ops/routing.json` toward
   what the numbers say is the bottleneck (no visitors: marketing; visitors
   but no sign-ups: product and sales; customers but no books: finance).
   Move the stage on (`build` → `launch` once the offer works end to end at
   a public URL; `launch` → `grow` once someone has paid or the agreed
   signal in `BUSINESS.md` "Plan" is met). Say why in the review file.
4. **Fix the instructions.** For each friction item, fix the file it names:
   a function brief, `prompt.md`, `CLAUDE.md`, a script. Never
   `GUARDRAILS.md`: propose changes to the owner in `OWNER.md` instead.
5. **Clean `OWNER.md`:** merge duplicates, drop items the owner has done, put
   the most valuable item first, and estimate the minutes each takes.

Land it like any other run, as `review: <date>`.
