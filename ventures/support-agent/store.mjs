// State for the server: the knowledge, the settings, and a log of what customers asked and what the agent did.
// Plain functions over one JSON-able object; server.mjs persists it.
import { parseKnowledge, buildAgent } from "./agent.mjs";
import { parseCases, evaluate } from "./eval.mjs";
import { calibrate } from "./calibrate.mjs";

export const LOG_MAX = 5000;

export function newState(knowledge = "") {
  return { rev: 1, knowledge, synonyms: "", examples: "", tests: "", calibration: null, bar: null, suggestBar: null, log: [], handoffs: [], seq: 1,
    settings: { name: "Support", contact: "" } };
}

// Questions are logged so the owner can see what the knowledge base is missing; anything that looks like an email
// address, a card or phone number or a long reference is masked before it is stored.
export function redact(text) {
  return String(text ?? "").slice(0, 500).replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "[email]").replace(/\+?\d[\d ().-]{6,}\d/g, "[number]").replace(/\s+/g, " ").trim();
}

export function examplesOf(state) {
  return parseCases(state.examples || "").map((c) => ({ question: c.question, label: c.expect[0] }));
}

let cached = null;
export function agentOf(state) {
  if (cached && cached.state === state && cached.rev === state.rev) return cached.agent;
  const articles = parseKnowledge(state.knowledge);
  const opts = { synonyms: state.synonyms, examples: examplesOf(state) };
  if (state.calibration) opts.calibration = state.calibration;
  const agent = buildAgent(articles, opts);
  if (state.bar != null) agent.threshold = state.bar;
  if (state.suggestBar != null) agent.suggestBar = state.suggestBar;
  cached = { state, rev: state.rev, agent };
  return agent;
}

export function logTurn(state, d, question, now) {
  const row = { id: `c${state.seq++}`, at: now, q: redact(question), action: d.action, article: d.citations[0]?.articleId || d.topArticle || "", confidence: d.confidence, reasons: d.reasons.map((r) => r.id), helpful: null };
  state.log.push(row);
  if (state.log.length > LOG_MAX) state.log.splice(0, state.log.length - LOG_MAX);
  return row;
}

export function feedback(state, id, helpful) {
  const row = state.log.find((r) => r.id === id);
  if (!row || row.helpful !== null) return false;
  row.helpful = Boolean(helpful); return true;
}

export function purge(state, days, now) {
  if (!days) return 0;
  const cut = now - days * 86400_000, before = state.log.length + state.handoffs.length;
  state.log = state.log.filter((r) => r.at >= cut); state.handoffs = state.handoffs.filter((h) => h.at >= cut);
  return before - state.log.length - state.handoffs.length;
}

export function stats(state, now, days = 30) {
  const rows = state.log.filter((r) => r.at >= now - days * 86400_000);
  const by = (a) => rows.filter((r) => r.action === a).length;
  const voted = rows.filter((r) => r.helpful !== null);
  return { questions: rows.length, answer: by("answer"), suggest: by("suggest"), clarify: by("clarify"), handoff: by("handoff"),
    helpful: voted.filter((r) => r.helpful).length, voted: voted.length, handoffsSent: state.handoffs.filter((h) => h.at >= now - days * 86400_000).length };
}

// What people asked that no article answered, most frequent first: the list of articles to write next.
export function gaps(state, limit = 30) {
  const m = new Map();
  for (const r of state.log) {
    if (!(r.action === "handoff" && r.reasons.includes("not_covered")) && !(r.helpful === false)) continue;
    const k = r.q.toLowerCase().replace(/[^\w\s]/g, "").trim(); if (!k) continue;
    const g = m.get(k) || { q: r.q, n: 0, last: 0, unhelpful: 0 }; g.n++; g.last = Math.max(g.last, r.at); if (r.helpful === false) g.unhelpful++; m.set(k, g);
  }
  return [...m.values()].sort((a, b) => b.n - a.n || b.last - a.last).slice(0, limit);
}

export function runTests(state, maxWrong = 0.05) {
  const cases = parseCases(state.tests || "");
  if (!cases.length) throw new Error("add some test questions first (question,expect per line)");
  return evaluate(agentOf(state), cases, { maxWrong });
}

// Refit the confidence model on the owner's own test questions. Needs both right and wrong best matches to learn from.
export function recalibrate(state) {
  const cases = parseCases(state.tests || "");
  if (cases.length < 30) throw new Error("calibrating needs at least 30 test questions");
  const articles = parseKnowledge(state.knowledge);
  const cal = calibrate(buildAgent(articles, { synonyms: state.synonyms, examples: examplesOf(state) }), cases);
  if (!cal.rows || !Number.isFinite(cal.bias)) throw new Error("not enough answerable test questions to calibrate");
  state.calibration = cal; state.rev++;
  const r = evaluate(agentOf(state), cases); state.bar = r.recommended; state.rev++;
  return r;
}

const cell = (v) => { const s = String(v ?? ""); const t = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s; return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
export function logCsv(state) {
  return ["at,question,action,article,confidence,reasons,helpful", ...state.log.map((r) => [new Date(r.at).toISOString(), r.q, r.action, r.article, r.confidence, r.reasons.join(" "), r.helpful ?? ""].map(cell).join(","))].join("\n") + "\n";
}
