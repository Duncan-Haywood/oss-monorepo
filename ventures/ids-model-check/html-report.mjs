// A checkIds() report as one self-contained HTML file: the document a BIM
// manager sends back to the consultant whose model was checked. No external
// fonts, scripts or images, so it opens offline and survives an email
// attachment; it prints to A4/Letter; every number in it is computed from the
// same report the page, CSV, JSON and BCF downloads use.
//
// Besides the per-specification tables the CSV already holds, it answers the
// three questions a model author asks first (eval/html-report-2026-11-21.md):
//   - which requirement fails most (fix one parameter mapping, clear hundreds);
//   - which IFC classes carry the failures (whose discipline is it);
//   - which elements fail the most specifications (the worst-modelled ones).

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const n = (x) => Number(x).toLocaleString("en-US");
const pct = (a, b) => (b ? `${((100 * a) / b).toFixed(a === b || a === 0 ? 0 : 1)}%` : "-");

// How many elements fail a specification. A capped report (maxFailed) keeps
// the first N and the exact total in failedCount; a failing prohibited
// specification fails every applicable element but lists at most 500.
export function failCount(s) {
  if (s.status !== "fail") return 0;
  if (s.failedCount !== undefined) return s.failedCount;
  if (s.optionality === "prohibited") return s.applicable;
  return s.failed.length;
}

// The requirement a reason belongs to: the engine writes each reason as
// "<requirement as listed in s.requirements>: <why>". The longest listed
// requirement that prefixes the reason wins (one may prefix another).
export function requirementOf(s, reason) {
  let best = null;
  for (const q of s.requirements) if (reason.length > q.length && reason.charCodeAt(q.length) === 58 && (!best || q.length > best.length) && reason.startsWith(q)) best = q;
  if (best) return best;
  const i = reason.indexOf(": ");
  return i > 0 ? reason.slice(0, i) : reason;
}

// The cross-cutting tallies, from the listed failures (a capped report says so).
// Built in one pass with plain counters: a 40 MB MEP export against the Dutch
// ILS lists 11.6 million failing results (eval/html-report-2026-11-21.md).
export function reportStats(r) {
  const requirements = [];
  const byClass = new Map(); // IFC class -> {type, failures, specs}
  const byElement = new Map(); // step id -> {id, type, name, globalId, n, last}
  let listed = 0, total = 0, capped = false;
  r.specs.forEach((s, si) => {
    total += failCount(s);
    if (s.failed.length < failCount(s)) capped = true;
    const reqCount = new Map();
    for (const f of s.failed) {
      listed++;
      const seen = f.reasons.length > 1 ? [] : null; // an element counts once per requirement
      for (const x of f.reasons) {
        const q = requirementOf(s, x);
        if (seen) { if (seen.includes(q)) continue; seen.push(q); }
        reqCount.set(q, (reqCount.get(q) || 0) + 1);
      }
      let c = byClass.get(f.type);
      if (!c) byClass.set(f.type, (c = { type: f.type, failures: 0, specs: 0, lastSpec: -1, elements: 0 }));
      c.failures++;
      if (c.lastSpec !== si) { c.lastSpec = si; c.specs++; }
      let e = byElement.get(f.id);
      if (!e) { byElement.set(f.id, (e = { id: f.id, type: f.type, name: f.name, globalId: f.globalId, n: 0, last: -1 })); c.elements++; }
      if (e.last !== si) { e.last = si; e.n++; }
    }
    for (const [requirement, count] of reqCount) requirements.push({ spec: s.name, requirement, count });
  });
  requirements.sort((a, b) => b.count - a.count || a.spec.localeCompare(b.spec));
  const classes = [...byClass.values()].map(({ type, failures, elements, specs }) => ({ type, failures, elements, specs })).sort((a, b) => b.failures - a.failures || a.type.localeCompare(b.type));
  const multi = [];
  for (const e of byElement.values()) if (e.n > 1) multi.push(e);
  multi.sort((a, b) => b.n - a.n || a.id - b.id);
  // Spec names only for the elements a report shows.
  const shown = multi.slice(0, 25);
  const want = new Map(shown.map((e) => [e.id, []]));
  if (want.size) for (const s of r.specs) for (const f of s.failed) { const l = want.get(f.id); if (l && l[l.length - 1] !== s.name) l.push(s.name); }
  const out = (e) => ({ id: e.id, type: e.type, name: e.name, globalId: e.globalId, specs: want.get(e.id) || null, specCount: e.n });
  return { listed, total, capped, requirements, classes, elementCount: byElement.size, multi: multi.map(out) };
}

