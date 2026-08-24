# Cut List Optimizer

Cut List Optimizer is a free browser tool for woodworkers, sign shops, and makers who need to turn a list of required pieces into a practical low-waste plan before buying stock. It plans against the offcuts already in your rack first, tells you how many new stock pieces you actually have to buy, and prices them — so the answer to "do I need another board?" takes seconds instead of spreadsheet trial and error.

Serve this directory as static files — for example `python3 -m http.server` in this folder, then open `http://localhost:8000/`. The page loads its logic as ES modules, which browsers refuse to fetch from a `file://` path, so opening `index.html` straight off disk leaves the calculator blank.

## Using it

- **Required cuts** — one length per line. Add `x quantity` when several identical pieces are needed, such as `24 x 3`.
- **Offcuts you already have** — optional, same format. These are consumed before any new stock is opened, shortest usable piece first, so the long stock in your rack stays whole for the next job. An offcut nothing gets cut from is left alone: it is not counted as consumed stock and not counted as waste.
- **Price per stock piece** — optional. Prices the plan and shows what planning against your own offcuts saved you against buying everything new.
- **Measurement unit and currency** — the plan and the copied ticket use whatever you pick.

**Copy cut plan** puts a plain-text version into a job ticket or shop note, including the stock length, kerf, buy count, and cost the plan assumed. It stays in your browser and is not uploaded.

The plan is a deterministic first-fit decreasing packing. It is a planning aid, not a guarantee of the optimal arrangement.

## Privacy

Everything runs in the browser. The cut list never leaves your device, there are no accounts, cookies, or analytics vendors, and anonymous usage is counted only in local storage. Two counters are kept, both local and both covered by the footer's off switch:

| Key | Meaning |
| --- | --- |
| `cut-list-optimizer-runs` | A cut plan was calculated from a settled edit |
| `cut-list-optimizer-copies` | A plan was copied out for a job ticket |

Keeping them apart is what makes the numbers readable: `runs` shows the tool was used, `copies` shows a plan was good enough to carry into the shop. Neither counter records the cut list itself, and nothing is transmitted.

## Development

```sh
node --test            # calc, usage, and page-structure tests
python3 -m http.server  # then verify the page at http://localhost:8000/
```

`calc.test.mjs` covers the packing, the offcut planning, the pricing, and the
ticket export. `usage.test.mjs` covers the local counters. `page.test.mjs`
parses `index.html` the way a browser does and asserts the script actually
executes and every element it reaches for exists. That last one is there
because the calculator shipped with an unclosed `<textarea>` that swallowed the
whole app and stayed broken across three merged changes; the unit tests stayed
green because they never looked at the page, and the venture had no CI.

## Support

Free and open source, with no gated features. If it saved you a trip to the lumber yard, [sponsoring its upkeep](https://github.com/sponsors/Duncan-Haywood) is welcome and entirely optional — declining changes nothing about what the tool does.

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or implied. It is not engineering, financial, or business advice, and it does not replace a qualified professional. **You are responsible for reviewing and verifying its output before relying on it**, including dimensions, tool setup, material, and prices, and for meeting any obligation it helps you prepare for. To the maximum extent permitted by law, the authors accept no liability for any loss or damage arising from its use.
