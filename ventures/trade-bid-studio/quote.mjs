// Pure helpers for the customer proposal in the studio. The proposal itself is
// the shared platform/proposal/proposal.mjs; this file only decides two things
// that are specific to the studio: the draft scope and which price is quoted.
//
// Neither touches the DOM, so the tests can check what a customer would read.

const clean = v => String(v ?? '').trim();

const qtyText = v => {
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '';
};

// Draft scope from the takeoff lines. Only the contractor's own work names and
// quantities appear: crew hours and material cost are the contractor's, and a
// customer's copy must not carry them. A line with no name or no positive
// quantity is skipped rather than printed as "undefined" or "0 each".
export function draftScope(tradeName, takeoffLines = []) {
  const out = [];
  for (const line of takeoffLines) {
    const label = clean(line?.label);
    const q = Number(line?.qty);
    if (!label || !Number.isFinite(q) || q <= 0) continue;
    const unit = clean(line.unit);
    out.push(unit && unit !== 'each' ? `${label}: ${qtyText(q)} ${unit}` : `${label}: ${qtyText(q)}`);
  }
  if (out.length) out.push('Site protection and clean-up on completion');
  else if (clean(tradeName)) out.push(`${clean(tradeName)}, labor and materials as agreed`);
  return out;
}

// The customer is quoted the price the contractor typed in "Quote this price"
// when there is one (people round a bid to $3,450), otherwise the calculated
// price. A blank, zero, negative or non-numeric override falls back to the
// calculated price, never to a different number than the one on screen.
export function quotedPrice(calculatedPrice, override) {
  const o = Number(clean(override));
  return clean(override) !== '' && Number.isFinite(o) && o > 0 ? o : calculatedPrice;
}
