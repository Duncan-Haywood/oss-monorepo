// Regenerates sample-season-pack.html from the real print pack on an invented league, so the
// marketing page shows exactly what a buyer gets. Run: node build-sample-pack.mjs
import { writeFileSync } from "node:fs";
import { readSpec, buildSchedule, sampleFields } from "./calc.mjs";
import { printPackHtml } from "./printpack.mjs";

const SAMPLE_ICON = '<link rel="icon" href="data:image/svg+xml,%3Csvg%20xmlns=\'http://www.w3.org/2000/svg\'%20viewBox=\'0%200%2032%2032\'%3E%3Crect%20width=\'32\'%20height=\'32\'%20rx=\'7\'%20fill=\'%23471b7e\'/%3E%3Ctext%20x=\'16\'%20y=\'23\'%20font-size=\'20\'%20font-family=\'system-ui,sans-serif\'%20font-weight=\'700\'%20text-anchor=\'middle\'%20fill=\'%23fff\'%3EL%3C/text%3E%3C/svg%3E">';

export function samplePack() {
  const f = sampleFields();
  const r = readSpec(f);
  if (r.errors?.length) throw new Error(r.errors.join("; "));
  const html = printPackHtml(buildSchedule(r.spec), { league: "Sample Rec League (invented)", season: "Fall", accent: "#1d5a3f", contact: "Sample only: not a real league", notes: "Bring your own balls.\nGames start on time; 10 minute grace." });
  // The sample is served as a web page, so it carries the venture's tab icon
  // (the one platform/ci/favicons.py derives from the slug); the buyer's print pack does not need one.
  // It is also a sample, not a product page: kept out of search results, and it
  // carries the no-warranty line every published page does.
  return html
    .replace('<meta charset="utf-8">', `<meta charset="utf-8">${SAMPLE_ICON}<meta name="robots" content="noindex">`)
    .replace('</body>', '<p style="font-size:11px;color:#555">Sample generated from an invented league. Provided as is, with no warranty.</p></body>');
}
if (process.argv[1] && process.argv[1].endsWith("build-sample-pack.mjs")) writeFileSync(new URL("./sample-season-pack.html", import.meta.url), samplePack());
