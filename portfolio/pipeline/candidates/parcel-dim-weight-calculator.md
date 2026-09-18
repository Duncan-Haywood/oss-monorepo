# Candidate: Parcel dimensional weight (DIM) calculator

**One line.** A private browser calculator for online sellers, makers and
anyone shipping parcels that turns a carton's dimensions, actual weight and DIM
divisor into the billable weight a carrier will charge — plus the box size at
which the dimensional penalty stops.

**Verdict: build now; graduated 2026-09-18 as a venture.** The first vertical
slice is `ventures/parcel-dim-weight-calculator/`. It is the parcel counterpart
to `ltl-freight-class-estimator`: the same shipper asking the same question one
tier down, answered with a DIM divisor instead of a density band.

## Evaluation

| Dimension | Assessment |
|---|---|
| Target user and pain | Online sellers, makers, and small shippers who choose a carton once and then live with it for every unit of that SKU. Carriers bill the greater of actual and dimensional weight, so a slightly oversized box adds pounds to every shipment — and most sellers first meet the rule on an invoice. |
| Value and return use | The tool names the pounds of air being paid for and the break-even cube that ends the penalty. It is used again on every new SKU, every packaging revision, and whenever a rate agreement is renegotiated. |
| Alternatives and differentiation | Carrier calculators need an account and quote one box at a time without saying what to change; blog calculators return a dimensional-weight figure and stop. The wedge is the lever: the cube ceiling, the achievable packed height, and an explicit "no height reaches this, use a smaller box" when the footprint alone is the problem. Girth and surcharge banding are included; dollar amounts deliberately are not. |
| Acquisition | High, durable search intent — `dimensional weight calculator`, `DIM weight`, `DIM divisor 139`, `why is my shipping weight higher than the package weight`. A static page plus a directly answerable explainer supports search and AI discovery. Cross-links with the LTL estimator both ways. |
| Future revenue | Free calculator first. Later possibilities: saved carton libraries, a rate-card import, or a bulk SKU pass. No payments and no paid APIs now. |
| Build and costs | One deterministic browser page, zero dependencies, zero hosting/API/inference cost per user. Nothing to serve but a static file. |
| Automation | Static hosting and client-side arithmetic are fully agent-operable: no account, no server state, no human workflow. |
| Risks and safeguards | The divisor, the rounding rule, surcharge thresholds and minimum billable weights are carrier *contract* terms that differ by account and change over time. The tool therefore takes the divisor and the thresholds as inputs rather than asserting them, quotes no dollar amounts, and labels every output a planning estimate to verify against the user's own agreement. No shipment data leaves the browser. |
| Portfolio fit | New problem. `ltl-freight-class-estimator` handles pallets on density bands, `freight-accessorial-auditor` reviews invoices after the fact, and the marketplace fee calculators price the sale rather than the shipment. None computes parcel billable weight. |

## Overlap check

`duplicate_check.py` scored the nearest *other* venture,
`freight-accessorial-auditor`, at **0.13** against the final description — well
under the 0.45 flag bar. (The 0.80 row is this venture's own directory, already
on disk when the check ran.) The three nearest by subject were read rather than
dismissed on score:

- `ltl-freight-class-estimator` answers the same shape of question for freight
  that moves on a pallet, where the mechanism is a density band and the levers
  are pallet height and consolidated load. A parcel is priced by a contract
  divisor instead, and the surcharge tripwires are dimensional rather than
  class-based. The two pages link each other precisely so a shipper crossing
  that line learns the rule changed.
- `freight-accessorial-auditor` reviews charges on an invoice that already
  exists; this decides the carton before one does.
- `import-landed-cost-calculator` totals duty, freight and broker fees on a
  customs entry, which is a different cost stack entirely.

## Evidence status

A hypothesis, not demand validation. The initial evidence is durable search
intent and a deterministic workflow that produces an action rather than a
number. Kill criteria: fewer than three sellers using it twice within 90 days,
or reports that the break-even cube does not change which carton they buy.
