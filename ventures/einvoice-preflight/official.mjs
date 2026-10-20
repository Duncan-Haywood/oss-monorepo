// Browser-side bridge to the official Schematron. Saxon-JS and the compiled
// rules run in Node, so the page asks the server it was served from
// (POST ./v1/validate?schematron=1) and merges only the Schematron findings
// into the local result. The built-in rules still run in the browser. A static
// host has no API, which is reported as "unavailable", never as a pass.

const isOfficial = (finding) => typeof finding?.source === "string" && finding.source.endsWith("-schematron");

function textOrBytes(source) {
  return typeof source === "string" ? new TextEncoder().encode(source) : source;
}

export async function addOfficialFindings(result, inputs, { profile = "", fetchFn = globalThis.fetch, base = "" } = {}) {
  const byName = new Map(inputs.map((i) => [i.name, i]));
  for (const report of result.reports) {
    const input = byName.get(report.file);
    report.schematron = "unavailable";
    if (!input || /\.json$/i.test(report.file)) continue;
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
  if (report.schematron === "ok") return "Official EN 16931 Schematron: run, findings listed below.";
  if (report.schematron === "unavailable") return "Official Schematron not run: it needs the self-hosted server with the rules built (see README).";
  return "";
}
