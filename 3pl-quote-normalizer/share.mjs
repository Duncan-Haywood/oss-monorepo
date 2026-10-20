// Allowlisted share encoding for the 3PL quote comparison page. A shared link
// must reconstruct the same comparison the sender saw, so only these fields
// ride in the URL fragment; anything else in a crafted fragment is ignored.

export const SHARE_FIELDS = Object.freeze([
  'firstName',
  'secondName',
  'first',
  'second',
  'target',
]);

function pick(object, keys) {
  const out = {};
  for (const key of keys) {
    const value = object?.[key];
    // A blank field is not the number zero: an empty target means "no target
    // set", not a $0 target the sender never typed.
    if (value === undefined || value === null || value === '') continue;
    out[key] = value;
  }
  return out;
}

export function encodeShare(input) {
  const payload = pick(input || {}, SHARE_FIELDS);
  if (Object.keys(payload).length === 0) return '';
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
  if (Object.keys(payload).length === 0) return null;
  return payload;
}
