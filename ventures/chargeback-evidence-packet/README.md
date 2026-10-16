# Chargeback Evidence Packet Builder

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/chargeback-evidence-packet/>

Small ecommerce sellers often assemble a dispute response from scattered order, fulfillment, delivery, and support records. This free browser-local tool turns those records into a structured checklist and a copyable factual response draft. **After using it, you can now prepare a reviewable packet before a processor deadline, which used to take searching across several systems and rewriting the same timeline.**

**The checklist follows the dispute reason.** A merchandise-not-received response is carried by fulfillment and delivery records; a fraud response is carried by the AVS/CVV result and delivery to the verified address; a not-as-described response is carried by the listing as it stood at purchase. Picking a reason re-renders the checklist into what is *core* for that reason, what *strengthens* it, and what else you might hold — so the handful of records that actually matter are not buried in one flat list. Seven reason codes are modeled: merchandise not received, credit not processed, merchandise not as described, fraudulent transaction, duplicate transaction, subscription canceled, and incorrect amount — each with its own required and recommended evidence, because a duplicate-charge dispute and an incorrect-amount dispute turn on different records even though both mention "payment."

**Gaps stay out of the submission.** The response draft names only the records you hold. What you are still missing appears in the on-screen review and in the "working notes" half of the text download, marked *do not submit* — a response that volunteers an inventory of everything the seller could not produce is arguing against itself.

Enter the deadline shown by your processor to get a simple urgency reminder. The tool does date arithmetic only; it does not infer processor rules, filing extensions, or the correct deadline. After reviewing the result, copy the draft, download a plain-text packet, or download packet JSON for your own records. You can optionally save an in-progress draft in the browser and restore it later; saved fields never leave that browser.

[How to respond to a chargeback](./how-to-respond-to-a-chargeback.html) covers what each reason code is actually asking and the habits that decide the outcome before you write anything.

## Layout

| File | What it holds |
|---|---|
| `packet.mjs` | Evidence rules per reason, deadline arithmetic, draft and working-notes assembly. Imported by the page; unit-tested directly. |
| `packet.test.mjs` | Behavioural tests for the rules and the arithmetic, including that the submitted draft never lists a missing record. |
| `index.html` | The page: form, reason-driven checklist, review panel, exports, privacy controls. |
| `test.mjs` | Page-level wiring, controls, and the disclaimer language. |

Run `node --test` in this directory.

Open `index.html` in a browser. No account, server, API key, or paid dependency is required. Order details and notes stay in the browser; only anonymous feature counts are stored locally and can be disabled or cleared through browser storage. The counter also stays off when the browser sends Do Not Track or Global Privacy Control.

## Safety boundary

This is an evidence organizer and drafting aid, not legal, financial, or payment-dispute advice. It does not predict a bank's decision or prove that a transaction was authorized. Review every fact and submit through the payment processor's deadline and process.

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or implied. It is not legal, tax, financial, or payment advice, and it does not replace a qualified professional. You are responsible for reviewing and verifying its output before relying on it. To the maximum extent permitted by law, the authors accept no liability for any loss or damage arising from its use.

[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) is optional and never changes what the tool does.

Licensed under MIT.
