# Medical Courier Route Margin Calculator

Medical couriers can price a scheduled, STAT, or dedicated route with the costs a per-mile calculator misses: stops, paid wait, deadhead, loaded labor, vehicle cost, temperature-control consumables, overhead, and contribution margin per vehicle-hour. It then answers the other half of the offer -- what the route has to pay to break even, and what to quote per stop for a target margin.

After using this, you can now see contribution margin per vehicle-hour including paid wait and deadhead, and the per-stop rate to counter with, **which used to take** a spreadsheet that hid waiting and handling time.

## What it answers beyond "is this route profitable?"

- **Deadhead.** The unpaid run from home to the first stop and back from the last burns the same fuel and occupies the same hours. It is entered separately from route miles on purpose: billable miles are a rate conversation, deadhead is a routing one, and a route whose deadhead is the problem is fixed by a different stop order rather than a higher price. On the shipped example, 40 deadhead miles and 70 minutes turn a $151.80 margin into $90.33.
- **The rate to quote.** Overhead here is a percentage of revenue, so raising the price raises the overhead that price must carry and break-even is a fixed point rather than a sum of costs. The shipped route costs $118.20 in labor, vehicle, and consumables but needs $131.33 -- $21.89 a stop -- to reach zero, and $28.14 a stop to clear 20%.
- **How far fuel can move.** The break-even vehicle cost per mile, holding the price fixed. The shipped route survives to $5.06 a mile against $0.72 entered. It reads $0.00 when the route loses money even if driving were free, which is a pricing problem rather than a fuel one.

Every one of these fields defaults to the neutral value, so the worked example in [`is-this-medical-courier-route-worth-it.html`](is-this-medical-courier-route-worth-it.html) is unchanged. Enter only route economics. Never enter patient names, specimen details, medical records, or chain-of-custody data.

## Use it

Open `index.html` in a browser, or serve this directory with `python3 -m http.server`. The default example is a six-stop clinic loop. Change the revenue to the broker or facility offer and the red loss result shows when the route does not cover its own cost.

**Copy share link** puts every route field, including route type, in the URL after a `#`, which a browser never sends to a server. Send that link to a dispatcher, accountant, or another courier and it reopens with the same figures already calculated, instead of them retyping thirteen numbers off a screenshot.

## Opportunity assessment

The target user is an independent medical courier or small fleet owner pricing clinic, lab, pharmacy, and STAT work. Existing route planners optimize dispatch and tracking; generic delivery calculators focus on miles. This wedge answers the earlier decision: whether a recurring route pays for all paid time and vehicle cost. Search phrases include `medical courier per stop pricing`, `courier route profitability`, and `medical courier wait time pricing`. The product is static, free, and browser-local, so it has no hosting or per-user inference cost. A later paid version could add user-supplied AI contract summarization or an export workflow, but the deterministic calculator is complete without a key.

This is distinct from the portfolio's restaurant delivery margin tool: it models medical-courier stop density, wait grace, temperature consumables, and route-hour contribution, without handling healthcare data. It is also not a routing, tracking, or compliance product.

## Privacy and safety

Everything runs in your browser. Your data is never uploaded, and we don't have accounts, tracking cookies, or an analytics vendor. We count anonymous local events (`route_calculated`, `summary_copied`, `share_link_copied`, `shared_link_opened`) only; the counter is off when Do Not Track or Global Privacy Control is enabled and can be cleared from browser storage.

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or implied. It is not financial or medical advice, and it does not replace a qualified professional. **You are responsible for reviewing and verifying its output before relying on it**, and for meeting any obligation it helps you prepare for. To the maximum extent permitted by law, the authors accept no liability for any loss or damage arising from its use.

The calculator is an estimate, not a compliance determination, healthcare instruction, income guarantee, or contract interpretation. Do not enter protected health information. Verify rates, fuel, wait, temperature-control costs, insurance, taxes, and contract terms yourself.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or taken offline without notice. We do not promise uptime, backups of anything you type, or that a URL will keep working. Do not use this as a system of record.

Optional support: [GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood). Refusing to sponsor does not change the calculator.

License: MIT.
