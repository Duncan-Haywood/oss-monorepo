// Dating length before marriage (data/dating_length.json, built by
// reproducibility/dating_length/). Shown as evidence next to the lenses, never applied to a
// lens number: HCMST shows no held-out gain from it, and the only verified hazard ratios come
// from an opt-in online retrospective survey the evidence review marks not usable in the app.

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const pct = (x, d = 1) => (Number.isFinite(x) ? (100 * x).toFixed(d) + '%' : '—');
const num = (v) => (v === '' || v === null || v === undefined ? NaN : Number(v));

// Years dated before the wedding from the form: years together minus years married. Null when
// either is missing or the result is negative.
export function datingYears(couple = {}) {
  const t = num(couple.yearsTogether);
  const m = num(couple.yearsMarried);
  if (!Number.isFinite(t) || !Number.isFinite(m)) return null;
  const d = t - m;
  return d >= 0 ? d : null;
}
export function datingBand(years) {
  if (!Number.isFinite(years)) return null;
  return years < 1 ? 'under 1 year' : years < 3 ? '1-2 years' : '3+ years';
}

export function renderDating(el, data, couple = {}) {
  if (!data) { el.innerHTML = '<p class="note">The dating-length evidence did not load.</p>'; return; }
  const d = datingYears(couple);
  const band = datingBand(d);
  const core = data.heldout.find((r) => r.model === 'core');
  const plus = data.heldout.find((r) => r.model === 'core+dating');
  const lit = Object.fromEntries(data.literature.map((r) => [r.id, r]));
  const rows = data.hcmst_bands.filter((b) => b.band !== 'Unknown').map((b) => `<tr${b.band === band ? ' class="mine"' : ''}><th scope="row">${esc(b.band.replace('-', '–'))}${b.band === band ? ' <small>you</small>' : ''}</th><td class="num">${b.couples}</td><td class="num">${b.breakups}</td><td class="num">${pct(b.weighted_breakup_by_2017)}</td></tr>`).join('');
  const hr = (id) => (lit[id] ? `HR ${lit[id].estimate.toFixed(2)} (95% CI ${lit[id].ci_low.toFixed(2)}–${lit[id].ci_high.toFixed(2)})` : '—');
  el.innerHTML = `
    <p class="rep-stand">${d === null ? 'Enter “Years together” and “Years married so far” (under “The relationship now”) to see your own dating length.' : `From the form, you dated about <strong>${d.toFixed(d % 1 ? 1 : 0)} year${d === 1 ? '' : 's'}</strong> before marrying (years together minus years married): the <strong>${esc(band.replace('-', '–'))}</strong> band.`}</p>
    <div class="table-wrap"><table class="rep-table"><thead><tr><th scope="col">Dated before the wedding</th><th class="num" scope="col">Married couples</th><th class="num" scope="col">Break-ups</th><th class="num" scope="col">Broke up by 2017 (weighted)</th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="small">HCMST 2009 married couples followed to 2017 (Stanford). Dating length = age at marriage minus age when the romance began, accurate to about a year.</p>
    ${core && plus ? `<p class="rep-stand"><strong>Held-out test:</strong> adding dating length to the HCMST lens’s inputs for married couples changed held-out log-loss gain by ${plus.delta_gain_vs_constant_pct >= 0 ? '+' : '−'}${Math.abs(plus.delta_gain_vs_constant_pct).toFixed(2)} points (95% CI ${plus.delta_gain_vs_constant_pct_lo.toFixed(2)} to ${plus.delta_gain_vs_constant_pct_hi.toFixed(2)}) and the C-index by ${plus.delta_c_index >= 0 ? '+' : '−'}${Math.abs(plus.delta_c_index).toFixed(3)} (${plus.delta_c_index_lo.toFixed(3)} to ${plus.delta_c_index_hi.toFixed(3)}), with ${data.audit.breakups} break-ups. It adds no predictive skill here, so no lens uses it.</p>` : ''}
    <p class="small"><strong>Published evidence:</strong> Francis-Tan &amp; Mialon (2015), an online survey of 3,151 ever-married U.S. adults, report dating 1–2 years before the proposal at ${hr('FTM2015_dated1to2')} and 3+ years at ${hr('FTM2015_dated3plus')} against under a year, adjusted for many traits. Evidence grade: <span class="tag">${esc(data.grade.label)}</span>. ${esc(data.grade.reason)}</p>`;
}
