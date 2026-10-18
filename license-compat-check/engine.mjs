// Deterministic license-compatibility engine. Given the license you ship
// under (or the way you ship: proprietary binary, hosted service, internal
// tool) and a list of your dependencies' declared licenses, it says which
// dependencies are fine, which need a human, and which conflict -- with the
// specific reason and the usual way out. No network call lives here: the same
// logic runs in the browser page and the Node CLI.
//
// This is a rules table, not a legal opinion. It encodes the well-published
// FSF/OSI compatibility positions (GPL-2.0-only vs Apache-2.0 patent terms,
// GPL-3.0 into permissive outbound, AGPL network clause, SSPL/BUSL not being
// open source, and so on) so a maintainer can skim a 600-package tree and
// look only at the handful that matter. Whether any of it applies to your
// facts is a question for counsel; the page and README say so.

export const SEVERITY = { ok: 0, review: 1, conflict: 2 };

// --- license facts ---------------------------------------------------------
// kind: permissive | public-domain | weak-copyleft | strong-copyleft |
//       network-copyleft | source-available | noncommercial | unknown
const T = (kind, extra = {}) => ({ kind, ...extra });

const FACTS = {
  "mit": T("permissive"), "mit-0": T("public-domain"), "isc": T("permissive"),
  "bsd-2-clause": T("permissive"), "bsd-3-clause": T("permissive"), "bsd-4-clause": T("permissive", { adBsd: true }),
  "0bsd": T("public-domain"), "zlib": T("permissive"), "bsl-1.0": T("permissive"), "ncsa": T("permissive"),
  "python-2.0": T("permissive"), "blueoak-1.0.0": T("permissive"), "x11": T("permissive"), "wtfpl": T("public-domain"),
  "apache-1.1": T("permissive"), "apache-2.0": T("permissive", { patent: true }),
  "unlicense": T("public-domain"), "cc0-1.0": T("public-domain"), "cc-by-4.0": T("permissive"), "cc-by-3.0": T("permissive"),
  "lgpl-2.1-only": T("weak-copyleft", { family: "lgpl", v: "2.1" }), "lgpl-2.1-or-later": T("weak-copyleft", { family: "lgpl", v: "2.1", later: true }),
  "lgpl-3.0-only": T("weak-copyleft", { family: "lgpl", v: "3" }), "lgpl-3.0-or-later": T("weak-copyleft", { family: "lgpl", v: "3", later: true }),
  "mpl-2.0": T("weak-copyleft", { family: "mpl", v: "2" }), "mpl-1.1": T("weak-copyleft", { family: "mpl", v: "1.1" }),
  "epl-1.0": T("weak-copyleft", { family: "epl", v: "1" }), "epl-2.0": T("weak-copyleft", { family: "epl", v: "2" }),
  "cddl-1.0": T("weak-copyleft", { family: "cddl", v: "1" }), "cddl-1.1": T("weak-copyleft", { family: "cddl", v: "1.1" }),
  "gpl-2.0-only": T("strong-copyleft", { family: "gpl", v: "2" }), "gpl-2.0-or-later": T("strong-copyleft", { family: "gpl", v: "2", later: true }),
  "gpl-3.0-only": T("strong-copyleft", { family: "gpl", v: "3" }), "gpl-3.0-or-later": T("strong-copyleft", { family: "gpl", v: "3", later: true }),
  "agpl-3.0-only": T("network-copyleft", { family: "agpl", v: "3" }), "agpl-3.0-or-later": T("network-copyleft", { family: "agpl", v: "3", later: true }),
  "sspl-1.0": T("source-available", { family: "sspl" }), "busl-1.1": T("source-available", { family: "busl" }),
  "elastic-2.0": T("source-available", { family: "elastic" }), "rsal-2.0": T("source-available", { family: "rsal" }),
  "fsl-1.1-mit": T("source-available", { family: "fsl" }), "fsl-1.1-apache-2.0": T("source-available", { family: "fsl" }),
  "polyform-noncommercial-1.0.0": T("noncommercial"), "cc-by-nc-4.0": T("noncommercial"), "cc-by-nc-sa-4.0": T("noncommercial"),
  "cc-by-sa-4.0": T("weak-copyleft", { family: "ccsa", v: "4" }),
};

