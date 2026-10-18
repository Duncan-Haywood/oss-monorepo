// A team standardizing a call-opening disclosure re-types the same two
// states, company name, and stated purpose every time -- or reads a result
// over chat and lets a colleague retype it by hand. This module carries that
// whole check (both states, plus the disclosure-script fields) into a link a
// sender can copy and a recipient can open to see the exact same requirement
// and script, not a re-derived one.
//
// Nothing here is transmitted. The four fields travel in the URL *fragment*
// (`#...`), never the query string: a fragment is not sent in the request
// line a server logs, nor in a `Referer` header a later click would carry,
// so a shared check stays off the machines it passes through on the way to
// the recipient.

export const FIELD_IDS = ["caller-state", "recipient-state", "script-company", "script-purpose"];

function usableText(value) {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed === "" ? null : trimmed;
}

export function encodeInputs(input) {
  const params = new URLSearchParams();
  for (const id of FIELD_IDS) {
    const value = usableText(input?.[id]);
    if (value !== null) params.set(id, value);
  }
  return params.toString();
}

export function decodeInputs(source) {
  const params = new URLSearchParams(String(source || "").replace(/^[?#]/, ""));
  const result = {};
  for (const id of FIELD_IDS) {
    if (!params.has(id)) continue;
    const value = usableText(params.get(id));
    if (value !== null) result[id] = value;
  }
  return result;
}

// Every field the form owns gets written. The two free-text fields
// (company, purpose) clear to '' when a link omits them, so a recipient's
// own typed-in text does not survive under the sender's link. The two state
// selects have no blank option, so an omitted state falls back to this
// venture's own shipped default (Texas) rather than to '' -- the "falls back
// to the page's own shipped default" case
// platform/ci/check_shared_link_clears.py documents as out of its scope,
// because this page keeps no saved draft for a stale value to hide behind.
export function formValues(decoded) {
  return {
    "caller-state": decoded?.["caller-state"] ?? "Texas",
    "recipient-state": decoded?.["recipient-state"] ?? "Texas",
    "script-company": decoded?.["script-company"] ?? "",
    "script-purpose": decoded?.["script-purpose"] ?? "",
  };
}
