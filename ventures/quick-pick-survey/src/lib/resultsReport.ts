// Branded one-file results report for a survey owner: their name and logo on the
// pooled ranking, the 95% intervals, which places are real and which are ties, and the
// coverage note. Pure string output, no network. Everything user-supplied is escaped;
// the logo must be https or a png/jpeg/webp data URI and the colour a 6-digit hex.
// A ranking from a limited number of pairwise picks is an estimate, not a fact about
// any person, and the report says so on its face.
import type { Coverage, RankedItem } from "./groupRanking";

/** Branding the owner types, plus `agreement`: the route's data-quality notes (slot clickers left out, respondent agreement; groupRanking.ts), never a query parameter. */
export type Brand = { name?: string; logo?: string; colour?: string; note?: string; agreement?: string };

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

export function safeLogo(u: string | undefined): string | null {
  const s = String(u ?? "").trim();
  if (/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(s) && s.length < 300000) return s;
  try {
    const x = new URL(s);
    return x.protocol === "https:" && !x.username && !x.password ? x.href : null;
  } catch { return null; }
}

export function safeColour(c: string | undefined): string {
  return /^#[0-9a-fA-F]{6}$/.test(String(c ?? "")) ? String(c) : "#1f4e79";
}

/** Tied places (ranges that overlap) are shown as a range, never as a clean 1-2-3. */
function place(r: RankedItem): string {
  return r.tied ? `${r.bestRank}–${r.worstRank}` : String(r.rank);
}

export function resultsReportHtml(
  title: string,
  ranked: RankedItem[],
  cov: Coverage,
  participants: number,
  brand: Brand = {},
  today: string = new Date().toISOString().slice(0, 10),
): string {
  const colour = safeColour(brand.colour);
  const logo = safeLogo(brand.logo);
  const lo = ranked.length ? Math.min(...ranked.map((r) => r.low)) : 0;
  const hi = ranked.length ? Math.max(...ranked.map((r) => r.high)) : 1;
  const span = hi - lo || 1;
  const pct = (v: number) => (((v - lo) / span) * 100).toFixed(1);
  const rows = ranked
    .map(
      (r) => `<tr><td class="n">${esc(place(r))}</td><td>${esc(r.label)}${r.category ? `<small> ${esc(r.category)}</small>` : ""}</td>` +
        `<td class="bar"><i class="ci" style="left:${pct(r.low)}%;width:${Math.max(0.5, +pct(r.high) - +pct(r.low)).toFixed(1)}%"></i><b style="left:${pct(r.rating)}%"></b></td>` +
        `<td class="n">${esc(Math.round(r.rating))} <small>(${esc(Math.round(r.low))} to ${esc(Math.round(r.high))})</small></td><td class="n">${esc(r.respondents)}</td></tr>`,
    )
    .join("");
  const thin = cov.thin.length ? `<p class="warn">Too few people rated: ${cov.thin.map(esc).join(", ")}. Their places are not reliable.</p>` : "";
  const agreement = brand.agreement ? `<p class="warn">${esc(brand.agreement)}</p>` : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}: results</title><style>
body{font:15px/1.5 system-ui,sans-serif;margin:0;color:#1a1a1a}main{max-width:860px;margin:0 auto;padding:24px}
header{border-bottom:4px solid ${colour};display:flex;gap:16px;align-items:center;padding-bottom:12px}header img{max-height:56px;max-width:180px}
h1{font-size:24px;margin:0;color:${colour}}table{border-collapse:collapse;width:100%;margin-top:16px}th,td{padding:6px 8px;border-bottom:1px solid #ddd;text-align:left}
.n{text-align:right;white-space:nowrap}.bar{position:relative;width:34%;min-width:120px}.bar .ci{position:absolute;top:50%;height:6px;margin-top:-3px;background:${colour};opacity:.3}
.bar b{position:absolute;top:50%;width:8px;height:8px;margin:-4px 0 0 -4px;border-radius:50%;background:${colour}}small{color:#666}.warn{background:#fff4e0;padding:8px;border-radius:4px}
.fine{color:#555;font-size:13px;margin-top:24px}@media print{main{padding:0}}</style></head><body><main>
<header>${logo ? `<img src="${esc(logo)}" alt="">` : ""}<div><h1>${esc(title)}</h1><div>${esc(brand.name ?? "")} · ${esc(today)} · ${esc(participants)} respondents</div></div></header>
${brand.note ? `<p>${esc(brand.note)}</p>` : ""}${thin}${agreement}
<table><thead><tr><th>Place</th><th>Option</th><th>Score with 95% range</th><th>Score</th><th>Raters</th></tr></thead><tbody>${rows}</tbody></table>
<p class="fine">How to read this: a place shown as a range (for example 2–4) means the picks cannot separate those options; treat them as tied. The bar is the 95% interval for the group score. This is an estimate from a limited number of pairwise picks, not a fact about any person, and not a basis for a decision about anyone. Provided as-is with no warranty; the authors accept no liability for its use. Made with Quick pick (MIT licensed, open source).</p>
</main></body></html>`;
}