// Common non-SPDX spellings seen in package.json / pip-licenses output.
const ALIASES = [
  [/^(the )?mit( license)?$/, "mit"], [/^(the )?apache(-| )?(license,? )?(version )?2(\.0)?( license)?$/, "apache-2.0"],
  [/^apache license,? version 2\.0$/, "apache-2.0"], [/^apache software license$/, "apache-2.0"],
  [/^bsd$/, "bsd-3-clause"], [/^bsd license$/, "bsd-3-clause"], [/^new bsd( license)?$/, "bsd-3-clause"], [/^simplified bsd( license)?$/, "bsd-2-clause"],
  [/^bsd-3$/, "bsd-3-clause"], [/^bsd-2$/, "bsd-2-clause"],
  [/^gpl-?2(\.0)?\+$/, "gpl-2.0-or-later"], [/^gpl-?3(\.0)?\+$/, "gpl-3.0-or-later"],
  [/^gpl-?2(\.0)?$/, "gpl-2.0-only"], [/^gpl-?3(\.0)?$/, "gpl-3.0-only"], [/^gplv2$/, "gpl-2.0-only"], [/^gplv3$/, "gpl-3.0-only"], [/^gplv2\+$/, "gpl-2.0-or-later"], [/^gplv3\+$/, "gpl-3.0-or-later"],
  [/^gnu general public license v2 \(gplv2\)$/, "gpl-2.0-only"], [/^gnu general public license v3 \(gplv3\)$/, "gpl-3.0-only"],
  [/^lgpl-?2\.1(\+)?$/, "lgpl-2.1-only"], [/^lgpl-?3(\.0)?(\+)?$/, "lgpl-3.0-only"],
  [/^gnu lesser general public license v3 \(lgplv3\)$/, "lgpl-3.0-only"],
  [/^agpl-?3(\.0)?(\+)?$/, "agpl-3.0-only"], [/^mozilla public license 2\.0 \(mpl 2\.0\)$/, "mpl-2.0"], [/^mpl-?2(\.0)?$/, "mpl-2.0"],
  [/^bsl-1\.1$/, "busl-1.1"], [/^sspl$/, "sspl-1.0"], [/^isc license( \(iscl\))?$/, "isc"], [/^public domain$/, "unlicense"],
  [/^cc0$/, "cc0-1.0"], [/^python software foundation license$/, "python-2.0"],
];

const SUFFIX_ONLY = /^(gpl|lgpl|agpl)-(\d(?:\.\d)?)(\.0)?$/;

/** Normalises one license id to a key in FACTS, or null if unrecognised. */
export function normalizeId(raw) {
  let s = String(raw ?? "").trim().toLowerCase().replace(/^\(|\)$/g, "").trim();
  if (!s) return null;
  if (FACTS[s]) return s;
  if (s.endsWith("+")) {
    const base = normalizeId(s.slice(0, -1));
    if (base && base.endsWith("-only")) return base.replace(/-only$/, "-or-later");
    if (base && FACTS[`${base}-or-later`]) return `${base}-or-later`;
  }
  for (const [re, id] of ALIASES) if (re.test(s)) return id;
  const m = SUFFIX_ONLY.exec(s);
  if (m) return `${m[1]}-${m[2].includes(".") ? m[2] : `${m[2]}.0`}-only`;
  return null;
}

// --- SPDX-style expression parsing ----------------------------------------
// Supports `A OR B`, `A AND B`, `A WITH exception`, parentheses, and the
// legacy `A/B` and `A, B` (read as OR, which is what package.json authors
// who write "MIT/Apache-2.0" mean).
function tokenize(expr) {
  return String(expr).replace(/\(/g, " ( ").replace(/\)/g, " ) ").replace(/\s+\/\s+/g, " OR ").split(/\s+/).filter(Boolean);
}

