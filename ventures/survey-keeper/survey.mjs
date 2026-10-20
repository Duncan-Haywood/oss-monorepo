// Survey Keeper core: question parsing, validation, NPS statistics, text themes
// and CSV export. Pure functions on a plain state object, so the browser demo
// and the server use the same code. No Node-only imports.

export const TYPES = ["nps", "rating", "single", "multi", "text"];
export const LIMITS = { questions: 20, options: 12, text: 1000, label: 200, responses: 50_000, surveys: 100 };

export const newState = () => ({ settings: { name: "Survey Keeper" }, surveys: {}, responses: [], seq: 0 });

const clean = (s, n) => String(s ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, n);

export function slugify(s) {
  return String(s || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}

// One question per line:  type[*]: label | option | option
// A star after the type makes it required. Lines starting with # are ignored.
export function parseQuestions(text) {
  const out = []; const errors = [];
  for (const [i, raw] of String(text || "").split(/\r?\n/).entries()) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^([a-z]+)(\*?)\s*:\s*(.+)$/i);
    if (!m || !TYPES.includes(m[1].toLowerCase())) { errors.push(`line ${i + 1}: start with one of ${TYPES.join(", ")} and a colon`); continue; }
    const type = m[1].toLowerCase();
    const [label, ...opts] = m[3].split("|").map((x) => clean(x, LIMITS.label));
    if (!label) { errors.push(`line ${i + 1}: the question needs a label`); continue; }
    const q = { id: `q${out.length + 1}`, type, label, required: m[2] === "*" };
    if (type === "single" || type === "multi") {
      const options = [...new Set(opts.filter(Boolean))];
      if (options.length < 2) { errors.push(`line ${i + 1}: ${type} needs at least two options after the label, separated by |`); continue; }
      if (options.length > LIMITS.options) { errors.push(`line ${i + 1}: at most ${LIMITS.options} options`); continue; }
      q.options = options;
    }
    out.push(q);
  }
  if (out.length > LIMITS.questions) errors.push(`at most ${LIMITS.questions} questions`);
  if (!out.length && !errors.length) errors.push("add at least one question");
  return { questions: out.slice(0, LIMITS.questions), errors };
}

export const questionsToText = (qs) => qs.map((q) => `${q.type}${q.required ? "*" : ""}: ${[q.label, ...(q.options || [])].join(" | ")}`).join("\n");

export function saveSurvey(state, f, now = Date.now()) {
  const title = clean(f.title, 120);
  if (!title) throw new Error("A survey needs a title");
  const { questions, errors } = parseQuestions(f.questions);
  if (errors.length) throw new Error(errors.join("; "));
  let s = f.id ? state.surveys[f.id] : null;
  if (f.id && !s) throw new Error("No such survey");
  if (!s && Object.keys(state.surveys).length >= LIMITS.surveys) throw new Error(`At most ${LIMITS.surveys} surveys`);
  let slug = slugify(f.slug || title) || "survey";
  const taken = (x) => Object.values(state.surveys).some((o) => o.slug === x && o !== s);
  for (let n = 2, base = slug; taken(slug); n++) slug = `${base}-${n}`;
  if (s && responsesFor(state, s.id).length) { // editing live questions would silently re-map old answers
    const same = s.questions.length === questions.length && s.questions.every((q, i) => q.type === questions[i].type && JSON.stringify(q.options || []) === JSON.stringify(questions[i].options || []));
    if (!same) throw new Error("This survey already has responses, so question types and options are locked. Edit labels only, or copy it into a new survey.");
  }
  if (!s) { s = { id: `s${++state.seq}`, created: now }; state.surveys[s.id] = s; }
  Object.assign(s, { title, slug, intro: clean(f.intro, 500), thanks: clean(f.thanks, 300) || "Thank you. Your answers were saved.", questions, status: f.status === "closed" ? "closed" : "open", updated: now });
  return s;
}

