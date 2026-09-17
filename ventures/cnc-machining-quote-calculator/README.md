# CNC Machining Quote Calculator

**You are looking at an RFQ for 25 pieces and you are not sure whether $42 a
part makes money.** This works out what the part actually costs you — from your
own stock, cycle time, setup and programming hours, tooling life, inspection
time and outside-process rates — and then costs the same part at every lot size
from a one-off to 500, so you can see whether the price is wrong or the quantity
is.

Open [`index.html`](index.html) in a browser. There is nothing to install, no
account, no key, and no build step. Everything runs on your machine.

**Live:** <https://duncan-haywood.github.io/monorepo-projects/cnc-machining-quote-calculator/>

## What it tells you

- **Cost per part**, built up from every line: material, run labour, machine
  time, perishable tooling, in-process inspection, outside processes, setup,
  the machine tied up during setup, this lot's share of programming, and
  first-article inspection.
- **Break-even price** per part, and separately the break-even if you keep
  billing setup as its own line.
- **Price at your target margin.**
- **Margin at the price you were about to quote**, including a separate setup
  fee if you charge one.
- **The same part at 1, 5, 10, 25, 50, 100, 250 and 500 pieces** — each tier
  recomputed from scratch, so the material steps and the amortised setup are
  real rather than interpolated.
- **Findings worth reading before the quote goes out**: a price under cost, a
  margin under target, a flat-cost block that dominates a short run, material
  you have already paid for, a binding outside-process minimum, and a scrap
  allowance that rounds worse than it reads.

## The four things it models that a flat price hides

**1. Setup, programming and first article are per lot.** They cost the same at 5
pieces as at 500, which is the entire reason a short run is expensive per part.
Programming is spread over the parts you expect off the program rather than only
this lot, because a reorder owes no new CAM time. On the worked example that
block is $11.64 a part at 25 pieces and $0.58 at 500.

**2. Material is bought in whole stock units, so cost per part is a step and not
a rate.** A 12 ft bar that yields 53 parts costs the same whether you cut 31 or
53 out of it. Yield comes from the bar length less your chuck grip and unusable
end, divided by the part length plus the parting cut — or, for plate, a plain
rectangular nest tried both ways round. When the stock you have to buy holds
more parts than you are starting, the tool says so, because that material is
already paid for and running those parts costs only machine time and tooling.

**3. Scrap is an integer.** To ship 10 good parts at a 3% fallout you start 11,
which is a 10% hit on material, machine time and outside-process cost — not 3%.
The common shortcut of multiplying the quantity by one plus the scrap rate also
understates it at any quantity: at a 10% fallout, 100 good parts need 112
starts, not 110. This uses the yield form and rounds up to a whole part.

**4. An outside-process lot minimum behaves like a second setup.** Anodising at
$2.10 a part with a $75 lot minimum is $15.00 a part on a 5-piece run and $2.10
at 100. The minimum, not the rate, is what prices the short run, and it is
charged on the parts you send out rather than the parts you ship — a plater does
not refund the ones you scrap afterwards.

## It shares your shop rates with the other tools here

The machinist wage, payroll burden, overhead on direct cost and target net
margin are the four numbers every costing tool on this site asks for, and they
are facts about your business rather than about the job. Save them once and every
calculator here that asks for them opens with your numbers. The
[shop rate calculator](../shop-rate-calculator/) is the tool that derives a
burdened hourly rate from your payroll and overhead in the first place.

Nesting blanks out of sheet goods is a different question, and
[cut list optimizer](../cut-list-optimizer/) does the real layout that the
plate-yield figure here only estimates.

## Reading

- [Should a CNC shop charge setup separately or build it into the part price?](setup-fee-or-in-the-part-price.html)

## Tests

```
node --test
```

74 assertions across the costing module, the usage counter and the page's own
markup contracts. The costing tests pin each of the four effects above
independently, including that the breakdown on screen adds up exactly at every
quantity — composing the totals from unrounded values is marginally more
accurate and leaves the column off by a cent, which is the more expensive kind
of wrong for an audience that checks arithmetic for a living.

## Privacy

Everything runs in your browser. Your shop rates, your material prices and your
customer's part dimensions are never uploaded, and we don't have accounts,
tracking cookies, or an analytics vendor. Saving your numbers writes them to your
own browser's local storage on this device only, and *Forget my numbers* deletes
them.

We count anonymous events (`quote`, `example_loaded`, `inputs_saved` — which
features get used, nothing about who used them) in that same local storage, and
they are never transmitted. There is a button in the footer to switch counting
off, and Do Not Track or Global Privacy Control switches it off with no action
from you at all.

That matters more here than on most tools of this kind: a customer's part
dimensions are frequently somebody else's confidential drawing, and your cost
structure is exactly what you cannot afford a competitor to see. Neither leaves
the device.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any
kind, express or implied. It is not tax, financial, engineering, or business
advice, and it does not replace a qualified professional. **You are responsible
for reviewing and verifying its output before relying on it**, and for meeting
any obligation it helps you prepare for. To the maximum extent permitted by law,
the authors accept no liability for any loss or damage arising from its use.

This calculator produces arithmetic observations from numbers you supply. It does
not determine what your work is worth in your market, does not read your supplier
invoices, does not verify that a cycle time or a tool life is achievable on your
machine, and does not assess whether any tolerance, material certification,
inspection standard, export control, or wage rule applies to the job. Nothing
here is an opinion on whether a part can be made to its drawing.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be
slow, broken, moved, or taken offline without notice. We do not promise uptime,
backups of anything you type, or that a URL will keep working. Do not use this as
a system of record. If a tool needs to survive, export your inputs and run it
yourself.

## Licence

[MIT](LICENSE). If it helped you price the next job,
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) is entirely
optional and never changes what the tool does.