export function parseExpression(expr) {
  const src = String(expr ?? "").trim();
  if (!src) return { type: "id", raw: "", id: null };
  // Whole-string alias first: "Apache License, Version 2.0" must not split on the comma.
  const whole = normalizeId(src);
  if (whole) return { type: "id", raw: src, id: whole };
  const toks = tokenize(src.includes(" OR ") || src.includes(" AND ") || src.includes(" WITH ") || src.includes("(") || /\w\/\w/.test(src) ? src.replace(/(\w)\/(\w)/g, "$1 OR $2") : src);
  let i = 0;
  const peek = () => toks[i];
  const parseOr = () => {
    let left = parseAnd();
    while (peek() && peek().toUpperCase() === "OR") { i += 1; left = { type: "or", left, right: parseAnd() }; }
    return left;
  };
  const parseAnd = () => {
    let left = parseWith();
    while (peek() && peek().toUpperCase() === "AND") { i += 1; left = { type: "and", left, right: parseWith() }; }
    return left;
  };
  const parseWith = () => {
    const atom = parseAtom();
    if (peek() && peek().toUpperCase() === "WITH") { i += 1; const exception = toks[i++] || ""; return { type: "with", base: atom, exception }; }
    return atom;
  };
  const parseAtom = () => {
    const t = toks[i++];
    if (t === "(") { const inner = parseOr(); if (peek() === ")") i += 1; return inner; }
    if (t === undefined) return { type: "id", raw: "", id: null };
    return { type: "id", raw: t, id: normalizeId(t) };
  };
  const tree = parseOr();
  if (i < toks.length) return { type: "id", raw: src, id: null }; // could not parse: treat as unknown
  return tree;
}

// --- distribution context ---------------------------------------------------
export const CONTEXTS = {
  "proprietary-distributed": "Closed-source product you ship to customers (desktop app, mobile app, firmware, on-prem install, Docker image)",
  "saas": "Hosted service: users reach it over the network, you never hand over the code or a binary",
  "internal": "Internal tools only: nothing is distributed outside your organization",
  "mit": "Open source under MIT", "bsd-3-clause": "Open source under BSD-3-Clause", "isc": "Open source under ISC",
  "apache-2.0": "Open source under Apache-2.0",
  "mpl-2.0": "Open source under MPL-2.0",
  "lgpl-3.0-or-later": "Open source under LGPL-3.0-or-later",
  "gpl-2.0-only": "Open source under GPL-2.0-only (e.g. Linux-kernel style)",
  "gpl-2.0-or-later": "Open source under GPL-2.0-or-later",
  "gpl-3.0-or-later": "Open source under GPL-3.0-or-later",
  "gpl-3.0-only": "Open source under GPL-3.0-only",
  "agpl-3.0-or-later": "Open source under AGPL-3.0-or-later",
};

const isOss = (ctx) => !["proprietary-distributed", "saas", "internal"].includes(ctx);

const mk = (verdict, reason, fix = "") => ({ verdict, reason, fix });
const OK = (reason = "No restriction beyond keeping the copyright and license notice.", fix = "") => mk("ok", reason, fix);

