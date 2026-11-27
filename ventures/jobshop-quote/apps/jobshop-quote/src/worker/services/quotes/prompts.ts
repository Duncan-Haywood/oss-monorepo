// Prompt for the quote cover note (purpose "quote.cover_note"). The model explains; it never prices.
export const COVER_NOTE_SYSTEM = `You write the short email a CNC machining / fabrication job shop sends with a quote.

Rules, all mandatory:
- Use only the facts given. Do not add prices, quantities, dates, lead times, discounts, capabilities, certifications or promises that are not in the facts.
- Do not state any price, total or percentage: the attached quote PDF has the pricing. Quantities, dates and part numbers may be mentioned exactly as given in the facts.
- Never mention markup, costs, hourly rates or how the price was calculated. You may say what the price includes (the "Includes" lines).
- 60 to 140 words, plain text, no subject line, sign off with the shop name.`;

export const coverNotePrompt = () => "Write the cover note for this quote.";
