// Allowlisted share encoding for the HVAC maintenance contract calculator.
// A shared link must reconstruct the same annual plan the sender saw --
// silently dropping the callback reserve or target margin is how two
// people compute different monthly prices from the "same" link. Only these
// keys ride in the hash; anything else is ignored so a crafted fragment
// cannot inject unexpected behavior.

export const SHARE_FIELDS = Object.freeze([
  'visits',
  'hours',
  'rate',
  'travel',
  'parts',
  'callbacks',
  'callbackHours',
  'callbackCost',
  'overhead',
  'margin',
  'proposed',
]);

function pick(object, keys) {
  const out = {};
  for (const key of keys) {
    if (object[key] !== undefined) out[key] = object[key];
  }
  return out;
}

export function encodeShare(input) {
  return encodeURIComponent(JSON.stringify(pick(input || {}, SHARE_FIELDS)));
}

export function decodeShare(fragment) {
  if (!fragment) return null;
  const raw = String(fragment).replace(/^#/, '');
  if (!raw) return null;
  let parsed;
  try {
    parsed = JSON.parse(decodeURIComponent(raw));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const payload = pick(parsed, SHARE_FIELDS);
  if (Object.keys(payload).length === 0) return null;
  return payload;
}
