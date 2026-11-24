// A photographer's keyword list (controlled vocabulary), for the cull page.
//
// Lightroom Classic exports its keyword tree with Metadata › Export Keywords
// as a plain text file, and Photo Mechanic's Structured Keywords read and
// write the same layout, so a desk that keeps its vocabulary in either
// program has this file already:
//
//   Sport                one keyword per line
//   \tIce hockey         one tab deeper per level: a child of the line above
//   \t\t{hockey}         {braces}: a synonym of the keyword it sits under
//   [People]             [brackets]: kept in the tree, not written as a keyword
//   \tJane Roe              (Lightroom's "Include on Export" turned off)
//
// With a list loaded, a typed keyword is looked up in it: "Ice hockey" (or
// its synonym "hockey") becomes the full path "Sport|Ice hockey", so the
// sidecar carries the same tree the catalogue has. A name that sits under two
// parents is left as typed and reported, as is a name the list lacks, so a
// typo or a new keyword shows before the sidecars go out. The keywords a shoot
// used can be written back in the same layout for Metadata › Import Keywords.
//
// The rules for what goes into dc:subject are this module's, chosen to match
// Lightroom's defaults (export containing keywords and synonyms; bracketed
// keywords not exported): every exported level of the path, plus the
// keyword's synonyms. lr:hierarchicalSubject gets the full path, bracketed
// levels included, so the tree survives a round trip. No dependencies.

import { normalizeKeyword, splitKeywords } from "./iptc.mjs";

const lc = (s) => s.toLowerCase();

/**
 * The keyword list in `text`. Returns { nodes, notes } where each node is
 * { name, path ("Sport|Ice hockey"), exported, synonyms: [] } in file order
 * and `notes` lists the lines read some other way than written
 * ({ line, text, reason }). A BOM, CRLF line ends and blank lines are fine.
 * Lines indented with spaces only are read as one level per indent step when
 * the file has no tabs at all.
 */
export function parseKeywordList(text) {
  const lines = String(text ?? "").replace(/^﻿/, "").split(/\r\n|\r|\n/);
  const anyTab = lines.some((l) => /^\t/.test(l));
  // Space-indented files: the smallest indent step found is one level.
  let step = 0;
  if (!anyTab) for (const l of lines) { const n = /^ */.exec(l)[0].length; if (n && l.trim() && (!step || n < step)) step = n; }
  const nodes = [], notes = [], stack = [], byPath = new Map();
  lines.forEach((raw, i) => {
    if (!raw.trim()) return;
    const ind = anyTab ? /^\t*/.exec(raw)[0].length : step ? Math.floor(/^ */.exec(raw)[0].length / step) : 0;
    let s = raw.trim();
    const line = i + 1;
    if (/^\{.*\}$/.test(s)) {
      const syn = s.slice(1, -1).trim();
      const owner = stack[Math.min(ind, stack.length) - 1];
      if (!owner) { notes.push({ line, text: s, reason: "a synonym with no keyword above it: skipped" }); return; }
      if (syn && !owner.synonyms.some((x) => lc(x) === lc(syn))) owner.synonyms.push(syn);
      return;
    }
    let exported = true;
    if (/^\[.*\]$/.test(s)) { exported = false; s = s.slice(1, -1).trim(); }
    // "|" separates levels in lr:hierarchicalSubject, so it cannot be inside a name.
    const name = s.replace(/\|/g, "/").replace(/\s+/g, " ").trim();
    if (!name) return;
    if (name !== s) notes.push({ line, text: s, reason: `read as "${name}"` });
    let depth = ind;
    if (depth > stack.length) { notes.push({ line, text: s, reason: `indented ${depth - stack.length} level(s) past its parent: read as a child of "${stack.at(-1)?.name ?? "(top)"}"` }); depth = stack.length; }
    stack.length = depth;
    const path = [...stack.map((n) => n.name), name].join("|");
    let node = byPath.get(lc(path));
    if (node) { if (!exported) node.exported = false; }
    else { node = { name, path, exported, synonyms: [] }; byPath.set(lc(path), node); nodes.push(node); }
    stack.push(node);
  });
  return { nodes, notes };
}