const CSS = `
:root{--bg:#fff;--fg:#1d2228;--muted:#5d6670;--line:#d9dee3;--soft:#f4f6f8;--pass:#1e7a3c;--pass-bg:#e3f4e8;--fail:#b3261e;--fail-bg:#fbe7e5;--warn:#8a5a00;--warn-bg:#fff4d6;--bar:#c94a3f}
@media (prefers-color-scheme:dark){:root{--bg:#15181b;--fg:#e6e9ec;--muted:#9aa4ad;--line:#30363c;--soft:#1e2226;--pass:#6fd08c;--pass-bg:#173322;--fail:#ff8a80;--fail-bg:#3a1c1a;--warn:#f0c060;--warn-bg:#352b12;--bar:#e0675c}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:1100px;margin:0 auto;padding:24px 16px 48px}
h1{font-size:1.6rem;margin:0 0 4px}h2{font-size:1.2rem;margin:32px 0 8px;border-bottom:1px solid var(--line);padding-bottom:4px}
.muted{color:var(--muted)}code{font:0.85em ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;word-break:break-all}
.tag{display:inline-block;font-size:.75rem;font-weight:700;letter-spacing:.03em;padding:1px 8px;border-radius:999px;margin-right:8px;vertical-align:1px}
.tag.pass{background:var(--pass-bg);color:var(--pass)}.tag.fail{background:var(--fail-bg);color:var(--fail)}.tag.invalid,.tag.skipped{background:var(--warn-bg);color:var(--warn)}
.verdict{font-size:1.15rem;margin:16px 0}.verdict .tag{font-size:.95rem}
.meta{display:grid;grid-template-columns:max-content minmax(0,1fr);gap:2px 16px;margin:12px 0}.meta span,h1,td,details.spec p,details.spec summary,.warn{overflow-wrap:anywhere}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin:16px 0}
.kpi{background:var(--soft);border-radius:8px;padding:10px 12px}.kpi b{display:block;font-size:1.4rem}
.tablewrap{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:.9rem;margin:8px 0}
th,td{text-align:left;padding:5px 8px;border-bottom:1px solid var(--line);vertical-align:top}th{background:var(--soft);font-weight:600}
td.num,th.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.bar{display:inline-block;height:8px;background:var(--bar);border-radius:2px;vertical-align:middle;margin-left:6px}
details.spec{border:1px solid var(--line);border-radius:8px;margin:10px 0}details.spec>summary{cursor:pointer;padding:10px 12px;list-style:none}
details.spec>summary::-webkit-details-marker{display:none}details.spec>.body{padding:0 12px 12px}
.warn{background:var(--warn-bg);color:var(--warn);padding:6px 10px;border-radius:6px}
.filter{display:none;margin:8px 0}.filter input{width:100%;max-width:420px;padding:6px 10px;font:inherit;border:1px solid var(--line);border-radius:6px;background:var(--bg);color:var(--fg)}
footer{margin-top:40px;font-size:.85rem;color:var(--muted);border-top:1px solid var(--line);padding-top:12px}
@media print{body{font-size:11px}main{max-width:none;padding:0}details.spec{break-inside:avoid-page}details.spec>summary{padding:4px 0}.filter{display:none!important}a{color:inherit}}
`;

