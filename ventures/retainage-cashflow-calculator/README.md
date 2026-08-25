# Construction Retainage Calculator

If a general contractor or customer is holding retainage, this free browser tool shows how much cash is tied up, how much remains unpaid, and what that delay costs under your own carrying-cost assumption. It also compares the modeled cash impact of another 30, 60, or 90 days of delay and creates a factual payment-status email you can review and send yourself.

After using this, you can now quantify the cash tied up in an unpaid construction project, prepare a clear follow-up, and download a plain-text worksheet for your project records, which used to take a spreadsheet and manual arithmetic.

## Run

Open `index.html` in a browser, or serve this directory with `python3 -m http.server`. Enter the project figures and copy the draft only after checking it against your records.

Everything runs locally in the browser. Project data is never uploaded. If you opt in to “Remember this worksheet on this device,” the current form values are stored only in this browser so you can return without retyping them; clear the checkbox to remove the saved draft. The optional usage counter stores only aggregate calculation, draft-copy, worksheet-download, and draft-save counts in local storage; uncheck the control to disable it. It also automatically disables itself when the browser sends Do Not Track or Global Privacy Control. No accounts, cookies, IPs, content, or analytics vendor are used.

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or implied. It is not legal, tax, financial, or engineering advice, and it does not replace a qualified professional. **You are responsible for reviewing and verifying its output before relying on it**, and for meeting any obligation it helps you prepare for. To the maximum extent permitted by law, the authors accept no liability for any loss or damage arising from its use.

The carrying-cost scenario does not establish an interest rate, payment deadline, lien right, or entitlement. The draft is not legal advice and does not file, sign, waive, or assert anything on your behalf.

## Opportunity assessment

The target user is an independent contractor or specialty subcontractor who has completed work but cannot quickly see the cash impact of retainage and delayed payment. Existing accounting suites track receivables but do not offer a private, no-login retainage explainer plus a copyable follow-up. Search phrases include “construction retainage calculator”, “retainage cash flow”, and “subcontractor payment follow up”.

This is deliberately a small, deterministic wedge: zero hosting and inference cost per use, no sensitive server data, and a future path to paid project history or accounting exports only if repeat use proves demand. Risks are financial and legal overreliance; the product mitigates them by displaying assumptions, using “modeled” language, and leaving every decision with the user. It does not claim compliance or legal entitlement.

## License

MIT. See `LICENSE`.