/** A lookup over parsed nodes: by name, by synonym and by full path, case ignored. */
export function keywordVocabulary(list) {
  const nodes = Array.isArray(list) ? list : list?.nodes || [];
  const byName = new Map(), bySyn = new Map(), byPath = new Map();
  const add = (m, k, n) => { const a = m.get(k); if (!a) m.set(k, [n]); else if (!a.includes(n)) a.push(n); };
  for (const n of nodes) {
    add(byName, lc(n.name), n);
    byPath.set(lc(n.path), n);
    for (const s of n.synonyms) add(bySyn, lc(s), n);
  }
  return { nodes, byName, bySyn, byPath, size: nodes.length };
}

/**
 * Typed keywords looked up in a vocabulary. A flat keyword that names one
 * keyword (or failing that, one synonym) becomes its full path; a typed path
 * becomes the one keyword whose path ends with it ("Ice hockey|Final" ->
 * "Sport|Ice hockey|Final"). Returns { keywords, synonyms, hidden, unknown,
 * ambiguous }: `keywords` the list to write (paths where found, the rest as
 * typed), `synonyms` to add to the flat keywords, `hidden` the names of
 * levels that are not exported, `unknown` keywords the list lacks, and
 * `ambiguous` [{ typed, paths }] for names under more than one parent.
 */
export function resolveKeywords(list, vocab) {
  const kws = splitKeywords(list);
  const out = { keywords: [], synonyms: [], hidden: [], unknown: [], ambiguous: [] };
  if (!vocab || !vocab.size) return { ...out, keywords: kws };
  const used = [];
  for (const k of kws) {
    const key = lc(normalizeKeyword(k));
    let hits;
    if (key.includes("|")) {
      const exact = vocab.byPath.get(key);
      hits = exact ? [exact] : vocab.nodes.filter((n) => lc(n.path).endsWith(`|${key}`));
    } else {
      hits = vocab.byName.get(key) || vocab.bySyn.get(key) || [];
    }
    if (hits.length === 1) { out.keywords.push(hits[0].path); used.push(hits[0]); continue; }
    out.keywords.push(k);
    if (hits.length > 1) out.ambiguous.push({ typed: k, paths: hits.map((n) => n.path) });
    else out.unknown.push(k);
  }
  for (const n of used) {
    out.synonyms.push(...n.synonyms);
    // Every level of the path that is not exported, looked up by its own path.
    const parts = n.path.split("|");
    for (let i = 1; i <= parts.length; i++) {
      const lvl = vocab.byPath.get(lc(parts.slice(0, i).join("|")));
      if (lvl && !lvl.exported) out.hidden.push(lvl.name);
    }
  }
  out.keywords = splitKeywords(out.keywords);
  out.synonyms = splitKeywords(out.synonyms);
  // A name hidden on one path but exported as a keyword of its own elsewhere stays.
  const shown = new Set(used.filter((n) => n.exported).map((n) => lc(n.name)));
  out.hidden = splitKeywords(out.hidden).filter((h) => !shown.has(lc(h)));
  return out;
}

/**
 * A keyword list in Lightroom's export layout for `paths` ("Sport|Ice
 * hockey", flat keywords too): every level once, children under parents in
 * first-seen order, tab indented. Levels found in `vocab` keep their
 * [brackets] and {synonyms}, so writing back a loaded list loses nothing.
 */
export function keywordListText(paths, vocab = null) {
  const root = { kids: new Map() };
  for (const p of splitKeywords(paths)) {
    let at = root;
    for (const part of p.split("|")) {
      const k = lc(part);
      if (!at.kids.has(k)) at.kids.set(k, { name: part, kids: new Map(), path: at.path ? `${at.path}|${part}` : part });
      at = at.kids.get(k);
    }
  }
  const lines = [];
  const walk = (node, depth) => {
    for (const kid of node.kids.values()) {
      const v = vocab?.byPath.get(lc(kid.path));
      const tabs = "\t".repeat(depth);
      lines.push(tabs + (v && !v.exported ? `[${kid.name}]` : kid.name));
      for (const s of v?.synonyms || []) lines.push(`${tabs}\t{${s}}`);
      walk(kid, depth + 1);
    }
  };
  walk(root, 0);
  return lines.length ? lines.join("\n") + "\n" : "";
}