export const bySlug = (state, slug) => Object.values(state.surveys).find((s) => s.slug === slug);
export const responsesFor = (state, sid) => state.responses.filter((r) => r.sid === sid);
export function removeSurvey(state, id) {
  if (!state.surveys[id]) return false;
  delete state.surveys[id]; state.responses = state.responses.filter((r) => r.sid !== id); return true;
}

// form: object of field -> string | string[] (q1, q2...). Returns answers keyed by question id.
export function validateAnswers(survey, form) {
  const answers = {}; const errors = {};
  for (const q of survey.questions) {
    const raw = form[q.id]; const vals = (Array.isArray(raw) ? raw : raw == null ? [] : [raw]).map((v) => String(v)).filter((v) => v !== "");
    if (!vals.length) { if (q.required) errors[q.id] = "Please answer this question"; continue; }
    if (q.type === "nps" || q.type === "rating") {
      const [lo, hi] = q.type === "nps" ? [0, 10] : [1, 5]; const n = Number(vals[0]);
      if (!Number.isInteger(n) || n < lo || n > hi) errors[q.id] = `Choose a number from ${lo} to ${hi}`; else answers[q.id] = n;
    } else if (q.type === "single") {
      if (!q.options.includes(vals[0])) errors[q.id] = "Choose one of the options"; else answers[q.id] = vals[0];
    } else if (q.type === "multi") {
      const set = [...new Set(vals)];
      if (set.some((v) => !q.options.includes(v))) errors[q.id] = "Choose from the options"; else answers[q.id] = set;
    } else { const t = clean(vals[0], LIMITS.text); if (t) answers[q.id] = t; else if (q.required) errors[q.id] = "Please answer this question"; }
  }
  return { answers, errors };
}

export function addResponse(state, survey, answers, { now = Date.now(), ref = "" } = {}) {
  if (survey.status !== "open") throw new Error("This survey is closed");
  if (state.responses.length >= LIMITS.responses) throw new Error("Response limit reached; export and prune");
  const r = { sid: survey.id, t: now, a: answers };
  const rf = String(ref || "").toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 40);
  if (rf) r.ref = rf;
  state.responses.push(r);
  return r;
}

// Net Promoter Score with a 95% interval. Each respondent is +1 (9-10), 0 (7-8) or -1 (0-6);
// NPS is the mean x 100 and its standard error comes from the variance of that three-point score.
export function npsStats(scores) {
  const n = scores.length;
  if (!n) return { n: 0, promoters: 0, passives: 0, detractors: 0, nps: null, ci: null };
  const p = scores.filter((x) => x >= 9).length, d = scores.filter((x) => x <= 6).length;
  const mean = (p - d) / n, variance = (p + d) / n - mean * mean, half = 1.96 * Math.sqrt(variance / n) * 100;
  return { n, promoters: p, passives: n - p - d, detractors: d, nps: Math.round(mean * 100), ci: n < 2 ? null : [Math.max(-100, Math.round(mean * 100 - half)), Math.min(100, Math.round(mean * 100 + half))] };
}

export const bucket = (n) => (n >= 9 ? "promoter" : n >= 7 ? "passive" : "detractor");

const STOP = new Set("a about after again all also am an and any are as at be because been but by can could did do does don dont for from had has have he her here him his how i if in into is it its just like me more most my no not of on one only or other our out over so some than that the their them then there these they this to too up us very was we were what when which who will with would you your really get got much make made use using".split(" "));
export const words = (t) => String(t).toLowerCase().replace(/[^a-z0-9\s'-]/g, " ").split(/\s+/).map((w) => w.replace(/^['-]+|['-]+$/g, "").replace(/'/g, "")).filter((w) => w.length > 2 && !STOP.has(w) && !/^\d+$/.test(w));

