// Carries the selected jurisdictions into a link a sender can copy and a
// recipient can open to see the same states pre-selected. Deliberately does
// NOT carry the pasted posting text: that text can be long, may contain
// whatever internal wording a draft posting has, and the point of this tool
// is that nothing typed is ever sent anywhere -- putting it in a shareable
// link would contradict that on the one control that intentionally puts
// something into a URL.
//
// The field travels in the URL *fragment* (`#...`), never the query string:
// a fragment is not sent in the request line a server logs, nor in a
// `Referer` header a later click would carry.

export const FIELD_IDS = ["states"];

function usableText(value) {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed === "" ? null : trimmed;
}

export function encodeInputs(input) {
  const params = new URLSearchParams();
  const value = usableText(input?.states);
  if (value !== null) params.set("states", value);
  return params.toString();
}

export function decodeInputs(source) {
  const params = new URLSearchParams(String(source || "").replace(/^[?#]/, ""));
  const result = {};
  if (params.has("states")) {
    const value = usableText(params.get("states"));
    if (value !== null) result.states = value;
  }
  return result;
}

// The states field clears to '' when a link omits it -- a recipient's own
// typed-in selection does not survive under the sender's link.
export function formValues(decoded) {
  return { states: decoded?.states ?? "Colorado" };
}
