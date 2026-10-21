// The answering core: decide whether to answer a customer from the knowledge base, ask what they mean, or hand off
// to a person, and say why. Browser-safe, no dependencies.
//   const agent = buildAgent(parseKnowledge(markdown));
//   decide(agent, "how do i reset my pasword") -> { action: "answer" | "clarify" | "handoff", text, citations, reasons, confidence }
// Answers are extractive: sentences copied from one article, never written, so with no model nothing can be invented.
// A model (model.mjs) may rewrite the answer, and its text is accepted only if checkAnswer finds it grounded.
import { buildIndex, search, tokens, distance } from "./search.mjs";

export const DEFAULT_THRESHOLD = 0.5;
// Under the answer bar but over this one, the agent offers its two best articles ("these may help") with the
// handoff one click away, instead of stating an answer. A wrong suggestion costs a glance; a wrong answer costs trust.
export const DEFAULT_SUGGEST_BAR = 0.4;

// Words that carry no topic in a support question ("I would like to know how...", "please help"). They are dropped
// from the question before searching, because a word the knowledge base never uses otherwise counts as the rarest.
export const COMMON = new Set(("a about above after again all also am an and any anyone anything are as at be been before being both but by can cant could " +
  "did didnt do does doesnt doing done dont each else even ever every for from get getting got had has hasnt have havent having he hello help her " +
  "here hey hi him his how hows i id if ill im in into is isnt it its ive just know let like likely look looking lot make many may me might more most " +
  "much must my need needed needs no not now of off ok okay on once one only or other our out over please possible really regarding right said see " +
  "should so some someone something soon sorry still sure tell than thank thanks that thats the their them then there theres these they thing " +
  "things this those through to too try trying u under until up us very want wanted wants was way we well were what whats when where wheres which " +
  "while who why will with wont would wouldnt yes yet you youre your yours " +
  "able actually already assist currently exactly happen happened guys anyway okay info information question questions wondering").split(/\s+/));

// Words customers and help articles use for the same thing. Each line is one group; every word in it is read as the
// first. Generic to support desks; a deployer adds their own with `synonyms` (same format) in buildAgent.
export const SYNONYMS = `arrive arrival arrived arriving receive received receiving recieve recieved delivery deliver delivered shipping ship shipped posted
cancel cancelling canceling close closing terminate terminating
fee fees charge charges cost costs price pricing
physical plastic real
change changing edit update updating modify alter
password passcode passwd
top topup topping add load deposit
country countries region regions nation
age old older young younger child children kid kids teen teenager minor underage
identity identification id
verify verification verified verifying
limit limits maximum max cap
email e-mail
phone mobile cellphone
forgot forget forgotten remember
unblock unlock unblocking
block blocked locked lock frozen
withdraw withdrawal withdrawing withdrawals atm atms
exchange convert conversion converting swap
order buy purchase
subscription membership plan
pause hold suspend
parcel package`;

