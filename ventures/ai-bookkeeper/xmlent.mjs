// XML/SGML character references in bank files, decoded in one pass so that
// "&amp;lt;" stays "&lt;" and "&#35;" / "&#x23;" become "#". Unknown names and
// out-of-range numbers are left as written.
const NAMED = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
export function decodeEntities(s) {
  return String(s).replace(/&(?:#(\d{1,7})|#[xX]([0-9a-fA-F]{1,6})|([a-zA-Z]+));/g, (m, dec, hex, name) => {
    if (name) return NAMED[name] ?? m;
    const cp = dec !== undefined ? parseInt(dec, 10) : parseInt(hex, 16);
    return cp > 0 && cp <= 0x10ffff && !(cp >= 0xd800 && cp <= 0xdfff) ? String.fromCodePoint(cp) : m;
  });
}
