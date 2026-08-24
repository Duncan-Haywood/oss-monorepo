# Cut List Optimizer

Cut List Optimizer is a free browser tool for woodworkers, sign shops, and makers who need to turn a list of required pieces into a practical low-waste plan before buying stock. After using this, you can now estimate stock pieces, saw-kerf allowance, offcut, and utilization in seconds, which used to take manual spreadsheet trial and error.

Serve this directory as static files — for example `python3 -m http.server` in this folder, then open `http://localhost:8000/`. The page loads its logic as ES modules, which browsers refuse to fetch from a `file://` path, so opening `index.html` straight off disk leaves the calculator blank. Enter one required length per line. Add `x quantity` when several identical pieces are needed, such as `24 x 3`. The deterministic first-fit decreasing plan is a planning aid, not a guarantee of the optimal arrangement. Use **Copy cut plan** to put a plain-text version into a job ticket or shop note; it stays in your browser and is not uploaded.

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

`page.test.mjs` parses `index.html` the way a browser does and asserts the script
actually executes and every element it reaches for exists. It is there because
the calculator once shipped with an unclosed `<textarea>` that swallowed the
whole app; the unit tests stayed green because they never looked at the page.

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or implied. It is not engineering, financial, or business advice, and it does not replace a qualified professional. **You are responsible for reviewing and verifying its output before relying on it**, and for meeting any obligation it helps you prepare for. To the maximum extent permitted by law, the authors accept no liability for any loss or damage arising from its use.
