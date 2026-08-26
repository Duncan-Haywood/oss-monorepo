# Construction Retainage Calculator

If a general contractor or customer is holding retainage, this free browser tool shows how much cash is tied up, how much remains unpaid, and what that delay costs under your own carrying-cost assumption. It also compares a check offered today — as a waiver that closes the rest, or as an acceleration that still pays the remainder later — against waiting for the full retainage, then creates a factual payment-status email you can review and send yourself.

After using this, you can now quantify the cash tied up in an unpaid construction project, see whether a partial retainage check still beats waiting after modeled carrying cost, prepare a clear follow-up, download a plain-text worksheet for your project records, or print/save a private project report as PDF. The report keeps project context, the cash snapshot, further-delay scenarios, and the partial-offer comparison together, which used to take a spreadsheet and manual arithmetic.

## Run

Open `index.html` in a browser, or serve this directory with `python3 -m http.server`. Enter the project figures and copy the draft only after checking it against your records.

Everything runs locally in the browser. Project data is never uploaded. If you opt in to “Remember this worksheet on this device,” the current form values are stored only in this browser so you can return without retyping them; clear the checkbox to remove the saved draft. The optional usage counter stores only aggregate calculation, draft-copy, worksheet-download, report-print, draft-save, and partial-offer-compare counts in local storage; uncheck the control to disable it. No accounts, cookies, IPs, content, or analytics vendor are used.

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or implied. It is not legal, tax, financial, or engineering advice, and it does not replace a qualified professional. **You are responsible for reviewing and verifying its output before relying on it**, and for meeting any obligation it helps you prepare for. To the maximum extent permitted by law, the authors accept no liability for any loss or damage arising from its use.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or taken offline without notice. We do not promise uptime, backups of anything you type, or that a URL will keep working. Do not use this as a system of record. If a tool needs to survive, export your inputs and run it yourself.

The carrying-cost scenario does not establish an interest rate, payment deadline, lien right, or entitlement. The draft is not legal advice and does not file, sign, waive, or assert anything on your behalf.

## Opportunity assessment

The target user is an independent contractor or specialty subcontractor who has completed work but cannot quickly see the cash impact of retainage and delayed payment. Existing accounting suites track receivables but do not offer a private, no-login retainage explainer plus a copyable follow-up. Search phrases include “construction retainage calculator”, “retainage cash flow”, and “subcontractor payment follow up”.

This is deliberately a small, deterministic wedge: zero hosting and inference cost per use, no sensitive server data, and a future path to paid project history or accounting exports only if repeat use proves demand. Risks are financial and legal overreliance; the product mitigates them by displaying assumptions, using “modeled” language, and leaving every decision with the user. It does not claim compliance or legal entitlement.

## License

MIT. See `LICENSE`.
