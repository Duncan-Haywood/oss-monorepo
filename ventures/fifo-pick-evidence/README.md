# FIFO Pick Evidence

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/fifo-pick-evidence/>

Small 3PL warehouses can turn a pick-log CSV into a portable FIFO exception
report before a customer audit. This tool checks whether older inventory was
still waiting when a newer lot was picked, and calls out missing or
ill-formed timestamps. It does not upload the log or certify an operation.

## Browser tool

Open `index.html` (or `npm run serve` and visit `localhost:8000`) and drag in
a pick-log CSV, or paste it directly. Everything runs client-side in
`evidence.js` — the file is never uploaded. Download the report as Markdown
or JSON, or load the bundled worked example first to see the report shape.

```sh
cd ventures/fifo-pick-evidence
npm test      # node --test: evidence.js, usage.js, and page wiring
npm run serve # then open http://localhost:8000
```

## Command-line tool

The identical check also ships as a local Python CLI, for scheduled runs,
CI pipelines, or scripted use:

```sh
cd ventures/fifo-pick-evidence
python3 fifo_pick_evidence.py examples/picks.csv --format json
python3 -m unittest -v
```

The CSV needs `order_id`, `sku`, `lot`, `received_at`, and `picked_at` columns.
Timestamps use ISO 8601. Add `--usage-file ~/.local/state/fifo-pick-evidence/usage.json`
to opt into a local count of reports run. No usage file is created by default.

## Privacy and limits

Everything runs on your machine or in your browser tab. The pick log and
report are never uploaded; there are no accounts, cookies, tracking pixels,
or analytics vendors. The browser tool counts only anonymous, aggregate
local events (opt-out in the page footer, and it honors Do Not Track /
Global Privacy Control); the CLI's optional counter stores only a total
event count. Neither is ever sent anywhere.

**No warranty.** This tool is provided free and as-is, without warranty of any
kind, express or implied. It is not engineering, legal, tax, financial, or
medical advice, and it does not replace a qualified professional. **You are
responsible for reviewing and verifying its output before relying on it**, and
for meeting any obligation it helps you prepare for. To the maximum extent
permitted by law, the authors accept no liability for any loss or damage
arising from its use.

The report is an observation of the supplied rows, not an audit conclusion,
compliance determination, chain-of-custody record, or warranty that FIFO was
followed. Confirm warehouse-system semantics and investigate each observation.

[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) is optional and
never changes what the tool does.