// --- one license id against one context --------------------------------------
function judgeId(id, ctx, { linking = "bundled", modified = false } = {}) {
  const f = FACTS[id];
  const dyn = linking === "dynamic";
  if (!f) return mk("review", "License not recognised by this tool.", "Read the license text; if it is not an OSI-approved license, treat it as proprietary terms.");
  const k = f.kind;
  if (k === "public-domain") return OK("Public-domain-equivalent: no conditions.");
  if (k === "noncommercial") {
    return ctx === "internal"
      ? mk("review", "Non-commercial terms: internal use inside a for-profit company is usually still commercial use.", "Get a commercial license or replace the dependency.")
      : mk("conflict", "Non-commercial license: incompatible with commercial use or with any open-source outbound license.", "Replace the dependency or buy a commercial license from the author.");
  }
  if (ctx === "proprietary-distributed") {
    if (k === "permissive") return OK("Permissive: ship it, keep the notice (and the NOTICE file for Apache-2.0).");
    if (id.startsWith("gpl") || id.startsWith("agpl")) return mk("conflict", `${id.toUpperCase()} requires the whole combined work to be released under the same license when you distribute it.`, "Replace it, run it as a separate program (arm's length), buy a commercial license from the copyright holder, or open-source your product.");
    if (f.family === "lgpl") return dyn ? OK("LGPL, dynamically linked: allowed. Ship the license text, the library's source offer, and let users swap the library.") : mk("review", "LGPL linked statically/bundled: you must let users relink with a modified library (provide object files or use dynamic linking).", "Switch to dynamic linking or ship relinkable objects.");
    if (f.family === "mpl" || f.family === "epl" || f.family === "cddl") return OK("File-level copyleft: you may ship it in a closed product, but changes to those files must be published under the same license.");
    if (f.family === "ccsa") return mk("review", "ShareAlike applies to adaptations of the material; fine for unmodified assets with attribution.", "Do not modify and re-license; keep attribution.");
    if (f.family === "sspl") return mk("conflict", "SSPL is not an open-source license and its service clause is aimed at anyone offering the software to others.", "Use a pre-SSPL fork (e.g. Valkey for Redis, OpenSearch for Elasticsearch) or buy a commercial license.");
    return mk("review", `${id.toUpperCase()} is source-available, not open source: field-of-use or competing-product limits apply.`, "Read the additional-use grant; many allow internal and non-competing use but not reselling the software itself.");
  }
  if (ctx === "saas") {
    if (k === "permissive") return OK("Permissive: fine for a hosted service, keep notices where you distribute client code.");
    if (id.startsWith("agpl")) return modified ? mk("conflict", "AGPL §13: if you modify it and users interact with it over a network, you must offer them the corresponding source.", "Do not modify it, publish your modifications, or buy a commercial license.") : mk("review", "AGPL network clause: unmodified use is fine, but any local change you serve to users triggers a source-offer duty.", "Keep it unmodified or isolate it behind an API boundary.");
    if (id.startsWith("gpl")) return OK("GPL's source duty is triggered by distribution; a hosted service does not distribute. (Anything you ship to the browser or a customer does.)");
    if (f.family === "lgpl" || f.kind === "weak-copyleft") return OK("Copyleft triggers on distribution, which a hosted service does not do.");
    if (f.family === "sspl") return mk("conflict", "SSPL §13: offering the software's functionality to third parties as a service requires releasing your whole service stack under SSPL.", "Use a pre-SSPL fork or a commercial license.");
    if (f.family === "fsl") return mk("review", "Functional Source License: you may not offer a competing product; otherwise fine until it converts to MIT/Apache.", "Confirm you are not competing with the licensor.");
    return mk("review", `${id.toUpperCase()} restricts offering it as a service or in competition with the licensor.`, "Read the additional-use grant, or use a community fork.");
  }
  if (ctx === "internal") {
    if (k === "source-available" && f.family === "busl") return mk("review", "BUSL allows non-production use freely; production use needs the licensor's Additional Use Grant.", "Check the grant for your use.");
    return OK("Internal-only use: no distribution, so copyleft duties are not triggered.");
  }
  return judgeOutbound(id, f, ctx, { dyn });
}

