// @ts-check
// UFGS sections (SpecsIntact .SEC XML) rendered to the plain text a printed
// UFGS section reads as, with the submittal list the XML itself tags (each
// <ITM> under an "SD-nn" <LST>, "G" in a following <SUB>) as ground truth.
//
// UFGS text is a work of the US Government (17 U.S.C. 105). Nothing from it is
// committed here; the eval reads a folder of .SEC files the user has.
//
// Rendering: editor's notes, the header block and metric alternates are
// dropped; optional text in [brackets] is kept with the brackets removed
// (every option accepted); fill-in blanks print as "____". Articles are
// numbered as SpecsIntact prints them (PART n, n.m, n.m.k).

const decode = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&amp;/g, "&");

/** @returns {{text: string, truth: {sd: string, name: string, g: boolean}[], number: string, title: string}} */
export function renderSec(xml) {
  let s = xml.replace(/<\?xml[^>]*\?>/, "");
  s = s.replace(/<HDR>[\s\S]*?<\/HDR>/g, "").replace(/<NTE>[\s\S]*?<\/NTE>/g, "").replace(/<MET>[\s\S]*?<\/MET>/g, "");
  s = s.replace(/<TAI[^>]*>[\s\S]*?<\/TAI>/g, "");
  const out = [];
  let line = "";
  const flush = (indent = 0) => { if (/[A-Za-z0-9]/.test(line)) out.push(" ".repeat(indent) + line.replace(/\s+/g, " ").trim()); line = ""; };
  let part = 0;
  const counters = [];
  let depth = 0;
  let inTitle = false, titleBuf = "";
  let sd = "";
  let inItm = false, itmStart = 0, itmSubs = [], subDepth = 0, subBuf = "";
  let inLst = false;
  const truth = [];
  let number = "", title = "";
  const re = /<(\/?)([A-Z]+)([^>]*?)(\/?)>|([^<]+)/g;
  let m;
  const stack = [];
  while ((m = re.exec(s))) {
    if (m[5] !== undefined) {
      const t = decode(m[5]).replace(/\r?\n/g, " ");
      if (inTitle) titleBuf += t; else line += t;
      if (subDepth > 0) subBuf += t;
      continue;
    }
    const close = m[1] === "/", tag = m[2], self = m[4] === "/";
    if (self) { if (tag === "BRK") { /* a printed line break: lines are cut at block ends instead */ } continue; }
    if (!close) stack.push(tag); else stack.pop();
    if (tag === "SCN" && close) {
      // A few files' <SCN> hold the bare number; SpecsIntact prints "SECTION" before it.
      number = line.replace(/^\s*(SECTION|DOCUMENT)\s+/i, "").trim();
      if (!/^\s*(SECTION|DOCUMENT)\b/i.test(line)) line = "SECTION " + line.trim();
      flush();
    }
    else if (tag === "STL" && close) { title = line.trim(); flush(); }
    else if (tag === "DTE" && close) flush();
    else if (tag === "PRT" && !close) { flush(); counters.length = 0; depth = 0; }
    else if (tag === "SPT" && !close) { flush(); depth++; counters[depth - 1] = (counters[depth - 1] || 0) + 1; counters.length = depth; sd = ""; }
    else if (tag === "SPT" && close) { flush(); depth = Math.max(0, depth - 1); sd = ""; }
    else if (tag === "TTL" && !close) { flush(); inTitle = true; titleBuf = ""; }
    else if (tag === "TTL" && close) {
      inTitle = false;
      const t = titleBuf.replace(/\s+/g, " ").trim();
      if (stack.includes("SPT")) {
        out.push(""); out.push(`${part}.${counters.slice(0, depth).join(".")}   ${t}`); out.push("");
      } else {
        const pm = t.match(/PART\s+(\d)/i);
        if (pm) part = Number(pm[1]);
        out.push(""); out.push(t); out.push("");
      }
    }
    else if (tag === "TXT" && close) { flush(); out.push(""); }
    else if (tag === "LST" && !close) { flush(); inLst = true; subBuf = ""; }
    else if (tag === "LST" && close) {
      inLst = false;
      const h = line.trim().replace(/[[\]]/g, "").match(/^SD-(\d{2})\b/);
      if (h) sd = `SD-${h[1]}`;
      flush();
    }
    else if (tag === "ITM" && !close) { flush(); inItm = true; itmSubs = []; itmStart = line.length; }
    else if (tag === "ITM" && close) {
      inItm = false;
      if (sd) {
        // What a reader sees: the item's printed text, less the "; G" tail and (LEED ...) tags.
        const printed = line.slice(itmStart).replace(/[[\]]/g, "").replace(/;\s*G\b.*$/, "").replace(/\([^)]*LEED[^)]*\)/g, "").replace(/;\s*$/, "");
        const name = printed.replace(/_{3,}/g, "____").replace(/\s+/g, " ").trim();
        const g = /;\s*G\b/.test(line.slice(itmStart)) || itmSubs.slice(1).some((x) => /^\s*\[?G\b/.test(x));
        if (name) truth.push({ sd, name, g });
      }
      flush(4);
    }
    else if (tag === "SUB" && !close) { if (subDepth === 0) subBuf = ""; subDepth++; }
    else if (tag === "SUB" && close) { subDepth--; if (subDepth === 0 && inItm) itmSubs.push(subBuf); }
    else if ((tag === "ROW" || tag === "TAB" || tag === "REF") && close) flush();
  }
  flush();
  const text = out.join("\n").replace(/[[\]]/g, "").replace(/_{3,}/g, "____").replace(/\n{3,}/g, "\n\n");
  return { text, truth, number, title };
}
