// Event filters: forward only the events a route (or one fan-out target) wants.
//   {"path":"type","in":["invoice.paid","customer.*"]}      JSON body field, dotted path
//   {"header":"x-github-event","in":["push","release"]}      request header
// A filter may be one condition or an array (all must hold). `in` entries match
// exactly, or by prefix when they end in "*". A body that is not JSON, or a
// missing field, does not match. Add "not": true to invert a condition.
export function validateFilter(f, where = "filter") {
  const list = Array.isArray(f) ? f : [f];
  if (!list.length) throw new Error(`${where}: empty filter`);
  for (const c of list) {
    if (!c || typeof c !== "object") throw new Error(`${where}: each condition must be an object`);
    if (Boolean(c.path) === Boolean(c.header)) throw new Error(`${where}: give exactly one of "path" or "header"`);
    if (!Array.isArray(c.in) || !c.in.length || !c.in.every((s) => typeof s === "string" && s)) throw new Error(`${where}: "in" must be a non-empty array of strings`);
  }
  return list;
}

const hit = (value, patterns) => patterns.some((p) => (p.endsWith("*") ? value.startsWith(p.slice(0, -1)) : value === p));

function pick(obj, path) {
  let cur = obj;
  for (const k of path.split(".")) {
    if (cur === null || typeof cur !== "object" || !(k in cur)) return undefined;
    cur = cur[k];
  }
  return cur;
}

export function matches(filter, { headers, bodyText }) {
  if (!filter) return true;
  let json; let parsed = false;
  return validateFilter(filter).every((c) => {
    let value;
    if (c.header) value = headers[c.header.toLowerCase()];
    else {
      if (!parsed) { parsed = true; try { json = JSON.parse(bodyText); } catch { json = undefined; } }
      value = pick(json, c.path);
    }
    const ok = (typeof value === "string" || typeof value === "number" || typeof value === "boolean") && hit(String(value), c.in);
    return c.not ? !ok : ok;
  });
}