// outbound is an open-source license id
function judgeOutbound(id, f, out, { dyn }) {
  const o = FACTS[out];
  const k = f.kind;
  if (id === out) return OK("Same license as your project.");
  if (k === "source-available") return mk("conflict", `${id.toUpperCase()} is not an open-source license; it cannot be combined into a project you release as ${out.toUpperCase()}.`, "Replace it or use a community fork under an OSI license.");
  if (k === "permissive") {
    if (id === "apache-2.0" && out === "gpl-2.0-only") return mk("conflict", "Apache-2.0's patent-termination terms are incompatible with GPL-2.0-only (FSF position).", "Relicense your project to GPL-2.0-or-later or GPL-3.0, or replace the dependency.");
    if (id === "apache-2.0" && out === "lgpl-2.1-only") return mk("conflict", "Apache-2.0 is incompatible with LGPL-2.1-only.", "Move to LGPL-3.0 or replace the dependency.");
    if (f.adBsd) return mk("review", "BSD-4-Clause's advertising clause is incompatible with GPL.", "Check for a BSD-3 re-grant, or replace.");
    return OK("Permissive code can go into any open-source project; keep its notice.");
  }
  if (k === "weak-copyleft" && f.family === "ccsa") return mk(o.kind === "permissive" ? "review" : "conflict", "CC-BY-SA is meant for content, not code; it is not GPL-compatible in the code direction before v4 and one-way after.", "Keep it as separate assets rather than linking into code.");
  const outPermissive = o.kind === "permissive" || o.kind === "public-domain";
  if (f.family === "gpl" || f.family === "agpl") {
    if (outPermissive || o.family === "mpl" || o.family === "lgpl" || o.family === "epl" || o.family === "cddl") {
      return mk("conflict", `${id.toUpperCase()} is strong copyleft: a combined work must be released under GPL/AGPL, not ${out.toUpperCase()}.`, `Relicense your project to ${f.family === "agpl" ? "AGPL-3.0" : "GPL"}, remove the dependency, or isolate it as a separate program.`);
    }
    if (f.family === "agpl") {
      if (o.family === "agpl") return OK("AGPL-3.0 into AGPL-3.0.");
      if (o.family === "gpl" && o.v === "3") return OK("GPL-3.0 §13 explicitly allows combining with AGPL-3.0; the AGPL network clause applies to the combined work.");
      return mk("conflict", "AGPL-3.0 cannot be combined into a GPL-2.0-only project.", "Move your project to GPL-3.0 or AGPL-3.0.");
    }
    if (o.family === "gpl" || o.family === "agpl") {
      const inV = f.v;
      if (inV === "2" && !f.later) return o.v === "2" ? OK("GPL-2.0-only into GPL-2.0.") : mk("conflict", "GPL-2.0-only code cannot be combined into a GPL-3.0 or AGPL project (no 'or later' grant).", "Ask for an or-later grant, replace it, or keep your project on GPL-2.0-only.");
      if (inV === "3" && o.v === "2" && !o.later) return mk("conflict", "GPL-3.0 code cannot be combined into a GPL-2.0-only project.", "Release your project as GPL-3.0-or-later or replace the dependency.");
      return OK("GPL family combination is allowed; the combined work follows the stricter terms.");
    }
  }
  if (f.family === "lgpl") {
    if (outPermissive) return dyn ? mk("review", "LGPL into a permissively-licensed project: ok if kept as a separately replaceable library, but your project's users inherit LGPL duties on that library.", "Document the LGPL dependency in your NOTICE; link dynamically.") : mk("review", "LGPL bundled into a permissive project: downstream users must be able to relink or replace the library.", "Document it in NOTICE and prefer dynamic linking.");
    return OK("LGPL combines with copyleft outbound licenses.");
  }
  if (f.family === "mpl") {
    if (f.v === "1.1" && (o.family === "gpl" || o.family === "agpl" || o.family === "lgpl")) return mk("conflict", "MPL-1.1 is not GPL-compatible.", "Use MPL-2.0 (which adds a secondary-license clause) or replace.");
    return OK("MPL-2.0 files stay under MPL (file-level copyleft); the rest of your project keeps its license.");
  }
  if (f.family === "epl" || f.family === "cddl") {
    if (o.family === "gpl" || o.family === "agpl" || o.family === "lgpl") return mk("conflict", `${id.toUpperCase()} is not GPL-compatible unless the author named a GPL secondary license.`, "Look for a GPL secondary-license notice, or replace the dependency.");
    return OK("File-level copyleft stays on those files.");
  }
  return mk("review", "Combination not covered by this tool's rules.", "Read both license texts.");
}

