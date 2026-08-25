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
- Translation hours = weighted words divided by the supplied weighted words/hour.
- Add-on costs include QA hours at the translation rate, DTP/file handling, and rush fees.
- Target-margin price gross-ups direct labor and add-ons by the supplied margin.
- The minimum price is the larger of the supplied minimum and direct project costs.

These are arithmetic comparisons, not a recommended rate, a translation
quality judgment, or a profitability determination. The user owns the rate,
match discount, quality process, and final decision.

**No warranty.** This tool is provided free and as-is, without warranty of any
kind, express or implied. It is not tax, financial, or business advice, and it
does not replace a qualified professional. **You are responsible for reviewing
and verifying its output before relying on it**, and for meeting any obligation
it helps you prepare for. To the maximum extent permitted by law, the authors
accept no liability for any loss or damage arising from its use.

## Privacy and usage

Everything runs in your browser. Your word counts, rates, and costs are never
uploaded. There are no accounts, cookies, or analytics vendors. The optional
`quote_summary_copied` counter stores only an aggregate event and date in local
storage, honors Do Not Track and Global Privacy Control, and has a visible
off-switch. No project text, client name, or identifier is recorded.

## Opportunity assessment

This niche is distinct from the portfolio's marketplace fee calculators and
trade bid calculators: translators price language-unit workloads, fuzzy-match
discounts, QA, and DTP rather than products, miles, rooms, or linear feet.
Current alternatives are general invoicing tools, CAT platforms, and
spreadsheets; none of those give a small translator a fast, local quote-floor
check without importing client content. Search terms such as “translation
project quote calculator”, “fuzzy match pricing”, and “how to price translation
work” describe a concrete, money-linked problem with recurring use.

The launch is static and deterministic, so hosting and inference cost are zero
per user. A later paid version could add saved rate cards, CAT-tool exports, or
team templates; those are deliberately not required for this free first slice.
The main risks are incorrect user assumptions and clients' confidential text,
which is why the tool accepts no project text and labels every result as a
review prompt. A future AI summary, if requested, must use the user's own API
key and remain optional.

## Development

```bash
node --test calc.test.mjs
python3 -m unittest discover -s ../quote-margin-check/tests -v
```

MIT licensed; see [`LICENSE`](LICENSE).
