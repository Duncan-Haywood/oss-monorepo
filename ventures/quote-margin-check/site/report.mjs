// Builds a portable, local-only report. Keeping the shape pure makes the export
// easy to verify without a DOM.
export function reportDocument(quote, result) {
  return {
    product: "Quote Margin Check",
    exported_at: new Date().toISOString(),
    inputs: quote,
    result,
    disclaimer: "Arithmetic only; not tax, financial, or business advice. Review and verify every assumption before relying on this output.",
  };
}
