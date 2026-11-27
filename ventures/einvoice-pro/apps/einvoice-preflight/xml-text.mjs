// Lexical helpers for the sniffers and pre-checks that look at raw XML text before (or
// instead of) parsing it. Added 2026-11-26.
//
// stripXmlNoise reads the text left to right the way an XML parser does: a comment runs from
// `<!--` to its first `-->`, a CDATA section from `<![CDATA[` to its first `]]>`, a processing
// instruction from `<?` to its first `?>`. Each is removed whole, and one with no terminator runs
// to the end of the text (a parser would stop there too), so no `<!--` is ever left behind. A
// `<!--` inside CDATA is CDATA text, not a comment, and the reverse; one pass with a regex per
// kind, one after the other, got that wrong.

const KINDS = { comment: ["<!--", "-->"], cdata: ["<![CDATA[", "]]>"], pi: ["<?", "?>"] };

/**
 * Remove comments (always), and CDATA sections and processing instructions when asked.
 * @param {string} text
 * @param {{ cdata?: boolean, pi?: boolean }} [opts]
 * @returns {string}
 */
export function stripXmlNoise(text, { cdata = false, pi = false } = {}) {
  const s = String(text);
  const kinds = [KINDS.comment];
  if (cdata) kinds.push(KINDS.cdata);
  if (pi) kinds.push(KINDS.pi);
  let out = "";
  let from = 0;
  let at = s.indexOf("<");
  while (at !== -1) {
    const kind = kinds.find(([open]) => s.startsWith(open, at));
    if (!kind) {
      at = s.indexOf("<", at + 1);
      continue;
    }
    out += s.slice(from, at);
    const end = s.indexOf(kind[1], at + kind[0].length);
    if (end === -1) return out;
    from = end + kind[1].length;
    at = s.indexOf("<", from);
  }
  return out + s.slice(from);
}

/**
 * Whether the text declares `uri` as a namespace: some xmlns or xmlns:prefix attribute whose
 * value is exactly that URI (a sniffer's substring test would also take
 * `http://example.com/?http://www.portalfiscal.inf.br/nfe` or the URI in a comment).
 * @param {string} text
 * @param {string} uri
 */
export function declaresNamespace(text, uri) {
  for (const m of String(text).matchAll(/\sxmlns(?::[A-Za-z_][\w.-]*)?\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    if ((m[1] ?? m[2]) === uri) return true;
  }
  return false;
}
