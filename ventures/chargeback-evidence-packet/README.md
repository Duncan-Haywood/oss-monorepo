# Chargeback Evidence Packet Builder

Small ecommerce sellers often assemble a dispute response from scattered order, fulfillment, delivery, and support records. This free browser-local tool turns those records into a structured checklist and a copyable factual response draft. **After using it, you can now prepare a reviewable packet before a processor deadline, which used to take searching across several systems and rewriting the same timeline.**

Open `index.html` in a browser. No account, server, API key, or paid dependency is required. Order details and notes stay in the browser; only anonymous feature counts are stored locally and can be disabled or cleared through browser storage.

## Safety boundary

This is an evidence organizer and drafting aid, not legal, financial, or payment-dispute advice. It does not predict a bank's decision or prove that a transaction was authorized. Review every fact and submit through the payment processor's deadline and process.

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or implied. It is not legal, tax, financial, or payment advice, and it does not replace a qualified professional. You are responsible for reviewing and verifying its output before relying on it. To the maximum extent permitted by law, the authors accept no liability for any loss or damage arising from its use.

Licensed under MIT.

## Why this exists

This is deliberately narrower than automated chargeback filing. Filing on a
seller's behalf creates legal, fraud, and deadline risk, so the product stops at
organizing evidence and drafting text that a seller must review and submit.
Potential future value is a private export format for processor-specific
workflows, without uploading customer data or making a decision for the seller.

## Usage

The browser records only local counts of `packet_built` and `draft_copied`.
Those counts contain no order IDs, notes, IPs, cookies, or identifiers. Uncheck
the usage option to clear and stop counting. The baseline is recorded in
`portfolio/usage/usage.yaml`; there is no hosted analytics service.
