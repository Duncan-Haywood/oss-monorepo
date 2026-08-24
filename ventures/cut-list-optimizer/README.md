# Cut List Optimizer

Cut List Optimizer is a free browser tool for woodworkers, sign shops, and makers who need to turn a list of required pieces into a practical low-waste plan before buying stock. It covers the two jobs a shop actually has:

- **Sheet goods** — plywood, MDF, acrylic, ACM, coroplast. Paste your parts and get a labelled layout diagram for every sheet, the offcuts worth racking, and what the material will cost.
- **Linear stock** — boards, extrusion, trim, tube. Paste your lengths and get a bar-by-bar plan.

Both account for saw kerf, both are deterministic, and both run entirely on your own device.

Serve this directory as static files — for example `python3 -m http.server` in this folder, then open `http://localhost:8000/`. The page loads its logic as ES modules, which browsers refuse to fetch from a `file://` path, so opening `index.html` straight off disk leaves the calculator blank.

## Sheet goods

Enter the sheet size, your saw kerf, and one part per line:

| Line | Means |
| --- | --- |
| `24 x 12` | one piece, 24 by 12 |
| `24 x 12 x 3` | three pieces, 24 by 12 |
| `Shelf: 24 x 12 x 3` | the same three, labelled `Shelf` on the diagram |
| `Door: 24 x 12 grain` | one piece that must not be rotated |

`x`, `*`, and `×` all work as separators.

**Edge trim** is stock taken off all four sides before anything is laid out — useful when the factory edge of a sheet is not square enough to reference off. **Pieces may be rotated 90°** is on by default; turn it off for a veneer or a printed face where direction has to run one way, or add `grain` to a single line to pin just that piece. **Cost per sheet** is optional: fill it in and the plan reports what the job costs in material and what the offcut is costing you.

**Copy cut plan** puts a plain-text version on the clipboard for a job ticket or shop note. **Print** produces a paper copy of the diagrams with the controls hidden.

### How the layouts are produced, and what that means for you

Every cut in a sheet plan runs edge to edge across whatever is left of the sheet — a **guillotine** layout. That is not a simplification, it is what a table saw, track saw, or panel saw can physically do. Nesting layouts that need an interior cut score better on paper and cannot be cut on the machines this tool's users own.

Pieces are placed largest first into the tightest space that still holds them, so large offcuts stay large for the pieces still to come. The result is **deterministic** — the same list always produces the same plan, so a saved job ticket still matches the layout it was cut from.

The plan is a **heuristic**, not a proof. It is not guaranteed to be the best possible arrangement, and a careful hand layout can occasionally beat it. Treat it as a starting point that is right about kerf and arithmetic, and check it.

Kerf and edge trim are counted as **waste**, not as usable material, so the utilization figure is the honest one. Pieces that cannot fit a sheet in any allowed orientation are reported separately rather than dropped, so one mistyped line never hides a usable plan for the rest of the list.

**Known limitations:** guillotine layouts only, so a shop with a CNC router could nest more tightly; one sheet size per plan, so mixed stock needs separate runs; no thickness or material tracking, so a plan is per material, per thickness.

## Linear stock

Enter one required length per line. Add `x quantity` when several identical pieces are needed, such as `24 x 3`. The deterministic first-fit decreasing plan is a planning aid, not a guarantee of the optimal arrangement. Use **Copy cut plan** to put a plain-text version into a job ticket or shop note; it stays in your browser and is not uploaded.

Two optional inputs turn the plan from a waste estimate into a purchasing decision:

- **Offcuts you already have** — same `36 x 2` format as the cut list. These are consumed before any new stock is opened, shortest usable piece first, so the long stock on your rack stays whole for the next job. An offcut nothing gets cut from is left alone: it counts as neither consumed stock nor waste.
- **Price per stock piece** and **currency** — prices the plan, and reports how many purchases planning against your own rack avoided, and what that saved against buying everything new.

Both are carried into the copied job ticket alongside the stock length and kerf the plan assumed.

## Privacy

Everything runs in the browser. The cut list never leaves your device, there are no accounts, cookies, or analytics vendors, and anonymous usage is counted only in local storage. Four counters are kept, all local and all covered by the footer's off switch:

| Key | Meaning |
| --- | --- |
| `cut-list-optimizer-runs` | A linear cut plan was calculated from a settled edit |
| `cut-list-optimizer-copies` | A linear plan was copied out for a job ticket |
| `cut-list-optimizer-sheet-runs` | A sheet layout was calculated from a settled edit |
| `cut-list-optimizer-sheet-copies` | A sheet plan was copied out for a job ticket |

Keeping them apart is what makes the numbers readable: `runs` shows the tool was used, `copies` shows a plan was good enough to carry into the shop, and the `sheet-` pair shows which half of the product people come back for. None of the counters records the cut list itself — no dimension, label, quantity, or price — and nothing is transmitted.

Counting is skipped entirely when the browser sends Do Not Track or Global Privacy Control. Ticking the footer checkbox both stops counting and **clears the counts already kept**, which is what the label promises.

## Development

```sh
node --test             # 51 tests: sheet, calc, usage, and page structure
python3 -m http.server  # then verify the page at http://localhost:8000/
```

| File | What it is |
| --- | --- |
| `sheet.mjs` / `sheet.test.mjs` | 2D guillotine packing for sheet goods |
| `calc.mjs` / `calc.test.mjs` | 1D packing for linear stock |
| `usage.mjs` / `usage.test.mjs` | The local, opt-out-able counters |
| `page.test.mjs` | The markup-to-script contract for `index.html` |

`page.test.mjs` parses `index.html` the way a browser does and asserts the script
actually executes and every element it reaches for exists. It is there because
the calculator once shipped with an unclosed `<textarea>` that swallowed the
whole app; the unit tests stayed green because they never looked at the page.
It also checks that every import resolves to a real export, that both tab panels
stay wired to their tabs, and that user-supplied part labels are escaped before
they reach the DOM.

## Support

Free and open source, with no gated features. If it saved you a trip to the lumber yard, [sponsoring its upkeep](https://github.com/sponsors/Duncan-Haywood) is welcome and entirely optional — declining changes nothing about what the tool does.

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or implied. It is not engineering, financial, or business advice, and it does not replace a qualified professional. **You are responsible for reviewing and verifying its output before relying on it**, including dimensions, tool setup, material, and prices, and for meeting any obligation it helps you prepare for. To the maximum extent permitted by law, the authors accept no liability for any loss or damage arising from its use.
