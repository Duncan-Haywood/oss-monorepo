// Free SPRS score calculator (the front door to apps/cmmc). Pure functions, no I/O, no scripts in the
// browser: the page is a plain GET form, and the Worker (early-access.mjs) scores the query string and
// writes the result into the static page it already serves.
//
// Data: the 110 NIST SP 800-171 Rev. 2 requirements and their point values come from apps/cmmc's
// official-text.json, extracted from NIST's spreadsheet and 32 CFR 170.24(c)(2) by
// apps/cmmc/scripts/extract_official_text.py and tested word for word there. One copy, read here.
// Rules: the same as apps/cmmc/src/shared/controls/scoring.ts (DoD Assessment Methodology v1.2.1,
// 32 CFR 170.24 and 170.21): start at 110, subtract 5, 3 or 1 per requirement not met; the two partial
// credits (3.5.3, 3.13.11) subtract 3; 3.12.4 (SSP) has no points, but without it no score exists.
// sprs.test.mjs pins the same worked examples as scoring.test.ts.
import official from "../../cmmc/src/shared/controls/official-text.json" with { type: "json" };

export const MAX_SCORE = 110;
export const CONDITIONAL_MIN_SCORE = 88;
export const SSP_ID = "3.12.4";
/** 32 CFR 170.21(a)(2)(iv): never allowed on a POA&M. */
export const POAM_EXCLUDED = ["3.1.20", "3.1.22", "3.12.4", "3.10.3", "3.10.4", "3.10.5"];

export const FAMILIES = [
  ["1", "AC", "Access Control"],
  ["2", "AT", "Awareness and Training"],
  ["3", "AU", "Audit and Accountability"],
  ["4", "CM", "Configuration Management"],
  ["5", "IA", "Identification and Authentication"],
  ["6", "IR", "Incident Response"],
  ["7", "MA", "Maintenance"],
  ["8", "MP", "Media Protection"],
  ["9", "PS", "Personnel Security"],
  ["10", "PE", "Physical Protection"],
  ["11", "RA", "Risk Assessment"],
  ["12", "CA", "Security Assessment"],
  ["13", "SC", "System and Communications Protection"],
  ["14", "SI", "System and Information Integrity"],
];

/** The only reduced deductions the methodology allows (3 instead of 5). */
export const PARTIAL = {
  "3.5.3": "MFA is in place for remote and privileged users, but not yet for all general users",
  "3.13.11": "CUI is encrypted, but the encryption is not FIPS-validated",
};

const w = official.weights;
const weightOf = (id) =>
  w.five.includes(id) || w.partial.includes(id)
    ? 5
    : w.three.includes(id)
      ? 3
      : w.noValue.includes(id)
        ? 0
        : 1;

/** @type {{ nistId: string, code: string, family: string, text: string, weight: number }[]} */
export const REQUIREMENTS = official.level2.map((r) => {
  const fam = FAMILIES.find(([n]) => n === r.nistId.split(".")[1]);
  if (!fam) throw new Error(`unknown family for ${r.nistId}`);
  return {
    nistId: r.nistId,
    code: `${fam[1]}.L2-${r.nistId}`,
    family: fam[1],
    text: r.text,
    weight: weightOf(r.nistId),
  };
});
const BY_ID = new Map(REQUIREMENTS.map((r) => [r.nistId, r]));

export const MIN_SCORE = MAX_SCORE - REQUIREMENTS.reduce((s, r) => s + r.weight, 0);

/**
 * Reads the form's query string. Unknown ids are ignored; a partial credit counts only for its own
 * requirement and only when that requirement is ticked as not met.
 * @param {URLSearchParams} params
 */
export function parseQuery(params) {
  const notMet = new Set(params.getAll("nm").filter((id) => BY_ID.has(id)));
  const partial = new Set(params.getAll("pc").filter((id) => id in PARTIAL && notMet.has(id)));
  return { notMet, partial };
}

/** Points lost for one requirement. */
export function deduction(nistId, { notMet, partial }) {
  const r = BY_ID.get(nistId);
  if (!r || !notMet.has(nistId)) return 0;
  return partial.has(nistId) ? 3 : r.weight;
}

/** May this open requirement be on a POA&M for a Conditional Level 2 (Self) status? */
export function poamEligible(nistId, input) {
  if (POAM_EXCLUDED.includes(nistId))
    return { eligible: false, reason: "never allowed on a POA&M (32 CFR 170.21(a)(2)(iv))" };
  const points = deduction(nistId, input);
  if (points <= 1) return { eligible: true, reason: "1-point requirement" };
  if (nistId === "3.13.11" && input.partial.has(nistId))
    return { eligible: true, reason: "encryption employed but not FIPS-validated" };
  return {
    eligible: false,
    reason: `worth ${points} points; only 1-point requirements may be on a POA&M`,
  };
}

/** Scores a parsed input. */
export function score(input) {
  const deductions = REQUIREMENTS.filter((r) => input.notMet.has(r.nistId)).map((r) => ({
    ...r,
    points: deduction(r.nistId, input),
    poam: poamEligible(r.nistId, input),
  }));
  const lost = deductions.reduce((s, d) => s + d.points, 0);
  const provisional = MAX_SCORE - lost;
  const ssp = !input.notMet.has(SSP_ID);
  const blockers = [];
  if (!ssp) blockers.push("no system security plan, so no score can be produced");
  else if (provisional < CONDITIONAL_MIN_SCORE)
    blockers.push(`the score is below ${CONDITIONAL_MIN_SCORE} (80% of 110)`);
  const ineligible = deductions.filter((d) => !d.poam.eligible && d.nistId !== SSP_ID);
  if (ineligible.length)
    blockers.push(
      `${ineligible.length} open requirement${ineligible.length === 1 ? "" : "s"} may not go on a POA&M`,
    );
  const byFamily = FAMILIES.map(([, code, name]) => ({
    code,
    name,
    open: deductions.filter((d) => d.family === code).length,
    points: deductions.filter((d) => d.family === code).reduce((s, d) => s + d.points, 0),
  })).filter((f) => f.open > 0);
  return {
    score: ssp ? provisional : null,
    provisional,
    ssp,
    deductions,
    byFamily,
    allMet: deductions.length === 0,
    conditional: { meets: blockers.length === 0, blockers, ineligible },
  };
}

