# Equipment lease buyout calculator

A free, browser-only tool that compares buying out an equipment lease against
returning the equipment and replacing it.

**Live:** <https://duncan-haywood.github.io/monorepo-projects/equipment-lease-buyout-calculator/>

## The problem

A lease-end payoff letter states one number: the buyout price. On its own it
answers nothing, because a price only means something next to what it buys. A
$9,000 buyout is a bad deal on a forklift worth $6,000 with a year of useful
life left, and a good deal on equipment that would cost $30,000 to replace and
run for another five years — even though $9,000 sounds identical either way.

The two figures that make a buyout price comparable are not on the payoff
letter: the equipment's remaining useful life, and what a replacement actually
costs, all in.

## What it does

Enter the buyout price, the equipment's estimated fair market value, how many
months of use you expect if you keep it, and the all-in cost of a replacement
(purchase or new lease, plus removal and expected downtime) if you return it.
It reports:

- the cost per month of use on each path, so they are comparable on a common
  footing rather than as two unrelated dollar figures;
- the **break-even buyout price** — the number at which the two paths cost the
  same, which is what is worth negotiating against, not the payoff letter's
  figure;
- how the quoted buyout compares to the fair market value you entered, signed
  so a buyout priced above FMV is easy to spot;
- observations tied to this comparison's own shape — an unentered removal cost
  treated as a likely gap rather than a true zero, and a downtime cost that
  inflates the replacement side.

### Why fair market value and useful life are inputs, not lookups

This tool has no way to inspect a specific machine's condition or check a
market for comparable listings. Both figures are the lessee's own estimate,
and the page says so rather than implying a precision the inputs do not carry.
A rough guess in either number produces a rough verdict — which is still more
useful than comparing two dollar figures that were never on the same footing
to begin with.

See [this calculator vs. Crest Capital's lease calculator](vs-crest-capital.html)
for which job fits a new-lease payment estimate versus checking an existing
lease's buyout offer against returning and replacing the equipment.

## Running it

Open `index.html` in a browser. No build, no dependencies, no server.

```
node --test          # calc.mjs, usage.mjs, and index.html structure
```

## Privacy

Everything runs in your browser. Your data is never uploaded — there is no
network request in the page at all, no accounts, no cookies, and no analytics
vendor. A saved comparison stores only the numbers you typed, in this
browser's `localStorage`, and reset deletes it. Anonymous feature events
(which features get used, nothing about who used them) are counted locally
and can be turned off from the footer; Do Not Track and Global Privacy
Control disable them automatically.

Lease terms and replacement costs are commercially sensitive, which is
exactly why none of it leaves the page.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any
kind, express or implied. It is not financial, accounting, or legal advice,
and it does not replace a qualified professional. **You are responsible for
reviewing and verifying its output before relying on it**, and for meeting
any obligation it helps you prepare for. To the maximum extent permitted by
law, the authors accept no liability for any loss or damage arising from its
use.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may
be slow, broken, moved, or taken offline without notice. We do not promise
uptime, backups of anything you type, or that a URL will keep working. Do not
use this as a system of record. If a tool needs to survive, export your
inputs and run it yourself.

## Licence

MIT — see [LICENSE](LICENSE). Support is optional and never changes what the
tool does: <https://github.com/sponsors/Duncan-Haywood>.
