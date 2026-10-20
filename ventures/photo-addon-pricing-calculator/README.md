# Photo Package Add-On Pricing Calculator

Independent wedding and event photographers can use this free browser-local calculator to find real net profit for one package add-on — an extra hour of coverage, a second shooter, an album/print upgrade, an engagement session — after the photographer's own shoot/cull/edit time (valued at their target hourly rate) and gear depreciation/wear are netted out, then compare two or three add-on options by what they actually pay per hour, not just their headline price. **After using this, you can tell which of two add-ons priced differently is actually worth offering, which used to mean a guess about how much culling and editing time a "quick" add-on quietly generated.**

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/photo-addon-pricing-calculator/

Open `index.html` directly, or serve this directory with `python3 -m http.server`. The deterministic calculation works with no account, API key, upload, or paid dependency.

## Why a flat add-on price is the wrong number to judge it by

A $300 "extra hour" or a $450 "second shooter" can still pay less than the photographer's own target rate once the real costs come out — costs that never appear on an invoice the way a subcontractor payment does:

- **Culling and editing are not free, and they are usually the biggest cost.** An extra hour of shooting routinely generates one to two hours of culling and editing on top of it — time a round headline price rarely counts.
- **A second shooter's fee is easy to check against the price charged; the primary photographer's extra editing hours from that second shooter's take are not**, because nothing invoices for them the way a subcontractor payment does.
- **Gear depreciation and wear run on every add-on that uses a body, lens, or flash, whether or not the client ever sees a line item for it.**
- **An add-on priced by comparing to what other studios charge can still lose money on this studio's own cost structure** — the two numbers only agree by coincidence.

The comparison table then answers the question one add-on's profit can't: given two or three real add-on options, which one actually pays the best effective hourly rate for the photographer's own time?

## Privacy and usage

Everything runs in your browser. Your add-on figures are saved locally on this device so you don't retype them; your add-on comparison rows are never uploaded and are cleared on refresh by design. We count anonymous local feature events only (`addon-priced`, `addons-compared`), with a visible opt-out. Do Not Track and Global Privacy Control disable counting automatically. No add-on names, prices, or figures are recorded. The counter is not sent to the maintainers.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or implied. It is not legal or business advice, and it does not replace a qualified professional. **You are responsible for reviewing and verifying its output before relying on it**, and for meeting any obligation it helps you prepare for. To the maximum extent permitted by law, the authors accept no liability for any loss or damage arising from its use.

This calculator produces arithmetic observations from numbers you supply. It does not do tax planning, business-entity formation, or contract review — verify all of that independently. It does not audit your books or replace your own liability or gear insurance, your signed client contract, or your accountant.

MIT licensed. See `LICENSE`.