const esc = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export const RESULT_MARKER = "<!--sprs-result-->";

/** The form (built once into the static page). Unticked means met or not applicable. */
export function renderForm() {
  const rows = FAMILIES.map(([n, code, name]) => {
    const reqs = REQUIREMENTS.filter((r) => r.nistId.split(".")[1] === n);
    const items = reqs
      .map((r) => {
        const pts =
          r.weight === 0
            ? "no points; no SSP means no score"
            : `${r.weight} pt${r.weight === 1 ? "" : "s"}`;
        const partial = PARTIAL[r.nistId]
          ? `<label class="partial"><input type="checkbox" name="pc" value="${r.nistId}"> Partly: ${esc(PARTIAL[r.nistId])} (3 pts instead of 5)</label>`
          : "";
        return `<li><label><input type="checkbox" name="nm" value="${r.nistId}"> <strong>${r.nistId}</strong> <span class="muted">(${pts})</span> ${esc(r.text)}</label>${partial}</li>`;
      })
      .join("\n");
    return `<fieldset><legend>${esc(name)} (${code}, ${reqs.length})</legend><ul class="reqs">
${items}
</ul></fieldset>`;
  }).join("\n");
  return `<form class="sprs" method="get" action="/sprs-score-calculator#result">
<p>Tick each requirement your shop does <strong>not</strong> fully meet yet. Leave it unticked when every one of its
assessment objectives is met, or when it does not apply (not applicable counts as met).</p>
${rows}
<p><button type="submit" class="button">Calculate my SPRS score</button></p>
</form>`;
}

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The result section, HTML. Every string is escaped; ids were validated by parseQuery. */
export function renderResult(r) {
  const headline =
    r.score === null
      ? `<p class="score">No score yet</p><p>Without a system security plan (3.12.4) the assessment cannot be completed, so there is no
score to post. The arithmetic without it would be <strong>${r.provisional}</strong>; do not post that number.</p>`
      : `<p class="score">${r.score} <span class="muted">of 110</span></p>`;
  const conditional = r.allMet
    ? "<p>Every requirement is met: a Final Level 2 (Self) self-assessment would need no POA&amp;M.</p>"
    : r.conditional.meets
      ? `<p><strong>Meets the POA&amp;M rules for a Conditional Level 2 (Self) status:</strong> the score is at least
${CONDITIONAL_MIN_SCORE} and every open requirement may go on a POA&amp;M, which must be closed out within 180 days.</p>`
      : `<p><strong>Does not meet the POA&amp;M rules for a Conditional Level 2 (Self) status yet:</strong>
${r.conditional.blockers.map(esc).join("; ")}.</p>`;
  const worst = [...r.deductions].sort((a, b) => b.points - a.points);
  const table = worst.length
    ? `<div class="table-wrap"><table>
<caption>Open requirements, most points first</caption>
<thead><tr><th scope="col">Requirement</th><th scope="col">Points</th><th scope="col">On a POA&amp;M?</th></tr></thead>
<tbody>
${worst
  .map(
    (d) =>
      `<tr><td><strong>${d.nistId}</strong> ${esc(d.text)}${d.points === 3 && PARTIAL[d.nistId] ? ` <span class="muted">(partial credit)</span>` : ""}</td><td>${d.points ? `−${d.points}` : "0"}</td><td>${d.poam.eligible ? "Yes" : `No: ${esc(d.poam.reason)}`}</td></tr>`,
  )
  .join("\n")}
</tbody></table></div>`
    : "";
  const fams = r.byFamily.length
    ? `<p>Points lost by family: ${r.byFamily.map((f) => `${esc(f.name)} −${f.points} (${plural(f.open, "open item")})`).join(" · ")}.</p>`
    : "";
  return `<section id="result" class="result" aria-live="polite">
<h2>Your result</h2>
${headline}
<p>${plural(r.deductions.length, "requirement")} ticked as not met, ${110 - r.deductions.length} met or not applicable.</p>
${conditional}
${fams}
${table}
<p class="muted">A planning aid from the published scoring rules, not an assessment. Your shop's senior official makes the
self-assessment and the affirmation in SPRS. Change the ticks below and calculate again; nothing you enter is stored.</p>
</section>`;
}

/**
 * Writes the result into the served page: ticks the boxes the visitor ticked, adds the result at the
 * marker and keeps result URLs out of search indexes.
 */
export function applyToPage(html, params) {
  const input = parseQuery(params);
  let out = html;
  for (const id of input.notMet)
    out = out.replace(`name="nm" value="${id}">`, `name="nm" value="${id}" checked>`);
  for (const id of input.partial)
    out = out.replace(`name="pc" value="${id}">`, `name="pc" value="${id}" checked>`);
  out = out.replace(RESULT_MARKER, renderResult(score(input)));
  out = out.replace(
    /<link rel="canonical"[^>]*>/,
    (m) => `${m}\n<meta name="robots" content="noindex">`,
  );
  return out;
}
