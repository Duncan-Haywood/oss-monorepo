# 3PL Invoice Audit Checker

**Did your 3PL bill you what your contract says, for the activity your own records show?** Enter the rate card from your 3PL agreement (receiving per pallet or carton, storage per pallet or bin per month, pick fee for the first and each additional unit, pack and materials, returns, kitting, account minimum, long-term storage, fuel and handling surcharges), the counts from your WMS and order export, and paste the invoice lines as CSV (`description,qty,rate,amount`). The checker recomputes every line and lists what looks recoverable, biggest first, with the record that proves each one.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/3pl-invoice-audit-checker/

Open `index.html` in a browser. It needs no account, network request or API key. Export the findings as CSV, copy a ready-to-send dispute note, or copy a shareable link (the inputs live in the link itself).

## What it flags

- **Rate above contract**: (billed rate - contract rate) x billed quantity. Proof: the signed contract section.
- **Quantity above your records**: orders, units, pallets received, returns, kits or average on-hand storage. Proof: order export, receiving log, returns log or WMS inventory snapshot. Only checked where you enter a count.
- **Storage billed on more pallets or bins than the average on-hand.**
- **Arithmetic**: line amount above quantity x rate.
- **Duplicate lines** (same description, quantity, rate and amount as an earlier line).
- **Charges not in the rate card**, recoverable in full pending a written agreement.
- **Account minimum billed on top of charges that already reach it**, or a top-up larger than the shortfall. Judged on the corrected charges.
- **Fuel and handling surcharges** above the contracted percent of the corrected receiving, pick, pack, returns and kitting charges.

Lines it cannot classify safely (for example a receiving line that does not say pallet or carton when both are in the rate card) are held for review rather than guessed; add a `category` column to resolve them. Credits (negative amounts) are listed and never counted as overcharges. It does not model tiered or volume-discount pricing, free-storage windows, contract amendments or sales tax. Treat the output as a prompt to check your contract, not a verdict.

## Privacy and usage

Everything runs in your browser. Your invoice, rate card and counts are never uploaded and there are no accounts, cookies, tracking pixels, or analytics vendor. Unless opted out, the page stores only an aggregate event name and day in local storage (`audit_run`, `csv_exported`, `dispute_note_copied`, `share_link_copied`). It stores no identity, IP address, URL, or invoice figures. Do Not Track and Global Privacy Control disable counting. A shared link contains the inputs it was made from.

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or implied. It is not legal or financial advice, and it does not replace a qualified professional. **You are responsible for reviewing and verifying its output before relying on it**, and for meeting any obligation it helps you prepare for. To the maximum extent permitted by law, the authors accept no liability for any loss or damage arising from its use.

[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) is optional and never changes what the tool does.

## Development

`calc.mjs` is a pure ES module (audit, CSV parsing, dispute note, CSV export and URL-state encoding). Run tests with `node --test`.
