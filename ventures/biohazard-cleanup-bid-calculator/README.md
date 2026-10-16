# Biohazard Cleanup Bid Calculator

Biohazard and trauma-scene remediation technicians (unattended death, crime
scene, industrial accident, or hoarding-biohazard cleanup) can use this free
browser-local calculator to price one job — from crew labor and PPE that
scales with decontamination re-entry cycles, through regulated-waste disposal
billed per container instead of per pound — and apply a target margin with a
minimum-job floor. **After using this, you can quote a job from what it
actually costs to staff and dispose of, instead of a flat day rate plus a
per-pound hazmat guess that quietly undercounts both PPE and disposal.**

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/biohazard-cleanup-bid-calculator/

Open `index.html` directly, or serve this directory with
`python3 -m http.server`. The deterministic calculation works with no
account, API key, upload, or paid dependency. See
[`vs-a-flat-rate-per-pound-quote.html`](vs-a-flat-rate-per-pound-quote.html)
for the comparison against a flat day rate and a per-pound hazmat estimate, or
[`how-much-does-biohazard-cleanup-cost.html`](how-much-does-biohazard-cleanup-cost.html)
for why a small scene still costs close to a container's full price.

## Why "day rate plus a per-pound hazmat fee" undercharges

Two costs are easy to underestimate from a scene walk-through, and both are
priced directly here rather than guessed at:

- **PPE cost scales with decontamination cycles, not headcount.** A
  technician who leaves the contaminated area — for a break, to run
  equipment out, or across a shift change — has to doff the PPE they were
  wearing before re-entering. Used PPE cannot be re-donned, so re-entry
  needs a fresh set. A crew of two who each re-enter twice needs four sets,
  not two — and a per-head PPE estimate misses that entirely.
- **Regulated-waste disposal is billed per container, not per pound.** A
  licensed hauler charges a flat rate per container picked up, and a
  container that is 10% full costs exactly what one that is completely full
  costs, up to its rated capacity. The calculator rounds your waste estimate
  up to the next whole container before pricing it — the way the hauler's
  own invoice will — instead of multiplying pounds by a linear per-pound
  rate that undercounts every job whose waste doesn't divide evenly.

A minimum job fee floors the quote for small scopes that would otherwise
price below a sensible minimum on cost-plus-margin arithmetic alone, since a
small job still needs a full truck roll, a hauler pickup, and travel. The
"check a price you're actually quoting" panel recomputes the real profit for
a price you already picked — matching another company's number, say —
against the same direct cost.

## Privacy and usage

Everything runs in your browser. Your crew rates, waste estimates, and
quotes are never uploaded, there is no account, and nothing is saved when you
close the tab — every field resets on refresh by design. We count anonymous
local feature events only (`bid-calculated`, `price-checked`), with a visible
opt-out. Do Not Track and Global Privacy Control disable counting
automatically. No rates or quotes are recorded. The counter is not sent to
the maintainers.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not tax, financial, or business advice,
and it does not replace a qualified professional. **You are responsible for
reviewing and verifying its output before relying on it**, and for meeting
any obligation it helps you prepare for. To the maximum extent permitted by
law, the authors accept no liability for any loss or damage arising from its
use.

This calculator produces arithmetic observations from numbers you supply. It
does not audit your books, determine your regulated-waste hauler's actual
per-container price, verify your state or OSHA bloodborne-pathogen decon
requirements, or replace your own pricing judgment, accountant, or hauler
contract.

MIT licensed. See `LICENSE`.
