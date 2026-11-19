// The canonical form eval/excel2ids-roundtrip.mjs and eval/excel2ids-sidebyside.mjs
// compare IDS in: canonicalIds with what the Excel2IDS template writes out by its
// own rule treated as the same (see the round trip's header).
import { canonicalIds } from "../sheet.mjs";

export const counts = { upperCased: 0 };
// The canonical tree with the template's written-out defaults applied.
export function normal(text, keepIndex) {
  const t = JSON.parse(canonicalIds(text));
  const specsNode = t.c.find((c) => c.n === "specifications");
  if (specsNode) {
    if (keepIndex) specsNode.c = keepIndex.map((i) => specsNode.c[i]);
    for (const s of specsNode.c) {
      // An empty text attribute is no attribute: a template cell cannot tell them apart.
      for (const k of ["description", "instructions", "identifier"]) if (s.a[k] === "") delete s.a[k];
      if (s.a.ifcVersion) s.a.ifcVersion = s.a.ifcVersion.trim().split(/\s+/).sort().join(" ");
      // An empty <requirements/> asks for nothing, as no <requirements> does (Excel2IDS's tool writes one for a prohibited category).
      s.c = s.c.filter((part) => !(part.n === "requirements" && part.c.length === 0));
      for (const part of s.c) {
        if (part.n === "applicability") {
          // As the checker reads them (ids.mjs): maxOccurs 0 prohibited, minOccurs 0 optional, else required.
          const mn = part.a.minOccurs, mx = part.a.maxOccurs;
          part.a.occurs = mx === "0" ? "prohibited" : mn === "0" ? "optional" : mx === undefined || mx === "unbounded" ? "required" : `${mn}..${mx}`;
          delete part.a.minOccurs; delete part.a.maxOccurs;
        }
        // A one-item string list allows what its value allows; the template writes it plain.
        const oneItem = (n) => {
          for (const k of n.c) oneItem(k);
          n.c = n.c.map((k) => (k.n === "restriction" && (k.a.base ?? "string") === "string" && k.c.length === 1 && k.c[0].n === "enumeration" ? { n: "simpleValue", a: {}, t: k.c[0].a.value, c: [] } : k));
        };
        oneItem(part);
        // IDS entity names are upper case; the reader writes them so.
        if (keepIndex) for (const f of part.c) if (f.n === "entity") for (const nm of f.c) if (nm.n === "name") for (const v of nm.c) {
          if (v.n === "simpleValue" && v.t !== v.t.toUpperCase()) { v.t = v.t.toUpperCase(); counts.upperCased++; }
          if (v.n === "restriction") for (const e of v.c) if (e.n === "enumeration" && e.a.value !== e.a.value.toUpperCase()) { e.a.value = e.a.value.toUpperCase(); counts.upperCased++; }
        }
        if (part.n === "requirements") for (const f of part.c) if (f.n !== "entity" && f.n !== "partOf" && f.a.cardinality === undefined) f.a.cardinality = "required";
        for (const f of part.c) { if (f.a.instructions === "") delete f.a.instructions; f.a = Object.fromEntries(Object.entries(f.a).sort()); }
        // The same facet twice in one part asks for the same thing once.
        if (part.n === "requirements") { const seen = new Set(); part.c = part.c.filter((f) => { const k = JSON.stringify(f); if (seen.has(k)) return false; seen.add(k); return true; }); }
        if (part.n === "applicability" || part.n === "requirements") { part.c.sort((x, y) => (JSON.stringify(x) < JSON.stringify(y) ? -1 : 1)); part.a = Object.fromEntries(Object.entries(part.a).sort()); }
      }
    }
  }
  const info = t.c.find((c) => c.n === "info");
  if (info) { for (const f of info.c) f.t = f.t.trim(); }
  return JSON.stringify(t);
}

