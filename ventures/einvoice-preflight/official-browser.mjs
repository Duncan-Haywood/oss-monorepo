// In-browser run of the official Schematron: no server needed. The page loads
// Saxon-JS's browser runtime and the compiled SEF files from ./browser/, which
// `node build-browser.mjs` puts next to the page on YOUR host. Neither ships in
// the repository: Saxon-JS's licence forbids copying it to a site whose main
// purpose is to hand it to third parties, so each deployer fetches their own.
// Without ./browser/ the page falls back to ./plain/ (plain-schematron.mjs): the
// same rules as JSON, run by fontoxpath (MIT), which does ship in the
// repository and so works on any static host, this one included. With neither,
// every call returns "unavailable", never a pass.
import { FILES, detectSyntax, matchingAddons, parseSvrl, plainOnlySets } from "./schematron-core.mjs";
import { PLAIN_DIR, createPlainRunner } from "./plain-schematron.mjs";

export const BROWSER_DIR = "browser/";

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const el = document.createElement("script");
    el.src = src;
    el.onload = resolve;
    el.onerror = () => reject(new Error(`cannot load ${src}`));
    document.head.appendChild(el);
  });
}

// The shipped plain-JS route: rules from ./plain/, fontoxpath imported from there.
// `parseXml` and `importFn` are injectable for tests.
export async function loadPlainRunner({ base = "", fetchFn = globalThis.fetch, importFn = (url) => import(url), parseXml = defaultParse } = {}) {
  let runner;
  try {
    const res = await fetchFn(`${base}${PLAIN_DIR}manifest.json`);
    if (!res.ok) return null;
    const fontoxpath = await importFn(new URL(`${base}${PLAIN_DIR}fontoxpath.esm.js`, globalThis.location?.href ?? "file:///").href);
    runner = createPlainRunner({ fontoxpath, parseXml });
  } catch {
    return null;
  }
  const cache = new Map();
  const load = (file) => {
    if (!cache.has(file)) {
      cache.set(file, fetchFn(`${base}${PLAIN_DIR}${file}`).then((r) => (r.ok ? r.json() : null)).catch(() => null));
    }
    return cache.get(file);
  };
  return (xml) => runner.run(xml, load);
}

function defaultParse(xml) {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) throw new Error("not well-formed XML");
  return doc;
}

// Resolves to an async (xml) => { status, syntax, findings, sets } runner, or
// null when this host has neither a ./browser/ folder nor ./plain/. With Saxon present,
// a file whose rule sets have no Saxon form (PINT, ZATCA, the national add-ons) still
// goes to ./plain/; `plainRunner` (a function returning that runner or null) is
// injectable for tests.
export async function loadBrowserRunner({ base = "", fetchFn = globalThis.fetch, load = loadScript, saxon = () => globalThis.SaxonJS, plain = true, plainRunner } = {}) {
  let manifest;
  try {
    const res = await fetchFn(`${base}${BROWSER_DIR}manifest.json`);
    if (!res.ok) return plain ? loadPlainRunner({ base, fetchFn }) : null;
    manifest = await res.json();
    if (!saxon()) await load(`${base}${BROWSER_DIR}SaxonJS2.rt.js`);
  } catch {
    return plain ? loadPlainRunner({ base, fetchFn }) : null;
  }
  if (!saxon()) return plain ? loadPlainRunner({ base, fetchFn }) : null;
  const has = (file) => manifest.files?.includes(file);

  const transform = async (file, xml, source) => {
    const out = await saxon().transform({ stylesheetLocation: `${base}${BROWSER_DIR}${file}`, sourceText: xml, destination: "serialized" }, "async");
    return parseSvrl(out.principalResult, source);
  };

  let plainPromise;
  const getPlain = () => {
    if (!plain) return null;
    plainPromise ??= Promise.resolve(plainRunner ? plainRunner() : loadPlainRunner({ base, fetchFn }));
    return plainPromise;
  };

  return async function run(xml) {
    const syntax = detectSyntax(xml);
    const plainOnly = plainOnlySets(xml, syntax);
    if (plainOnly.length) {
      // Never the EU base alone in their place: the plain route, or "unavailable".
      const runPlain = await getPlain();
      return runPlain ? runPlain(xml) : { status: "unavailable", syntax, findings: [], sets: [], plainOnly };
    }
    if (!syntax || !has(FILES[syntax])) return { status: "unavailable", syntax, findings: [], sets: [] };
    const findings = await transform(FILES[syntax], xml, "en16931-schematron");
    const sets = ["en16931"];
    const seen = new Set(findings.map((f) => `${f.rule}|${f.path}`));
    for (const [name, addon] of matchingAddons(xml, syntax)) {
      if (!has(addon.files[syntax])) continue;
      sets.push(name);
      for (const f of await transform(addon.files[syntax], xml, addon.source)) {
        if (!seen.has(`${f.rule}|${f.path}`)) findings.push(f);
      }
    }
    return { status: "ok", syntax, findings, sets };
  };
}
