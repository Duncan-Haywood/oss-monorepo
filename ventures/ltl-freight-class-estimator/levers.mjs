// Turns the two levers `calc.mjs` computes into the sentences the page shows
// and the buttons copy.
//
// It lives beside the calculator rather than inside the page because both copy
// buttons and the result panel have to say the same thing. A repack target
// pasted into a warehouse email that disagreed with the panel it was read from
// is worse than no button at all.

const inches = n => `${n.toFixed(1)}″`;
const pounds = n => `${Math.round(n)} lb`;

// A bare 48x40 pallet is roughly 5-6 inches of deck and block before anything
// is loaded onto it, so a target height under that is arithmetic the dock
// cannot execute. Naming the limit is what keeps the lever from being a taunt.
export const PALLET_DECK_INCHES = 6;

// Under this much clearance the shipment is effectively sitting on its band
// floor, and the honest reading is "on the line", not a headroom figure.
export const ON_THE_LINE_INCHES = 0.5;

/**
 * @param {object} result the return value of `estimateFreightClass`
 * @returns {{cheaper: string, dearer: string, plain: string[]}}
 *   `cheaper`/`dearer` are HTML for the result panel (empty string when that
 *   lever does not exist, which the panel hides via `.lever:empty`); `plain` is
 *   the same content as plain-text lines for the clipboard.
 */
export function leverText(result) {
  const { cheaper, dearer } = result.levers;
  const lines = { cheaper: '', dearer: '', plain: [] };

  if (cheaper) {
    // Below a bare pallet's own height, shortening is not a move anyone can
    // make, so the sentence drops that half rather than printing a number the
    // reader would have to reject themselves.
    const tooShort = cheaper.maxHeight === null || cheaper.maxHeight < PALLET_DECK_INCHES;
    const height = tooShort ? '' : `pack to ${inches(cheaper.maxHeight)} (${inches(cheaper.heightReduction)} shorter)`;
    const weight = `put ${pounds(cheaper.requiredWeight)} per piece on it (${pounds(cheaper.weightIncrease)} more)`;
    const both = height ? `${height}, or ${weight}` : weight;
    lines.cheaper = `<b>Class ${cheaper.freightClass}</b> is one repack away: ${both}.`
      + (tooShort ? '<span class="warn">The height that would reach it is under a bare pallet, so weight is the only lever here.</span>' : '');
    lines.plain.push(`To reach class ${cheaper.freightClass}: ${both}.`);
  }

  if (dearer) {
    // Freight sitting within half an inch of its band floor is the expensive
    // case, and "0.0″ of headroom" is the wrong way to say so — it reads like a
    // rounding artefact rather than the warning it is. A tape measure and a
    // dimensioner disagree by more than this routinely.
    const onTheLine = dearer.heightHeadroom !== null && dearer.heightHeadroom < ON_THE_LINE_INCHES;
    const height = dearer.maxHeight === null
      ? ''
      : onTheLine
        ? ` above ${inches(dearer.maxHeight)}, which is where it already measures`
        : ` above ${inches(dearer.maxHeight)} — ${inches(dearer.heightHeadroom)} of headroom`;
    const sentence = `this freight re-rates${height}, or below ${pounds(dearer.minWeight)} per piece`;
    lines.dearer = `<b>Class ${dearer.freightClass}</b> is what a remeasure costs: ${sentence}.`
      + (onTheLine ? '<span class="warn">This is on the band line. A dimensioner that reads it a fraction taller bills the dearer class.</span>' : '');
    lines.plain.push(`Re-rates to class ${dearer.freightClass}${height}, or below ${pounds(dearer.minWeight)} per piece.`
      + (onTheLine ? ' On the band line — a dimensioner reading it a fraction taller bills the dearer class.' : ''));
  }

  return lines;
}
