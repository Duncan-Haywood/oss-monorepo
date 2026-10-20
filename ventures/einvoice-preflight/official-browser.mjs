// In-browser run of the official Schematron: no server needed. The page loads
// Saxon-JS's browser runtime and the compiled SEF files from ./browser/, which
// `node build-browser.mjs` puts next to the page on YOUR host. Neither ships in
// the repository: Saxon-JS's licence forbids copying it to a site whose main
// purpose is to hand it to third parties, so each deployer fetches their own.
// Without ./browser/ every call returns "unavailable", never a pass.
import { FILES, detectSyntax, matchingAddons, parseSvrl } from "./schematron-core.mjs";

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

// Resolves to an async (xml) => { status, syntax, findings, sets } runner, or
// null when this host has no ./browser/ folder.
export async function loadBrowserRunner({ base = "", fetchFn = globalThis.fetch, load = loadScript, saxon = () => globalThis.SaxonJS } = {}) {
  let manifest;
  try {
    const res = await fetchFn(`${base}${BROWSER_DIR}manifest.json`);
    if (!res.ok) return null;
    manifest = await res.json();
    if (!saxon()) await load(`${base}${BROWSER_DIR}SaxonJS2.rt.js`);
  } catch {
    return null;
  }
  if (!saxon()) return null;
  const has = (file) => manifest.files?.includes(file);

  const transform = async (file, xml, source) => {
    const out = await saxon().transform({ stylesheetLocation: `${base}${BROWSER_DIR}${file}`, sourceText: xml, destination: "serialized" }, "async");
    return parseSvrl(out.principalResult, source);
  };

  return async function run(xml) {
    const syntax = detectSyntax(xml);
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
