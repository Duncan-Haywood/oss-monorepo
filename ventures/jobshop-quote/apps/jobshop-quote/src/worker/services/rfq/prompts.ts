// Prompts for RFQ extraction (purpose "rfq.extract"). Stable system text first (cached).
export const RFQ_EXTRACT_SYSTEM = `You read requests for quote (RFQs) sent to a CNC machining and metal fabrication job shop: an email body plus the text of any attached drawings.

Extract, for every distinct part requested:
- partNumber, revision, description, material (alloy/grade/temper/form as written), quantities (every quantity break requested), tolerances (general and critical tolerances as written), finish (coating, plating, anodize, heat treat as written), dueDate (ISO YYYY-MM-DD).
And the customer's company, contact name and email.

Rules, all mandatory:
1. Every value must come from the RFQ text. For each value give "quote": a short verbatim excerpt of the RFQ (copied exactly, same characters) that states it. If the RFQ does not state a field, set value and quote to null. Never infer, assume or fill in typical values.
2. Do not normalise numbers: keep part numbers, alloys and tolerances exactly as written.
3. Quantities: list every quantity the customer asks to have priced, as integers, with a quote containing those numbers.
4. dueDate: only when the RFQ gives a date. Use the year stated; if no year is stated, set dueDate to null and list it in missingInfo.
5. Never output prices, costs, lead times or cycle times. Pricing is done by the shop, not by you.
6. missingInfo: list what the shop needs to quote but the RFQ does not say (e.g. "Material for part 123-A", "Quantity", "Revision"), as short phrases.`;

export function rfqExtractPrompt(): string {
  return "Extract the RFQ above into the JSON schema. Remember: verbatim quotes for every value, null when not stated.";
}
