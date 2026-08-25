# FIFO Pick Evidence

Small 3PL warehouses can turn a pick-log CSV into a portable FIFO exception
report before a customer audit. This local CLI checks whether older inventory
was still waiting when a newer lot was picked, and calls out missing or
ill-formed timestamps. It does not upload the log or certify an operation.

```sh
cd ventures/fifo-pick-evidence
python3 fifo_pick_evidence.py examples/picks.csv --format json
python3 -m unittest -v
```

The CSV needs `order_id`, `sku`, `lot`, `received_at`, and `picked_at` columns.
Timestamps use ISO 8601. Add `--usage-file ~/.local/state/fifo-pick-evidence/usage.json`
to opt into a local count of reports run. No usage file is created by default.

## Privacy and limits

Everything runs on your machine. The pick log and report are never uploaded;
there are no accounts, cookies, tracking pixels, or analytics vendors. The
optional counter stores only a total event count and is never sent anywhere.

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