export function synonymMap(extra = "") {
  const m = new Map();
  for (const line of `${SYNONYMS}\n${extra}`.split("\n")) {
    const ws = line.toLowerCase().split(/[\s,]+/).filter(Boolean); if (ws.length < 2) continue;
    for (const w of ws.slice(1)) if (!m.has(w)) m.set(w, ws[0]);
    if (!m.has(ws[0])) m.set(ws[0], ws[0]);
  }
  return m;
}
// The text with common words dropped (for questions) and synonyms folded to one word (for both sides).
export function normalise(text, syn, { dropCommon = false } = {}) {
  return String(text ?? "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/['\u2019]/g, "").split(/[^a-z0-9-]+/)
    .flatMap((w) => (w.includes("-") && !syn.has(w) ? w.split("-") : [w])).filter((w) => w && !(dropCommon && COMMON.has(w))).map((w) => syn.get(w) || w).join(" ");
}

const slugify = (s) => String(s).toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_]+/g, "-").replace(/-+/g, "-").slice(0, 60);
const plain = (s) => String(s).replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/[*_`]+/g, "").replace(/^\s*>\s?/gm, "").replace(/^\s*#+\s*/gm, "");

// Articles from Markdown separated by lines of =====, or by top-level "# " headings, each optionally opening with
// --- front matter --- (title, slug, url). JSON is accepted too: a help-keeper export ({articles: [...]}) or an
// array of {title, body, slug?, url?}. Ids are slugs and must be unique; a repeat gets -2, -3.
export function parseKnowledge(text) {
  const src = String(text ?? "").replace(/\r\n?/g, "\n").trim();
  let raw = [];
  if (/^[[{]/.test(src)) {
    let j; try { j = JSON.parse(src); } catch { throw new Error("that looks like JSON but does not parse"); }
    const list = Array.isArray(j) ? j : Array.isArray(j.articles) ? j.articles : [];
    raw = list.filter((a) => a && (!a.status || a.status === "published")).map((a) => ({ title: a.title, body: a.body ?? a.markdown ?? a.text ?? "", slug: a.slug, url: a.url }));
  } else {
    const docs = /^={5,}\s*$/m.test(src) ? src.split(/^={5,}\s*$/m) : src.split(/^(?=#\s)/m);
    for (const doc of docs) {
      if (!doc.trim()) continue;
      const meta = {}; let body = doc.trim();
      const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(body);
      if (m) { for (const line of m[1].split("\n")) { const k = /^(\w+):\s*(.*)$/.exec(line); if (k) meta[k[1].toLowerCase()] = k[2].trim(); } body = m[2].trim(); }
      if (!meta.title) { const h = /^#\s+(.+)$/m.exec(body); if (h) { meta.title = h[1].trim(); body = body.replace(/^#\s+.+\n?/m, "").trim(); } }
      raw.push({ ...meta, body });
    }
  }
  const seen = new Set(), out = [];
  for (const a of raw) {
    const title = String(a.title || "").trim().slice(0, 140); const body = String(a.body || "").trim();
    if (!title || !body) continue;
    const base = slugify(a.slug || title) || "article"; let id = base;
    for (let n = 2; seen.has(id); n++) id = `${base}-${n}`;
    seen.add(id);
    out.push({ id, title, body, url: /^https?:\/\//.test(a.url || "") ? a.url : "" });
  }
  return out;
}

// Passages: an article split at its ## headings, then into runs of paragraphs of about `words` words, each carrying
// its heading so a passage like "Click Save." still knows it is about "Changing your email".
export function passagesOf(article, words = 90) {
  const out = []; let heading = "", buf = [], n = 0;
  const flush = () => { if (buf.length) out.push({ id: `${article.id}#${n++}`, articleId: article.id, heading, text: buf.join("\n\n") }); buf = []; };
  for (const para of article.body.split(/\n\s*\n/)) {
    const h = /^#{2,6}\s+(.+)$/.exec(para.trim());
    if (h && !para.trim().includes("\n")) { flush(); heading = h[1].trim(); continue; }
    const p = plain(para).trim(); if (!p) continue;
    const len = (s) => s.split(/\s+/).length;
    if (buf.length && len(buf.join(" ")) + len(p) > words) flush();
    buf.push(p);
  }
  flush();
  return out;
}

// `examples`: past questions with what answered them, [{question, label}] where label is an article id or "handoff"
// (a person had to deal with it). They vote by similarity: a question like past ones that went to a person is less
// likely to be answered, one like past questions an article answered is pointed at that article.
export function buildAgent(articles, { threshold, suggestBar = DEFAULT_SUGGEST_BAR, synonyms = "", calibration, examples = [] } = {}) {
  const syn = synonymMap(synonyms);
  const passages = articles.flatMap((a) => passagesOf(a));
  const byId = new Map(articles.map((a) => [a.id, a]));
  const n = (t) => normalise(t, syn);
  const index = buildIndex(passages.map((p) => ({ id: p.id, title: n(byId.get(p.articleId).title), headings: n(p.heading), body: n(p.text) })));
  const passageById = new Map(passages.map((p) => [p.id, p]));
  const ex = examples.filter((e) => e.question && (e.label === "handoff" || byId.has(e.label)));
  const exIndex = buildIndex(ex.map((e, i) => ({ id: i, title: "", headings: "", body: normalise(e.question, syn, { dropCommon: true }) })));
  calibration ||= ex.length ? DEFAULT_CALIBRATION_EXAMPLES : DEFAULT_CALIBRATION;
  threshold ??= calibration.bar ?? DEFAULT_THRESHOLD;
  return { articles, byId, passages, passageById, index, threshold, suggestBar, syn, calibration, examples: ex, exIndex };
}
// Email addresses, links and long numbers (phone, order, card) say nothing about the topic; they are left out of the search.
const queryOf = (agent, q) => normalise(String(q ?? "").replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+|https?:\/\/\S+|\+?\d[\d ().-]{5,}\d/g, " "), agent.syn, { dropCommon: true });