// Terms that appear in comments, with how many comments mention each (once per comment)
// and which NPS group leaves them more. `lift` > 1 means detractors say it more often than promoters.
export function themes(items, top = 12) {
  const stat = new Map(); const tally = { promoter: 0, passive: 0, detractor: 0, none: 0 };
  for (const { text, group } of items) {
    const g = group || "none"; tally[g]++;
    for (const w of new Set(words(text))) { const s = stat.get(w) || { term: w, count: 0, promoter: 0, passive: 0, detractor: 0, none: 0 }; s.count++; s[g]++; stat.set(w, s); }
  }
  const dn = tally.detractor, pn = tally.promoter;
  return [...stat.values()].filter((s) => s.count >= 2 || items.length < 6).map((s) => ({ ...s, lift: dn && pn ? Number((((s.detractor + 0.5) / (dn + 1)) / ((s.promoter + 0.5) / (pn + 1))).toFixed(1)) : null }))
    .sort((a, b) => b.count - a.count || a.term.localeCompare(b.term)).slice(0, top);
}

const dayOf = (t) => new Date(t).toISOString().slice(0, 10);

export function summarize(survey, responses) {
  const npsQ = survey.questions.find((q) => q.type === "nps");
  const groupOf = (r) => (npsQ && r.a[npsQ.id] != null ? bucket(r.a[npsQ.id]) : null);
  const out = { total: responses.length, first: responses[0] ? dayOf(responses[0].t) : null, last: responses.length ? dayOf(responses[responses.length - 1].t) : null, questions: [] };
  for (const q of survey.questions) {
    const got = responses.filter((r) => r.a[q.id] != null); const base = { id: q.id, type: q.type, label: q.label, answered: got.length };
    if (q.type === "nps") {
      const scores = got.map((r) => r.a[q.id]); const dist = Array.from({ length: 11 }, (_, i) => scores.filter((x) => x === i).length);
      const byRef = {}; for (const r of got) if (r.ref) (byRef[r.ref] ||= []).push(r.a[q.id]);
      const byDay = {}; for (const r of got) (byDay[dayOf(r.t)] ||= []).push(r.a[q.id]);
      out.questions.push({ ...base, ...npsStats(scores), dist, byRef: Object.entries(byRef).map(([ref, v]) => ({ ref, ...npsStats(v) })).sort((a, b) => b.n - a.n), byDay: Object.entries(byDay).sort().map(([day, v]) => ({ day, ...npsStats(v) })) });
    } else if (q.type === "rating") {
      const v = got.map((r) => r.a[q.id]);
      out.questions.push({ ...base, mean: v.length ? Number((v.reduce((a, b) => a + b, 0) / v.length).toFixed(2)) : null, dist: [1, 2, 3, 4, 5].map((i) => v.filter((x) => x === i).length) });
    } else if (q.type === "single" || q.type === "multi") {
      const counts = q.options.map((o) => ({ option: o, count: got.filter((r) => (q.type === "multi" ? r.a[q.id].includes(o) : r.a[q.id] === o)).length }));
      out.questions.push({ ...base, counts: counts.map((c) => ({ ...c, pct: got.length ? Math.round((c.count / got.length) * 100) : 0 })) });
    } else {
      const items = got.map((r) => ({ text: r.a[q.id], group: groupOf(r), t: r.t, ref: r.ref }));
      out.questions.push({ ...base, themes: themes(items), recent: items.slice(-10).reverse() });
    }
  }
  return out;
}

const csvCell = (v) => { let s = Array.isArray(v) ? v.join("; ") : v == null ? "" : String(v); if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export function toCsv(survey, responses) {
  const head = ["submitted_at_utc", "ref", ...survey.questions.map((q) => q.label)];
  return [head, ...responses.map((r) => [new Date(r.t).toISOString(), r.ref || "", ...survey.questions.map((q) => r.a[q.id])])].map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

// Browser demo helper: paste "score, comment" lines and get the NPS summary.
export function parsePasted(text) {
  const rows = [];
  for (const line of String(text || "").split(/\r?\n/)) {
    const m = line.trim().match(/^(\d{1,2})\s*[,;\t]?\s*(.*)$/); if (!m) continue;
    const n = Number(m[1]); if (n < 0 || n > 10) continue; rows.push({ score: n, text: m[2].replace(/^["']|["']$/g, "") });
  }
  return rows;
}
