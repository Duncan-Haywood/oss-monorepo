# Translator Project Quote Calculator

Freelance translators often quote from a raw word count even when new words,
fuzzy matches, QA, rush work, and desktop publishing take different amounts of
time. This free browser calculator turns those assumptions into a transparent
weighted-word quote floor and target-margin comparison.

Open [`index.html`](index.html) directly or serve this directory as static
files. The worked example is editable and the calculation needs no account,
network, API key, or paid service.

After using this, you can compare a translation quote with your own minimum and
target margin, which used to take a spreadsheet and several hidden assumptions.

## Model

- Weighted words = new words + fuzzy-match words multiplied by the supplied fuzzy rate.
- Translation hours = weighted words divided by the supplied words per hour.
- Translation labor = translation hours multiplied by the supplied hourly rate.
- Add-on costs include QA hours at the same hourly rate, DTP/file handling, and rush fees.
- Target-margin price grosses up direct labor and add-ons by the supplied margin.
- The quote floor is the larger of the supplied minimum and direct project costs.
- The recommended quote is the larger of the quote floor and the target-margin
  price. On a small job the floor still wins; on any job whose margin math
  outpaces the floor, the margin price is what gets recommended instead of
  quietly dropping back to cost-plus-nothing once the flat minimum stops
  binding.

These are arithmetic comparisons, not a recommended rate, a translation
quality judgment, or a profitability determination. The user owns the rate,
match discount, quality process, and final decision.

**No warranty.** This tool is provided free and as-is, without warranty of any
kind, express or implied. It is not tax, financial, or business advice, and it
does not replace a qualified professional. **You are responsible for reviewing
and verifying its output before relying on it**, and for meeting any obligation
it helps you prepare for. To the maximum extent permitted by law, the authors
accept no liability for any loss or damage arising from its use.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may
be slow, broken, moved, or taken offline without notice. We do not promise
uptime, backups of anything you type, or that a URL will keep working. Do not
use this as a system of record. If a tool needs to survive, export your
inputs and run it yourself.

## Privacy and usage

Everything runs in your browser. Your word counts, rates, and costs are never
uploaded. There are no accounts, cookies, or analytics vendors. The optional
`page_viewed`, `quote_summary_copied`, and `share_link_copied` counters store
only an aggregate event and date in local storage, honor Do Not Track and
Global Privacy Control, and have a visible off-switch. No project text,
client name, or identifier is recorded.

Your last entry is saved to local storage so a refresh doesn't lose it, and
"Copy shareable link" puts the same inputs in the page's URL fragment (never
sent to a server) so you can hand a client or colleague the exact quote.

[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) is optional and
does not change what the calculator does.

## Development

```bash
node --test calc.test.mjs
node ../../platform/pages/clauses.mjs translator-project-quote
```

MIT licensed; see [`LICENSE`](LICENSE).