// Expands every <details> before printing and offers a filter over the
// element rows. The report reads fully without it (mail clients strip scripts).
const SCRIPT = `
(function(){var f=document.getElementById("filter");if(!f)return;f.parentNode.style.display="block";var rows=[].slice.call(document.querySelectorAll("tr[data-el]"));
f.addEventListener("input",function(){var q=f.value.trim().toLowerCase();rows.forEach(function(r){r.style.display=!q||r.getAttribute("data-el").indexOf(q)>=0?"":"none"});
if(q)[].forEach.call(document.querySelectorAll("details.spec"),function(d){if(d.querySelector("tr[data-el]:not([style*='none'])"))d.open=true})});
window.addEventListener("beforeprint",function(){[].forEach.call(document.querySelectorAll("details"),function(d){d.setAttribute("data-was",d.open?"1":"");d.open=true})});
window.addEventListener("afterprint",function(){[].forEach.call(document.querySelectorAll("details"),function(d){d.open=d.getAttribute("data-was")==="1"})})})();
`;

const statusTag = (st) => `<span class="tag ${esc(st)}">${esc(String(st).toUpperCase())}</span>`;
const elKey = (f) => esc(`#${f.id} ${f.type} ${f.name ?? ""} ${f.globalId ?? ""}`.toLowerCase());

