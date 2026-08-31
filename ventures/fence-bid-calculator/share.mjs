// Allowlisted share encoding for the fence bid calculator. A shared URL must
// reconstruct the same quote the sender saw — silently dropping a run's gate
// count, the dig condition, or the proposed price is how two people compute
// different profits from the "same" link. Only these keys ride in the
// payload; anything else is ignored so a crafted fragment cannot inject
// unexpected behavior.

export const SHARE_FIELDS = Object.freeze([
  'tearOutFeet',
  'hoursPerTearOutLf',
  'tearOutPerFoot',
  'dig',
  'slope',
  'hourlyWage',
  'burdenRate',
  'otherCost',
  'overheadRate',
  'targetMargin',
  'proposedPrice',
]);

// Everything `readRuns()` in index.html puts on a run row, so a shared link
// reconstructs the exact same run whether it matched a material preset or
// was hand-edited into a custom one — `addRunRow` treats an unmatched
// `name` as "other" and applies these fields directly.
const RUN_KEYS = Object.freeze([
  'name',
  'linearFeet',
  'postSpacingFt',
  'corners',
  'walkGates',
  'driveGates',
  'materialPerLf',
  'linePostCost',
  'terminalPostCost',
  'walkGateCost',
  'driveGateCost',
  'concretePerPost',
  'hoursPerLf',
  'hoursPerPost',
  'hoursPerWalkGate',
  'hoursPerDriveGate',
]);

function pick(object, keys) {
  const out = {};
  for (const key of keys) {
    const value = object?.[key];
    // A blank field is not the number zero. `proposedPrice` left blank means
    // "no price to compare"; `Number('')` is 0 in JavaScript, so carrying an
    // empty string through would let a shared link silently invent a $0
    // proposed price — or a $0 wage, corner count, or gate cost — the sender
    // never typed.
    if (value === undefined || value === null || value === '') continue;
    out[key] = value;
  }
  return out;
}

export function encodeShare(input) {
  const payload = pick(input || {}, SHARE_FIELDS);
  if (Array.isArray(input?.runs)) {
    const runs = input.runs.map(run => pick(run, RUN_KEYS));
    if (runs.length > 0) payload.runs = runs;
  }
  return encodeURIComponent(JSON.stringify(payload));
}

export function decodeShare(fragment) {
  if (!fragment) return null;
  const raw = String(fragment).replace(/^[#?]/, '');
  if (!raw) return null;
  let parsed;
  try {
    parsed = JSON.parse(decodeURIComponent(raw));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const payload = pick(parsed, SHARE_FIELDS);
  if (Array.isArray(parsed.runs)) {
    const runs = parsed.runs
      .filter(run => run && typeof run === 'object' && !Array.isArray(run))
      .map(run => pick(run, RUN_KEYS));
    if (runs.length > 0) payload.runs = runs;
  }
  if (Object.keys(payload).length === 0) return null;
  return payload;
}