// --- expression against context -----------------------------------------------
function judgeNode(node, ctx, opts) {
  if (node.type === "id") {
    if (!node.id) return { ...mk("review", node.raw ? `"${node.raw}" is not a recognised license identifier.` : "No license declared: with no license, default copyright applies and you have no right to use or ship it.", "Contact the author or replace the package. Never assume 'no license' means free to use."), chosen: node.raw || "UNKNOWN" };
    return { ...judgeId(node.id, ctx, opts), chosen: node.id };
  }
  if (node.type === "with") {
    const baseId = node.base.id;
    const ex = node.exception.toLowerCase();
    if (baseId && /classpath|gcc|linking|llvm|openssl|autoconf|font|bison|libtool/.test(ex)) {
      if (/llvm/.test(ex) || FACTS[baseId]?.kind === "permissive") return { ...judgeId(baseId, ctx, opts), chosen: `${baseId} WITH ${node.exception}` };
      // A linking exception turns GPL into weak-copyleft-for-linking.
      const asLgpl = ctx === "proprietary-distributed" ? OK(`${baseId.toUpperCase()} WITH ${node.exception}: the exception permits linking from non-GPL code. Keep the license text and any source-offer for the library itself.`) : { ...judgeId(baseId, ctx, opts) };
      return { ...asLgpl, chosen: `${baseId} WITH ${node.exception}` };
    }
    return { ...judgeNode(node.base, ctx, opts), chosen: `${baseId || node.base.raw} WITH ${node.exception}` };
  }
  const l = judgeNode(node.left, ctx, opts);
  const r = judgeNode(node.right, ctx, opts);
  if (node.type === "or") {
    // Licensee picks: take the more permissive branch.
    const best = SEVERITY[l.verdict] <= SEVERITY[r.verdict] ? l : r;
    return { ...best, chosen: best.chosen, via: "or" };
  }
  // AND: all apply; worst wins.
  const worst = SEVERITY[l.verdict] >= SEVERITY[r.verdict] ? l : r;
  return { ...worst, chosen: `${l.chosen} AND ${r.chosen}`, via: "and" };
}

// --- snapshot parsing ----------------------------------------------------------
function splitCsvLine(line) {
  const out = []; let cur = ""; let q = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i += 1; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true; else if (c === ",") { out.push(cur.trim()); cur = ""; } else cur += c;
  }
  out.push(cur.trim());
  return out;
}

function normalizeEntry(e) {
  if (!e || typeof e !== "object") return null;
  const get = (...keys) => { for (const k of Object.keys(e)) if (keys.includes(k.toLowerCase())) return e[k]; return undefined; };
  const name = get("name", "package", "module");
  if (!name) return null;
  let license = get("license", "licenses", "licence");
  if (Array.isArray(license)) license = license.map((l) => (l && (l.type || l.name)) || l).filter(Boolean).join(" OR ");
  if (license && typeof license === "object") license = license.type || license.name || "";
  return { name: String(name).trim(), version: String(get("version") ?? "").trim(), license: license ? String(license).trim() : "" };
}

