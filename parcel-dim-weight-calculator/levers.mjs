// "Your dimensional weight is 13.81 lb" is true and inert. Nobody packs a
// lb, and nobody can act on a decimal. What a shipper can change is which box
// comes off the shelf, so the gap is restated as a cube ceiling and — when the
// footprint allows it — as a height.
//
// Two shapes, because there are two situations and only one of them is a
// problem:
//
//   * billed on dimensional weight: you are paying for air, and the question is
//     what box stops that;
//   * billed on actual weight: you are not, and the question is how much bigger
//     the box may get before you start.
//
// The honesty that matters is the third case inside the first: sometimes no
// height reaches the target, because the footprint alone already prices above
// the goods. Telling someone to pack a 16″ × 12″ carton to 2.9″ when they are
// shipping a mug is worse than useless, so that case says "smaller footprint"
// instead of quoting an impossible height.

const inches = value => `${value.toFixed(1)}″`;
const cubes = value => `${Math.round(value).toLocaleString('en-US')} in³`;
const pounds = value => `${value.toLocaleString('en-US')} lb`;

// Below this the "hold the footprint, pack flatter" advice stops being advice:
// a box under an inch and a half tall is a different box, not the same box
// packed better.
const IMPRACTICAL_HEIGHT_INCHES = 1.5;

/**
 * One result -> the lever lines the page renders and the copy buttons paste.
 *
 * Returns `{ headline, detail, plain }` where `headline` and `detail` are HTML
 * (they carry <b> emphasis) and `plain` is the same content as flat strings for
 * the clipboard. `plain` is empty when there is nothing to say.
 */
export function leverText(result) {
  const { lever, billedOn, billableWeight, actualWeight, cube, divisor } = result;
  const plain = [];

  if (billedOn === 'dimensional') {
    const air = lever.airWeight;
    const headline = `You are billed for <b>${pounds(billableWeight)}</b> of space to move <b>${pounds(Math.ceil(actualWeight))}</b> of goods — <b>${pounds(air)}</b> of it is air.`;
    plain.push(`Billed ${pounds(billableWeight)} to move ${pounds(Math.ceil(actualWeight))} — ${pounds(air)} of air.`);

    const ceiling = `Any box under <b>${cubes(lever.targetCube)}</b> bills on the actual weight instead, at this ${divisor} divisor.`;
    let detail;
    if (lever.targetHeight !== null && lever.targetHeight >= IMPRACTICAL_HEIGHT_INCHES) {
      detail = `${ceiling} Holding the same footprint, that is packing to <b>${inches(lever.targetHeight)}</b> instead of ${inches(result.height)} — <b>${inches(lever.heightReduction)}</b> shallower.`;
      plain.push(`Target: under ${cubes(lever.targetCube)}, or ${inches(lever.targetHeight)} tall on this footprint (${inches(lever.heightReduction)} shallower).`);
    } else {
      // The case the arithmetic is right about and a naive "reduce the height"
      // line would get badly wrong.
      detail = `${ceiling} No height on this ${result.length}″ × ${result.width}″ footprint gets there — it would need to be under ${inches(IMPRACTICAL_HEIGHT_INCHES)} — so this needs a smaller box, not a flatter one.`;
      plain.push(`Target: under ${cubes(lever.targetCube)}. The ${result.length}″ × ${result.width}″ footprint alone is too big — use a smaller box, not a flatter one.`);
    }
    return { headline, detail, plain };
  }

  const headline = `Billed on the actual <b>${pounds(billableWeight)}</b> — this box is small enough that you are not paying for air.`;
  plain.push(`Billed on actual weight (${pounds(billableWeight)}); no dimensional penalty.`);

  let detail = `You have <b>${cubes(lever.cubeHeadroom)}</b> of headroom before dimensional weight takes over: the box may grow to ${cubes(lever.targetCube)} at no extra cost.`;
  if (lever.targetHeight !== null && lever.heightHeadroom > 0) {
    detail += ` On this footprint that is <b>${inches(lever.heightHeadroom)}</b> taller.`;
    plain.push(`Headroom: ${cubes(lever.cubeHeadroom)}, or ${inches(lever.heightHeadroom)} taller on this footprint.`);
  } else {
    plain.push(`Headroom: ${cubes(lever.cubeHeadroom)} before dimensional weight takes over.`);
  }

  // Worth saying only when it is close. A package with 4,000 in³ of headroom
  // does not need a warning about a tape measure.
  if (lever.cubeHeadroom / Math.max(cube, 1) < 0.1) {
    detail += ` <span class="warn">That is under 10% — a slightly larger carton, or a carrier rounding each side up, flips this onto dimensional weight.</span>`;
    plain.push('Under 10% headroom: a slightly larger carton or rounded measurements flips this onto dimensional weight.');
  }

  return { headline, detail, plain };
}
