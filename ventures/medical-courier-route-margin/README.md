# Medical Courier Route Margin Calculator

Medical couriers can price a scheduled, STAT, or dedicated route with the costs a per-mile calculator misses: stops, paid wait, loaded labor, vehicle cost, temperature-control consumables, overhead, and contribution margin per vehicle-hour.

After using this, you can now see contribution margin per vehicle-hour including paid wait, **which used to take** a spreadsheet that hid waiting and handling time. Enter only route economics. Never enter patient names, specimen details, medical records, or chain-of-custody data.

## Use it

Open `index.html` in a browser, or serve this directory with `python3 -m http.server`. The default example is a six-stop clinic loop. Change the revenue to the broker or facility offer and the red loss result shows when the route does not cover its own cost.

## Opportunity assessment

The target user is an independent medical courier or small fleet owner pricing clinic, lab, pharmacy, and STAT work. Existing route planners optimize dispatch and tracking; generic delivery calculators focus on miles. This wedge answers the earlier decision: whether a recurring route pays for all paid time and vehicle cost. Search phrases include `medical courier per stop pricing`, `courier route profitability`, and `medical courier wait time pricing`. The product is static, free, and browser-local, so it has no hosting or per-user inference cost. A later paid version could add user-supplied AI contract summarization or an export workflow, but the deterministic calculator is complete without a key.

This is distinct from the portfolio's restaurant delivery margin tool: it models medical-courier stop density, wait grace, temperature consumables, and route-hour contribution, without handling healthcare data. It is also not a routing, tracking, or compliance product.

## Privacy and safety

Everything runs in your browser. Your data is never uploaded, and we don't have accounts, tracking cookies, or an analytics vendor. We count anonymous local events (`route_calculated`, `summary_copied`) only; the counter is off when Do Not Track or Global Privacy Control is enabled and can be cleared from browser storage.

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or implied. It is not financial or medical advice, and it does not replace a qualified professional. **You are responsible for reviewing and verifying its output before relying on it**, and for meeting any obligation it helps you prepare for. To the maximum extent permitted by law, the authors accept no liability for any loss or damage arising from its use.

The calculator is an estimate, not a compliance determination, healthcare instruction, income guarantee, or contract interpretation. Do not enter protected health information. Verify rates, fuel, wait, temperature-control costs, insurance, taxes, and contract terms yourself.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or taken offline without notice. We do not promise uptime, backups of anything you type, or that a URL will keep working. Do not use this as a system of record.

Optional support: [GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood). Refusing to sponsor does not change the calculator.

License: MIT.
