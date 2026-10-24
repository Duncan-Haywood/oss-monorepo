// Browser-side bridge to the official Schematron. Two routes, tried in order:
// 1. in the page: the shipped ./plain/ rules run by fontoxpath, or, when
//    `node build-browser.mjs` put Saxon-JS and the SEF rules in
//    ./browser/ (official-browser.mjs): no server, the invoice stays local;
// 2. the server the page was served from (POST ./v1/validate?schematron=1).
// Only the Schematron findings are merged into the local result; the built-in
// rules still run in the browser. A host with neither is reported as
// "unavailable", never as a pass.
import { loadBrowserRunner } from "./official-browser.mjs";

const isOfficial = (finding) => typeof finding?.source === "string" && finding.source.endsWith("-schematron");

function textOrBytes(source) {
  return typeof source === "string" ? new TextEncoder().encode(source) : source;
}

export async function addOfficialFindings(result, inputs, { profile = "", fetchFn = globalThis.fetch, base = "", runner } = {}) {
  if (runner === undefined) runner = await loadBrowserRunner({ base, fetchFn });
  const byName = new Map(inputs.map((i) => [i.name, i]));
  for (const report of result.reports) {
    const input = byName.get(report.file);
    report.schematron = "unavailable";
    if (!input || /\.json$/i.test(report.file)) continue;
    if (runner) {
      try {
        const local = await runner(typeof input.source === "string" ? input.source : new TextDecoder().decode(input.source));
        if (local.status === "ok") {
          report.schematron = "ok";
          report.schematronWhere = "browser";
          if (local.skipped?.length) report.schematronSkipped = local.skipped;
          report.errors.push(...local.findings);
          continue;
        }
      } catch {
        // fall through to the server route
      }
    }
    try {
      const query = new URLSearchParams({ schematron: "1", name: report.file });
      if (profile) query.set("profile", profile);
      const res = await fetchFn(`${base}v1/validate?${query}`, { method: "POST", body: textOrBytes(input.source) });
      if (!res.ok) continue;
      const body = await res.json();
      const remote = body.reports?.[0];
      if (!remote?.schematron) continue;
      report.schematron = remote.schematron;
      report.errors.push(...(remote.errors || []).filter(isOfficial));
    } catch {
      // no API behind this page: leave "unavailable"
    }
  }
  return result;
}

export function officialNote(report) {
  if (report.schematron === "ok") {
    const skipped = report.schematronSkipped?.length ? ` ${report.schematronSkipped.length} rule(s) could not be evaluated in the browser and were NOT checked: ${report.schematronSkipped.join(", ")}.` : "";
    return (report.schematronWhere === "browser" ? "Official EN 16931 Schematron: run in your browser, the file did not leave this page; findings listed below." : "Official EN 16931 Schematron: run, findings listed below.") + skipped;
  }
  if (report.schematron === "unavailable") return "Official Schematron not run: this copy has neither the ./plain/ rules (node build-plain-rules.mjs) nor a server with the rules built (see README).";
  return "";
}