/** Accepts a JSON array ({name,version,license}, pip-licenses' Name/Version/License too) or CSV. */
export function parseSnapshot(text) {
  const raw = String(text ?? "").trim();
  if (!raw) return [];
  let entries;
  if (raw.startsWith("[") || raw.startsWith("{")) {
    let data;
    try { data = JSON.parse(raw); } catch (err) { throw new Error(`not valid JSON (${err.message})`); }
    const list = Array.isArray(data) ? data : data.dependencies || data.packages;
    if (!Array.isArray(list)) throw new Error("expected a JSON array of {name, version, license} objects");
    entries = list.map(normalizeEntry).filter(Boolean);
  } else {
    const rows = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map(splitCsvLine);
    const header = rows[0].map((c) => c.toLowerCase());
    let ni = 0; let vi = 1; let li = 2; let body = rows;
    if (header.some((c) => c.includes("license"))) {
      const find = (n) => header.findIndex((c) => c.includes(n));
      ni = find("name") !== -1 ? find("name") : find("package") !== -1 ? find("package") : 0;
      vi = find("version"); li = find("license"); body = rows.slice(1);
    } else if (rows[0].length < 3) { vi = -1; li = rows[0].length - 1; }
    entries = body.map((c) => normalizeEntry({ name: c[ni], version: vi >= 0 ? c[vi] : "", license: c[li] ?? c[c.length - 1] })).filter(Boolean);
  }
  const byName = new Map();
  for (const e of entries) byName.set(e.name, e);
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

// --- public API ----------------------------------------------------------------
/**
 * Checks every dependency against a context. `project` may be a key of
 * CONTEXTS or any OSS license id this module knows. Options:
 *   linking:  "bundled" (default) | "dynamic"   (matters for LGPL)
 *   modified: boolean                            (matters for AGPL on SaaS)
 *   allow:    string[] of package names you have already cleared
 */
export function checkCompatibility(entries, project, { linking = "bundled", modified = false, allow = [] } = {}) {
  const ctx = normalizeContext(project);
  const allowSet = new Set(allow.map((s) => s.toLowerCase()));
  const results = entries.map((e) => {
    const node = parseExpression(e.license);
    const j = judgeNode(node, ctx, { linking, modified });
    const cleared = allowSet.has(e.name.toLowerCase()) && j.verdict !== "ok";
    return { name: e.name, version: e.version, license: e.license || "(none declared)", ...j, verdict: cleared ? "ok" : j.verdict, cleared };
  });
  const count = (v) => results.filter((r) => r.verdict === v).length;
  const worst = results.reduce((w, r) => Math.max(w, SEVERITY[r.verdict]), 0);
  return {
    project: ctx,
    results,
    counts: { ok: count("ok"), review: count("review"), conflict: count("conflict") },
    status: worst === 2 ? "conflict" : worst === 1 ? "review" : "clear",
  };
}

export function normalizeContext(project) {
  const s = String(project ?? "").trim().toLowerCase();
  if (CONTEXTS[s]) return s;
  const id = normalizeId(s);
  if (id && FACTS[id] && ["permissive", "weak-copyleft", "strong-copyleft", "network-copyleft", "public-domain"].includes(FACTS[id].kind)) return id;
  throw new Error(`unknown project license or context "${project}" (try proprietary-distributed, saas, internal, mit, apache-2.0, gpl-3.0-or-later ...)`);
}

export function summarize(report) {
  const { counts, status } = report;
  const total = report.results.length;
  if (!total) return { status: "empty", text: "No dependencies parsed." };
  if (status === "clear") return { status, text: `All ${total} dependencies look compatible with ${report.project}.` };
  return { status, text: `${counts.conflict} conflict(s), ${counts.review} to review, ${counts.ok} ok of ${total} dependencies, shipping as ${report.project}.` };
}

/** A plain-text THIRD_PARTY_NOTICES body listing every dependency and its license. */
export function noticesText(entries) {
  const lines = ["THIRD-PARTY NOTICES", "", "This product includes the following third-party software:", ""];
  for (const e of entries) lines.push(`- ${e.name}${e.version ? ` ${e.version}` : ""} — ${e.license || "license not declared"}`);
  lines.push("", "Each component is licensed under its own terms; see the component's own LICENSE file for the full text.");
  return lines.join("\n");
}

export const KNOWN_CASES = [
  { id: "GPL-2.0-only + Apache-2.0", note: "The FSF treats Apache-2.0 code as incompatible with GPL-2.0-only; the Linux kernel is the usual example. GPL-3.0 and GPL-2.0-or-later projects can take Apache-2.0 code." },
  { id: "SSPL-1.0 in a SaaS", note: "MongoDB, and since 2021 Elasticsearch/Kibana, relicensed to SSPL; offering them as a service triggers a source release of the whole service stack. Forks (OpenSearch, and Valkey after Redis's 2024 move) exist for that reason." },
  { id: "AGPL-3.0 in a SaaS", note: "The network clause turns 'we only host it' into a source-offer duty for modified versions." },
  { id: "No license declared", note: "Without a license, default copyright applies: you have no permission to use, modify or ship the code." },
];