// --- Handoff rules -------------------------------------------------------------------------------------------------
// Checked before any search. Each is a case a knowledge base should not settle on its own: the customer asked for a
// person, money has to move, the law or someone's safety is involved, the account may be compromised, or they are upset.
export const RULES = [
  { id: "human", label: "asked for a person", re: /\b(human|real person|live (agent|person|chat)|(speak|talk|chat) (to|with) (someone|somebody|a person|an? (agent|human|representative|manager))|representative|customer service agent|call me|phone call)\b/i },
  { id: "money", label: "asks us to move money (a refund, credit or charge), which needs a person to check the account", re: /\b(refund (me|my|it|this)|(want|need|get|give me|request(ing)?|demand) (a |my |the )?(full |partial )?(refund|money back|credit|reimbursement)|money back|charged (me )?twice|double[- ]charged|charged (me )?(again|the wrong|wrong|too much)|unauthori[sz]ed (charge|payment|transaction)|didn'?t authori[sz]e|cancel (the|my) (charge|payment))\b/i },
  { id: "legal", label: "mentions legal action or a payment dispute", re: /\b(lawyer|attorney|solicitor|sue|suing|lawsuit|legal action|small claims|court|chargeback|dispute (the|this|a) (charge|payment|transaction)|better business bureau|bbb|trading standards|ombudsman|consumer protection|report you)\b/i },
  { id: "safety", label: "mentions injury or a safety problem", re: /\b(injur(y|ed|ies)|hurt (me|my|him|her|them)|burn(ed|t) (me|my)|caught fire|on fire|smok(e|ing) (came|coming)|electric(al)? shock|shocked me|hospital|emergency room|allergic reaction|chok(e|ed|ing)|poison|unsafe|dangerous)\b/i },
  { id: "security", label: "says the account may be compromised", re: /\b(hack(ed|er)|someone (else )?(logged|got) into|accessed my account|stolen (account|password|card)|phish(ing)?|fraud(ulent)?|identity theft)\b/i },
  { id: "privacy", label: "asks to delete or export personal data, which needs identity checks", re: /\b(delete (all )?my (data|information|personal)|erase my|gdpr|ccpa|data (subject|access) request|right to be forgotten|what data do you (have|hold))\b/i },
  { id: "upset", label: "sounds upset", re: /\b(scam|ripoff|rip-off|furious|disgust(ed|ing)|worst (company|service|experience)|unacceptable|ridiculous|useless|pathetic|fuck\w*|shit\w*|wtf|bullshit|crap)\b/i },
];

// Card numbers (13-19 digits that pass the Luhn check) and US social security numbers: never echoed, always a person.
export function sensitiveData(text) {
  const found = [];
  for (const m of String(text).matchAll(/\b(?:\d[ -]?){13,19}\b/g)) {
    const d = m[0].replace(/\D/g, ""); let sum = 0;
    for (let i = 0; i < d.length; i++) { let x = +d[d.length - 1 - i]; if (i % 2) { x *= 2; if (x > 9) x -= 9; } sum += x; }
    if (sum % 10 === 0) { found.push("card"); break; }
  }
  if (/\b\d{3}-\d{2}-\d{4}\b/.test(text)) found.push("ssn");
  return found;
}

const CAPS = (t) => { const w = String(t).match(/[A-Za-z]{2,}/g) || []; return w.length >= 4 && w.filter((x) => x === x.toUpperCase()).length / w.length >= 0.6; };

export function handoffReasons(text) {
  const r = RULES.filter((x) => x.re.test(text)).map(({ id, label }) => ({ id, label }));
  if (CAPS(text) && !r.some((x) => x.id === "upset")) r.push({ id: "upset", label: "sounds upset" });
  const s = sensitiveData(text);
  if (s.length) r.unshift({ id: "sensitive", label: `contains what looks like a ${s.includes("card") ? "card number" : "social security number"}` });
  return r;
}

// Instructions aimed at the assistant. Answers here are copied from articles, so they cannot obey them; they are
// flagged so the log shows them and so a model prompt can be told.
export const looksLikeInjection = (t) => /\b(ignore|disregard|forget) (all |any |the )?(previous|prior|above|earlier|your) (instructions|rules|prompt)|system prompt|you are now|act as (a|an|my)|developer mode|jailbreak/i.test(t);

// --- Confidence ----------------------------------------------------------------------------------------------------
// How much of the question the best article covers: the share of the question's distinctive words (weighted by how
// rare each is in the knowledge base; a word the knowledge base never uses counts as the rarest) that the article
// contains, exactly or within a typo. Scores how well the article fits the question, not how sure a model feels.
function idf(index, t) { const p = index.postings.get(t); return Math.log(1 + (index.n + 0.5) / ((p ? p.size : 0) + 0.5)); }
function articleTerms(agent, articleId) {
  agent._terms ||= new Map();
  if (!agent._terms.has(articleId)) {
    const a = agent.byId.get(articleId);
    agent._terms.set(articleId, new Set(tokens(normalise(`${a.title}\n${plain(a.body)}`, agent.syn))));
  }
  return agent._terms.get(articleId);
}
function covers(terms, q) {
  if (terms.has(q)) return 1;
  if (q.length >= 4) { const max = q.length >= 6 ? 2 : 1; for (const t of terms) if (t[0] === q[0] && distance(q, t, max) <= max) return 0.8; }
  return 0;
}
export function coverage(agent, question, articleId) {
  const qs = [...new Set(tokens(queryOf(agent, question)))]; if (!qs.length) return 0;
  const terms = articleTerms(agent, articleId); let got = 0, all = 0;
  for (const q of qs) { const w = idf(agent.index, q); all += w; got += w * covers(terms, q); }
  return all ? got / all : 0;
}

// Ranked articles for a question: passage hits grouped by article, best passage first.
// The labels of the most similar past questions, weighted by similarity. -> { votes: Map(label -> share), best }
export function exampleVotes(agent, question, k = 5) {
  if (!agent.examples?.length) return { votes: new Map(), best: 0 };
  const hits = search(agent.exIndex, queryOf(agent, question), { limit: k });
  const votes = new Map(); let total = 0;
  for (const h of hits) { const l = agent.examples[h.id].label; votes.set(l, (votes.get(l) || 0) + h.score); total += h.score; }
  for (const [l, v] of votes) votes.set(l, v / total);
  return { votes, best: hits[0]?.score || 0 };
}

// Ranked articles for a question: passage hits grouped by article. When past questions point at one article
// (half or more of the vote), it goes first.
export function rankArticles(agent, question, limit = 5, ex = exampleVotes(agent, question)) {
  const hits = search(agent.index, queryOf(agent, question), { limit: 40 });
  const best = new Map();
  for (const h of hits) { const p = agent.passageById.get(h.id); if (!best.has(p.articleId)) best.set(p.articleId, { articleId: p.articleId, score: h.score, matchedAll: h.matchedAll, passages: [] }); best.get(p.articleId).passages.push(p); }
  let list = [...best.values()];
  const [lead] = [...ex.votes].filter(([l]) => l !== "handoff").sort((a, b) => b[1] - a[1]);
  if (lead && lead[1] >= 0.5) {
    const i = list.findIndex((r) => r.articleId === lead[0]);
    const r = i >= 0 ? list.splice(i, 1)[0] : { articleId: lead[0], score: 0, matchedAll: false, passages: [] };
    list.unshift(r);
  }
  return list.slice(0, limit).map((r) => ({ ...r, coverage: coverage(agent, question, r.articleId) }));
}

// --- Extractive answer ---------------------------------------------------------------------------------------------
export const sentences = (text) => String(text).split(/\n+|(?<=[.!?])\s+(?=[A-Z0-9"'(])/).map((s) => s.trim()).filter(Boolean);

// The best passage for the question, whole when it is short; otherwise its best sentence and the ones after it (up to
// `max`). Kept in article order and copied verbatim.
export function extract(agent, question, articleId, max = 4) {
  const qs = new Set(tokens(queryOf(agent, question)));
  const ps = agent.passages.filter((p) => p.articleId === articleId);
  let best = null;
  for (const p of ps) {
    const ss = sentences(p.text);
    ss.forEach((s, i) => {
      const ts = tokens(normalise(s, agent.syn)); let score = 0;
      for (const t of new Set(ts)) if (qs.has(t)) score += idf(agent.index, t);
      for (const t of tokens(normalise(p.heading, agent.syn))) if (qs.has(t)) score += 0.5 * idf(agent.index, t);
      if (!best || score > best.score) best = { p, ss, i, score };
    });
  }
  if (!best) return "";
  // A short passage is one thought (a step list with its lead-in, say): give it whole rather than cut it.
  if (max > 2 && best.p.text.split(/\s+/).length <= 80) return best.p.text;
  const { ss, i } = best; const out = [ss[i]];
  for (let j = i + 1; j < ss.length && out.length < max; j++) out.push(ss[j]);
  if (out.length < 2 && i > 0) out.unshift(ss[i - 1]);
  return out.join(/^\s*(\d+[.)]|[-*•])\s/.test(out[1] || "") ? "\n" : " ");
}

// --- The decision --------------------------------------------------------------------------------------------------
const cite = (agent, id) => { const a = agent.byId.get(id); return { articleId: id, title: a.title, url: a.url }; };

// --- Calibrated confidence ----------------------------------------------------------------------------------------
// Signals about the best match, turned into the chance the answer is right by a logistic model. The default weights
// were fitted on the BANKING77 tuning questions (fixtures/banking77/dev.csv, never its test split); `calibrate`
// in calibrate.mjs refits them on a deployer's own labelled questions.
export const FEATURES = ["coverage", "margin", "share", "score", "terms", "unknown", "all", "exAgree", "exHandoff", "exSim"];
export function features(agent, question, ranked, ex = { votes: new Map(), best: 0 }) {
  const [a, b] = ranked; if (!a) return null;
  const qs = [...new Set(tokens(queryOf(agent, question)))];
  const unknown = qs.filter((t) => !agent.index.postings.has(t)).length / (qs.length || 1);
  const covOthers = Math.max(0, ...ranked.slice(1).map((r) => r.coverage));
  return { coverage: a.coverage, margin: a.coverage - covOthers, share: a.score + (b?.score || 0) > 0 ? a.score / (a.score + (b?.score || 0)) : 0, score: Math.log1p(a.score),
    terms: Math.min(qs.length, 8) / 8, unknown, all: a.matchedAll ? 1 : 0,
    exAgree: ex.votes.get(a.articleId) || 0, exHandoff: ex.votes.get("handoff") || 0, exSim: Math.log1p(ex.best) };
}
// Fitted by `node fixtures/banking77/benchmark.mjs --defaults` (no past questions, and 40 per intent); `bar` is the
// confidence bar that kept wrong answers at or under 5% of answers on the tuning split.
export const DEFAULT_CALIBRATION = {weights: {coverage: -0.1506, margin: -0.3398, share: 0.8358, score: 1.1502, terms: -0.8527, unknown: -0.3158, all: -0.1693, exAgree: 0, exHandoff: 0, exSim: 0}, bias: -0.0743, mean: {coverage: 0.5237, margin: 0.1409, share: 0.6451, score: 2.0873, terms: 0.4727, unknown: 0.29, all: 0.2218, exAgree: 0, exHandoff: 0, exSim: 0}, sd: {coverage: 0.2917, margin: 0.2255, share: 0.1231, score: 0.5358, terms: 0.2065, unknown: 0.2446, all: 0.4154, exAgree: 1, exHandoff: 1, exSim: 1}, bar: 0.923};
export const DEFAULT_CALIBRATION_EXAMPLES = {weights: {coverage: -0.6698, margin: 0.5823, share: -0.1528, score: 0.8603, terms: -0.5611, unknown: -0.0755, all: -0.0192, exAgree: 2.0404, exHandoff: -0.8373, exSim: -0.1072}, bias: 0.8343, mean: {coverage: 0.4911, margin: 0.095, share: 0.6063, score: 1.9942, terms: 0.4725, unknown: 0.2907, all: 0.1968, exAgree: 0.57, exHandoff: 0.3384, exSim: 2.734}, sd: {coverage: 0.2931, margin: 0.2663, share: 0.177, score: 0.6352, terms: 0.2065, unknown: 0.2455, all: 0.3976, exAgree: 0.4364, exHandoff: 0.4244, exSim: 0.3985}, bar: 0.787};
export function probability(cal, f) {
  if (!f) return 0;
  if (cal.raw) return f.coverage;
  if (!cal.weights) return 0;
  let z = cal.bias;
  for (const k of FEATURES) z += (cal.weights[k] || 0) * ((f[k] - (cal.mean[k] || 0)) / (cal.sd[k] || 1));
  return 1 / (1 + Math.exp(-z));
}

export function decide(agent, question, { threshold = agent.threshold, suggestBar = agent.suggestBar } = {}) {
  const q = String(question ?? "").slice(0, 2000).trim();
  const flags = looksLikeInjection(q) ? ["injection"] : [];
  const reasons = handoffReasons(q);
  const ex = q ? exampleVotes(agent, q) : { votes: new Map(), best: 0 };
  const ranked = q ? rankArticles(agent, q, 5, ex) : [];
  const top = ranked[0], f = top ? features(agent, q, ranked, ex) : null;
  const confidence = Math.round(probability(agent.calibration, f) * 1000) / 1000;
  const related = ranked.slice(0, 3).map((r) => cite(agent, r.articleId));
  const base = { confidence, topArticle: top?.articleId || null, flags, related, features: f };
  if (reasons.length) {
    const sensitive = reasons.some((r) => r.id === "sensitive");
    return { ...base, action: "handoff", reasons, citations: [],
      text: sensitive ? "Please do not send card or ID numbers here; we never need them in a message. I'm passing this to a person on our team, who will reply to you directly."
        : "I'm passing this to a person on our team so they can look at your account and reply to you directly." };
  }
  const content = tokens(queryOf(agent, q));
  if (!content.length) return { ...base, action: "clarify", reasons: [{ id: "empty", label: "no question yet" }], citations: [], text: "Hi! What can I help you with?" };
  if (content.length === 1 && ranked.length > 1 && f.share < 0.6) {
    return { ...base, action: "clarify", reasons: [{ id: "vague", label: "one word could mean several things" }], citations: [],
      text: `Could you tell me a bit more? These might be what you are after: ${related.map((r) => r.title).join("; ")}.` };
  }
  if (top && confidence < threshold && confidence >= suggestBar) {
    const two = ranked.slice(0, 2).filter((r, i) => i === 0 || r.coverage >= 0.5 * top.coverage);
    return { ...base, action: "suggest", reasons: [{ id: "maybe", label: `the best match scores ${Math.round(confidence * 100)}%: enough to suggest, under the ${Math.round(threshold * 100)}% bar to answer` }],
      citations: two.map((r) => cite(agent, r.articleId)),
      text: `These help articles may answer it:\n\n${two.map((r) => `${agent.byId.get(r.articleId).title}: ${extract(agent, q, r.articleId, 3)}`).join("\n\n")}\n\nIf not, I can pass this to a person on our team.` };
  }
  if (!top || confidence < threshold) {
    const why = [{ id: "not_covered", label: top ? `the best match scores ${Math.round(confidence * 100)}%, under the ${Math.round(threshold * 100)}% bar` : "no article matches" }];
    if ((ex.votes.get("handoff") || 0) >= 0.5) why.push({ id: "like_handoffs", label: "similar past questions needed a person" });
    return { ...base, action: "handoff", reasons: why,
      citations: [], text: "I don't have an answer to that in our help articles, so I'm passing it to a person on our team." };
  }
  return { ...base, action: "answer", reasons: [{ id: "covered", label: `the best match scores ${Math.round(confidence * 100)}% (the article has ${Math.round(top.coverage * 100)}% of the question's words)` }],
    citations: [cite(agent, top.articleId)], text: extract(agent, q, top.articleId) };
}
