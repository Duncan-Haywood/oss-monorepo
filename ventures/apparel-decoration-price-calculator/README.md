# Screen Printing and Embroidery Price Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/apparel-decoration-price-calculator/>

Custom apparel shops — screen printers, embroiderers and DTF printers — can use
this free, browser-local calculator to find what a decorated piece actually
costs them, and what the same job costs at every standard quantity tier.
**After using this, you can quote a 24-piece job and a 288-piece job from the
same cost model and know why the numbers differ, which used to mean applying
one price list to both and finding out later.**

Open `index.html` directly, or serve this directory with
`python3 -m http.server`. The calculation is deterministic and works with no
account, API key, upload, or paid dependency.

## Why a per-piece price is harder than it looks

A flat "$12 a shirt" hides three things that decide whether the job makes
money, and all three are modelled here:

- **Setup is per *job*, not per piece.** Burning, registering and reclaiming a
  screen costs the same whether you print a dozen or a gross, and a three-colour
  front plus a one-colour back is four screens either way. On the worked example
  — 24 pieces, three colours at each of two placements — setup is **$4.99 a
  shirt**. The identical job at 288 pieces carries **$0.42**. Quoting both off
  one price list is the most common way a short run loses money.
- **Blanks are bought in whole pieces, and spoilage is bought with them.** A
  shop that orders exactly the order quantity has no misprint allowance, so one
  ruined garment on a 24-piece run means re-ordering a single blank and setting
  up again — which costs many times the shirt. The calculator rounds the blank
  purchase up and says so when the allowance is zero.
- **Machine time does not scale the way head-count intuition suggests.** A
  9,000-stitch design at 750 spm is a 12-minute cycle; on a six-head machine
  that cycle produces six pieces, so the machine minutes per piece are 2, not
  12. Hooping is per piece per placement and is divided by nothing, which is
  usually what actually caps a shop's daily output.

The tool reports the job cost broken into setup, blanks, run labour and
consumables, and an overhead share; the cost and break-even price per piece;
the margin at what you quoted; and a **quantity-break table** costing the same
job at 12, 24, 48, 72, 144 and 288 pieces plus whatever you are actually
quoting. Findings call out a price below cost, setup riding on the per-piece
price rather than billed as a line, a run short enough that setup dominates it,
a zero spoilage allowance, a second placement doubling the screen count, and
digitising absorbed with nothing billed against it.

## The three methods

| | one-off setup | per-piece run cost |
|---|---|---|
| **Screen printing** | one screen per colour **per placement**, plus art time | press throughput for the placement, plus ink per colour |
| **Embroidery** | digitising per placement, plus art time | stitch cycle ÷ machine heads, **plus hooping per piece**, plus thread and backing |
| **DTF / heat transfer** | art time only — nothing to burn or digitise | film and ink by printed area, plus heat-press seconds |

Every method shares blanks, spoilage, finishing time, loaded wage and the
overhead share, so switching method re-costs the same job rather than starting
a different one. Your numbers for all three are kept when you switch and when
you save a draft.

## What it does not do

It does not know your blank supplier's price, your press's real throughput,
your local wage rules, or what a customer in your town will pay. Every rate is
a number you read off your own invoices, payroll and equipment. The output is
the cost floor underneath your pricing decision, not a recommended price and
not a market study. It says nothing about whether you hold the rights to
reproduce any artwork you are asked to print — it never sees the artwork.

## Privacy and usage

Everything runs in your browser. Your blank costs, wages, press speeds and
prices are never uploaded, and there are no accounts, cookies, or analytics
vendors. Pressing *Save my numbers on this device* writes them to this
browser's own local storage on this device only; *Forget my numbers* deletes
them. We count anonymous local feature events only (`estimate`,
`example_loaded`, `inputs_saved`), with a visible opt-out that persists across
visits. Do Not Track and Global Privacy Control disable counting automatically.
No people, rates, or customer details are recorded, and the counter is never
transmitted to the maintainers.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any
kind, express or implied. It is not tax, financial, or business advice, and it
does not replace a qualified professional. **You are responsible for reviewing
and verifying its output before relying on it**, and for meeting any obligation
it helps you prepare for. To the maximum extent permitted by law, the authors
accept no liability for any loss or damage arising from its use.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be
slow, broken, moved, or taken offline without notice. We do not promise uptime,
backups of anything you type, or that a URL will keep working. Do not use this
as a system of record. If a tool needs to survive, export your inputs and run it
yourself.

This calculator produces arithmetic observations from numbers you supply. It
does not determine what your work is worth in your market, does not read your
supplier invoices, and does not assess whether any wage, employment, or
licensing rule applies to your shop.

MIT licensed. See `LICENSE`. If it helped, [GitHub
Sponsors](https://github.com/sponsors/Duncan-Haywood) is optional and never
changes what the tool does.

## Tests

```
node --test ventures/apparel-decoration-price-calculator/*.test.mjs
```

`calculator.test.mjs` covers the cost arithmetic for all three methods, the
quantity-break curve, and every finding; `page.test.mjs` covers the
disclaimers, the privacy copy, the SEO markup, the labelled inputs and method
selector, the sibling link, the phone-width table scrollers, and that the
page's shipped defaults and its example button agree with each other under
every method; `usage.test.mjs` covers the local counter, its opt-out, and the
Do Not Track / Global Privacy Control signals.