// opts: modelName, idsName, generatedAt (Date or ISO string; default now),
//       maxRows (failure rows written per specification; default 1,000: a
//       specification applying to every entity of the 40 MB HHS MEP export
//       fails hundreds of thousands of elements, and writing them all passed
//       JavaScript's 512 MB string limit; eval/html-report-2026-11-21.md),
//       toolUrl (where the reader can run the same check).
export function htmlReport(r, opts = {}) {
  const { modelName = "model", idsName = "", maxRows = 1000, toolUrl = "https://marisstella.app/ids-model-check/" } = opts;
  const when = opts.generatedAt ? new Date(opts.generatedAt) : new Date();
  const stats = reportStats(r);
  const passed = r.specs.filter((s) => s.status === "pass").length;
  const failedSpecs = r.specs.filter((s) => s.status === "fail").length;
  const invalid = r.specs.filter((s) => s.status === "invalid").length;
  const applicable = r.specs.reduce((a, s) => a + (s.applicable || 0), 0);
  const title = r.title || idsName || "IDS";
  const h = [];
  h.push(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark">`);
  h.push(`<title>${esc(`IDS check: ${modelName}`)}</title><meta name="generator" content="IDS Model Check (FSL-1.1-MIT), ${esc(toolUrl)}"><style>${CSS}</style></head><body><main>`);
  h.push(`<h1>IDS check: ${esc(modelName)}</h1><p class="muted">${esc(title)}</p>`);
  h.push(`<p class="verdict">${statusTag(r.pass ? "pass" : "fail")}${passed} of ${r.specs.length} specification${r.specs.length === 1 ? "" : "s"} pass${stats.total ? `; ${n(stats.total)} failing element result${stats.total === 1 ? "" : "s"}` : ""}${invalid ? `; ${invalid} invalid` : ""}</p>`);
  h.push(`<div class="meta"><span class="muted">Model</span><span>${esc(modelName)}: ${esc(r.schema)}, ${n(r.entityCount)} entities</span>`);
  h.push(`<span class="muted">Specification</span><span>${esc(title)}${idsName && idsName !== title ? ` <span class="muted">(${esc(idsName)})</span>` : ""}</span>`);
  h.push(`<span class="muted">Checked</span><span>${esc(when.toISOString().replace("T", " ").replace(/\.\d+Z$/, " UTC"))}${r.seconds !== undefined ? ` in ${r.seconds.toFixed(1)} s` : ""}</span></div>`);
  h.push(`<div class="kpis"><div class="kpi"><b>${passed}</b>specifications pass</div><div class="kpi"><b>${failedSpecs}</b>specifications fail</div><div class="kpi"><b>${n(applicable)}</b>element checks</div><div class="kpi"><b>${n(stats.total)}</b>failing results</div><div class="kpi"><b>${n(stats.elementCount)}</b>elements with a failure${stats.capped ? " (listed)" : ""}</div></div>`);
  if (invalid) h.push(`<p class="warn">${invalid} specification${invalid > 1 ? "s" : ""} in the IDS ${invalid > 1 ? "are" : "is"} invalid and ${invalid > 1 ? "were" : "was"} not checked: the IDS needs fixing, not the model. Each says why below.</p>`);
  if (stats.capped) h.push(`<p class="warn">This check listed only the first failing elements of some specifications (${n(stats.listed)} of ${n(stats.total)} results). The counts per specification are exact; the tallies by requirement, class and element cover the listed results.</p>`);
  if (r.parseErrors?.length) h.push(`<p class="warn">${r.parseErrors.length} reader note(s) on the model (lines that could not be read, or forms read leniently), e.g. ${esc(r.parseErrors[0])}</p>`);

  // Summary table.
  h.push(`<h2>Specifications</h2><div class="tablewrap"><table><thead><tr><th>Specification</th><th>Result</th><th class="num">Applicable</th><th class="num">Pass</th><th class="num">Fail</th><th class="num">Pass rate</th></tr></thead><tbody>`);
  r.specs.forEach((s, i) => {
    const fc = failCount(s);
    h.push(`<tr><td><a href="#spec-${i + 1}">${esc(s.name)}</a> <span class="muted">(${esc(s.optionality)})</span></td><td>${statusTag(s.status)}</td><td class="num">${n(s.applicable || 0)}</td><td class="num">${s.optionality === "prohibited" ? "-" : n(s.passed || 0)}</td><td class="num">${n(fc)}</td><td class="num">${s.status === "invalid" || s.status === "skipped" ? "-" : !s.applicable && s.status === "fail" ? "nothing matched" : s.optionality === "prohibited" ? (s.applicable ? "0%" : "100%") : pct(s.passed || 0, s.applicable || 0)}</td></tr>`);
  });
  h.push(`</tbody></table></div>`);

  if (stats.listed) {
    const top = (arr, k) => arr.slice(0, k);
    const maxReq = stats.requirements[0]?.count || 1;
    h.push(`<h2>Where to start</h2><p class="muted">The requirements that fail most often. One missing parameter mapping in the authoring tool's IFC export usually explains a whole row.</p>`);
    h.push(`<div class="tablewrap"><table><thead><tr><th>Requirement</th><th>Specification</th><th class="num">Elements failing</th></tr></thead><tbody>`);
    for (const q of top(stats.requirements, 15)) h.push(`<tr><td>${esc(q.requirement)}</td><td>${esc(q.spec)}</td><td class="num">${n(q.count)}<span class="bar" style="width:${Math.max(2, Math.round((80 * q.count) / maxReq))}px"></span></td></tr>`);
    h.push(`</tbody></table></div>${stats.requirements.length > 15 ? `<p class="muted">${stats.requirements.length - 15} more requirement${stats.requirements.length - 15 > 1 ? "s" : ""} with failures; each specification below lists its own.</p>` : ""}`);
    h.push(`<h2>Failures by IFC class</h2><div class="tablewrap"><table><thead><tr><th>IFC class</th><th class="num">Failing results</th><th class="num">Elements</th><th class="num">Specifications</th></tr></thead><tbody>`);
    for (const c of top(stats.classes, 25)) h.push(`<tr><td>${esc(c.type)}</td><td class="num">${n(c.failures)}</td><td class="num">${n(c.elements)}</td><td class="num">${n(c.specs)}</td></tr>`);
    h.push(`</tbody></table></div>${stats.classes.length > 25 ? `<p class="muted">and ${stats.classes.length - 25} more classes.</p>` : ""}`);
    const multi = stats.multi;
    if (multi.length) {
      h.push(`<h2>Elements failing the most specifications</h2><div class="tablewrap"><table><thead><tr><th>Element</th><th>Name</th><th>GlobalId</th><th class="num">Specifications failed</th></tr></thead><tbody>`);
      for (const e of top(multi, 25)) h.push(`<tr data-el="${elKey(e)}"><td>#${e.id} ${esc(e.type)}</td><td>${esc(e.name)}</td><td><code>${esc(e.globalId)}</code></td><td class="num" title="${esc(e.specs.join("; "))}">${e.specCount}</td></tr>`);
      h.push(`</tbody></table></div>${multi.length > 25 ? `<p class="muted">${n(multi.length - 25)} more elements fail two or more specifications.</p>` : ""}`);
    }
  }

  const dups = r.duplicateGlobalIds || [];
  if (dups.length) {
    h.push(`<h2>Model warning: duplicate GlobalIds</h2><p>Not an IDS verdict: IFC requires every GlobalId to be unique, and BCF viewpoints, model comparisons and clash tools find elements by it. ${n(dups.length)} GlobalId${dups.length > 1 ? "s are" : " is"} shared by more than one element.</p><div class="tablewrap"><table><thead><tr><th>GlobalId</th><th>Elements holding it</th></tr></thead><tbody>`);
    for (const d of dups.slice(0, maxRows)) h.push(`<tr><td><code>${esc(d.globalId)}</code></td><td>${d.elements.map((e) => `#${e.id} ${esc(e.type)}${e.name ? ` ${esc(e.name)}` : ""}`).join("<br>")}</td></tr>`);
    h.push(`</tbody></table></div>`);
  }

  h.push(`<h2>Each specification</h2><div class="filter"><input id="filter" type="search" placeholder="Filter elements by GlobalId, name, class or #id" aria-label="Filter elements"></div>`);
  r.specs.forEach((s, i) => {
    const fc = failCount(s);
    h.push(`<details class="spec" id="spec-${i + 1}"${s.status !== "pass" && fc <= 200 ? " open" : ""}><summary>${statusTag(s.status)}<strong>${esc(s.name)}</strong> <span class="muted">${n(s.applicable || 0)} applicable${fc ? `, ${n(fc)} failing` : ""} (${esc(s.optionality)})</span></summary><div class="body">`);
    if (s.description) h.push(`<p>${esc(s.description)}</p>`);
    if (s.instructions) h.push(`<p class="muted">Instructions: ${esc(s.instructions)}</p>`);
    if (s.warning) h.push(`<p class="warn">${esc(s.warning)}</p>`);
    for (const w of s.auditWarnings || []) h.push(`<p class="warn">IDS warning: ${esc(w)}</p>`);
    if (s.hint) h.push(`<p class="warn">${esc(s.hint)}</p>`);
    h.push(`<p class="muted">Applies to: ${esc(s.applicability.join("; ") || "everything")}<br>Requires: ${esc(s.requirements.join("; ") || "nothing (prohibited specification)")}</p>`);
    if (s.note) h.push(`<p>${esc(s.note)}</p>`);
    if (s.failed.length) {
      const rows = s.failed.slice(0, maxRows);
      h.push(`<div class="tablewrap"><table><thead><tr><th>Element</th><th>Name</th><th>GlobalId</th><th>Why</th></tr></thead><tbody>`);
      for (const f of rows) h.push(`<tr data-el="${elKey(f)}"><td>#${f.id} ${esc(f.type)}</td><td>${esc(f.name)}</td><td><code>${esc(f.globalId)}</code></td><td>${f.reasons.map(esc).join("<br>")}${(f.modelRules || []).map((m) => `<br><em>${esc(m)}</em>`).join("")}</td></tr>`);
      h.push(`</tbody></table></div>`);
      if (fc > rows.length) h.push(`<p class="muted">Showing ${n(rows.length)} of ${n(fc)} failing elements.${s.failed.length > rows.length ? " The CSV and JSON downloads list all the check kept." : ""}</p>`);
    }
    h.push(`</div></details>`);
  });

  h.push(`<footer>Made with IDS Model Check, free and FSL-1.1-MIT licensed: <a href="${esc(toolUrl)}">${esc(toolUrl)}</a>. Open the same model and IDS there to repeat this check in a browser; nothing is uploaded. The check follows buildingSMART's IDS 1.0 and scores 334 of 334 of its test pairs, but IFC exports differ between authoring tools: confirm a surprising result in your BIM tool before acting on it. Not professional, legal or contractual advice; the contract documents and the person who issued the IDS decide what a delivery must contain.</footer>`);
  h.push(`</main><script>${SCRIPT}</script></body></html>\n`);
  return h.join("");
}
