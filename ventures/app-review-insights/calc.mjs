// App review insights from an App Store Connect / Google Play Console review export
// (or any CSV with a rating and review text). Pure functions, no DOM, no network.

const ALIASES = {
  rating: ["star rating", "rating", "stars", "score", "review rating"],
  title: ["review title", "title", "subject", "headline"],
  text: ["review text", "review", "body", "content", "text", "comment", "review body"],
  date: ["review submit date and time", "review last update date and time", "date", "review date", "submitted", "updated", "created", "created at"],
  version: ["app version name", "version", "app version", "review version", "app version code"],
  reply: ["developer reply text", "developer reply", "reply", "response", "developer response"],
  country: ["country", "territory", "reviewer language", "storefront"],
};

export const DEFAULT_OPTIONS = {
  lowStar: 2, // reviews at or below this count as unhappy
  minVersionReviews: 5, // a version with fewer reviews is too thin to compare
  regressionDrop: 0.5, // stars lost versus the previous qualifying version
  minTermCount: 3, // an unhappy-review term must appear in this many reviews
  recentDays: 30, // window for "rising": the newest review back this far, against the same span before it
  support: "your support email", // filled into draft replies
};

// Plain keyword themes. A review can match several. These are starting
// vocabularies for common app complaints, not a classifier: edit them in the
// source if your app's words differ.
export const THEMES = [
  { key: "crashes", label: "Crashes and freezes", re: /\b(crash\w*|freez\w*|froze|force clos\w*|keeps? closing|won'?t open|not opening|stuck|black screen|white screen|unresponsive|hangs?)\b/i },
  { key: "bugs", label: "Bugs and broken features", re: /\b(bug\w*|glitch\w*|broken|doesn'?t work|does not work|not working|stopped working|error\w*|fails?|failed|issue\w*)\b/i },
  { key: "login", label: "Login and account", re: /\b(log ?in|log ?out|sign ?in|sign ?up|password|account|verification|verify|locked out|2fa)\b/i },
  { key: "billing", label: "Price, billing and subscriptions", re: /\b(price\w*|pricing|expensive|subscription\w*|subscribe\w*|billing|billed|charged|charge|refund\w*|paywall|paid|pay|free trial|cancel\w*|cost\w*|money)\b/i },
  { key: "ads", label: "Ads", re: /\b(ads?|advert\w*|popups?|pop-ups?|banner\w*)\b/i },
  { key: "performance", label: "Slow, battery and storage", re: /\b(slow\w*|lag\w*|laggy|battery|drain\w*|loading|load times?|takes forever|memory|storage|heavy|overheat\w*)\b/i },
  { key: "sync", label: "Sync and lost data", re: /\b(sync\w*|lost|lose|losing|deleted|disappear\w*|backup|restore|missing data|data loss)\b/i },
  { key: "design", label: "Design and usability", re: /\b(ui|ux|design\w*|layout|confusing|confused|hard to use|difficult|clunky|cluttered|dark mode|font|too small|navigation|interface)\b/i },
  { key: "support", label: "Support and response", re: /\b(support|customer service|no response|never replied|ignored|contacted|helpdesk|email(ed)?)\b/i },
  { key: "requests", label: "Missing features and requests", re: /\b(please add|wish|would be nice|would love|need to add|needs? a|missing|no option|can'?t (even )?(change|export|edit)|feature request|add an? )\b/i },
  { key: "update", label: "After an update", re: /\b(update\w*|latest version|new version|since the update|after the update|used to|was better|ruined|worse)\b/i },
  { key: "privacy", label: "Privacy and permissions", re: /\b(privacy|permission\w*|tracking|tracks|spy\w*|personal data|location)\b/i },
];

// One short, promise-free draft per theme. They ask for details and never name a date or a fix.
export const REPLIES = {
  crashes: "Thanks for telling us, and sorry about the crashes. Could you send your device model, OS version and app version to {support}? That is what lets us reproduce it.",
  bugs: "Sorry something is not working. Please email {support} with what you tapped and what you saw, and the app version, so we can look into it.",
  login: "Sorry you could not get into your account. Please email {support} from the address on the account and tell us what you see when you try.",
  billing: "Thanks for the honest feedback. App store purchases are handled by the store, so we cannot see your card, but email {support} with the order number and we will help with what we can.",
  ads: "Thanks for the feedback on ads. We hear this and weigh it against what belongs in the free version.",
  performance: "Thanks for the report. Which screen is slow, and on which device? That helps us find where the time goes.",
  sync: "We are sorry about the missing data. Please email {support} before reinstalling or deleting anything, so we can check whether it can be recovered.",
  design: "Thank you, this kind of detail helps. Which screen or step was confusing?",
  support: "You are right to expect an answer, and we are sorry you did not get one. Please write to {support} and we will reply personally.",
  requests: "Thank you for the idea. It goes on our list; we cannot promise a date, but requests we hear more than once move up.",
  update: "Sorry the latest update made things worse for you. Tell us your app version and what changed for you at {support}.",
  privacy: "We take this seriously. Our privacy policy lists what we collect, and we are glad to answer questions about any permission at {support}.",
};
const GENERIC_REPLY = "Thanks for the feedback. Could you tell us a little more about what happened? You can reach us at {support}.";

const STOP = new Set(("the and for are but not you your this that with have has had was were its it's it i'm i've im ive can cant can't dont don't did didn't doesn't does just very really too get got one all out use used using from they them their there here what when which will would could should about into than then also been being because only some any more most much even still every let make made after before over again while where why how our out off app apps application please thanks thank good great love like need want").split(/\s+/));

export function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  const src = String(text ?? "").replace(/^﻿/, "");
  // Some exports are tab or semicolon separated; take the delimiter the header line uses most.
  const head = src.split(/\r?\n/, 1)[0] || "";
  const count = (ch) => (head.match(new RegExp(ch === "\t" ? "\\t" : ch, "g")) || []).length;
  const delim = count("\t") > count(",") ? "\t" : count(";") > count(",") ? ";" : ",";
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') { if (src[i + 1] === '"') { field += '"'; i++; } else quoted = false; }
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === delim) { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  return rows;
}

export function parseDate(value) {
  const s = String(value ?? "").trim();
  if (!s) return null;
  if (/^\d{9,10}$/.test(s)) return new Date(Number(s) * 1000);
  const iso = /^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2})?)?(Z)?$/.test(s)
    ? s.replace(" ", "T") + (s.length > 10 ? "" : "T00:00:00") + (s.endsWith("Z") ? "" : "Z")
    : s;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function parseRating(value) {
  const s = String(value ?? "").trim();
  if (!s) return null;
  const stars = (s.match(/[★⭐]/g) || []).length;
  if (stars >= 1 && stars <= 5) return stars;
  const m = s.match(/^(\d(?:\.\d+)?)/);
  if (!m) return null;
  const n = Math.round(Number(m[1]));
  return n >= 1 && n <= 5 ? n : null;
}

const norm = (h) => String(h).trim().toLowerCase().replace(/\s+/g, " ");

export function normalizeRows(rows) {
  if (!rows.length) return { error: "The file has no rows." };
  const header = rows[0].map(norm);
  const col = {};
  for (const [k, names] of Object.entries(ALIASES)) {
    for (const name of names) { const i = header.indexOf(name); if (i >= 0) { col[k] = i; break; } }
  }
  if (col.rating === undefined) return { error: "No rating column found. Expected a header such as Star Rating or Rating." };
  if (col.text === undefined && col.title === undefined) return { error: "No review text column found. Expected a header such as Review Text, Review or Body." };
  const reviews = [], skipped = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const get = (k) => (col[k] === undefined ? "" : String(row[col[k]] ?? "").trim());
    const rating = parseRating(get("rating"));
    if (rating === null) { skipped.push({ line: r + 1, reason: "no readable 1-5 rating" }); continue; }
    const date = col.date === undefined ? null : parseDate(get("date"));
    reviews.push({
      line: r + 1, rating, date,
      text: [get("title"), get("text")].filter(Boolean).join(". "),
      version: get("version") || "", reply: get("reply"), country: get("country"),
    });
  }
  if (!reviews.length) return { error: "No row had a readable 1-5 rating." };
  return { reviews, skipped, hasVersion: col.version !== undefined, hasReply: col.reply !== undefined, hasDate: col.date !== undefined };
}

const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const monthKey = (d) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

export function tokens(text) {
  return String(text).toLowerCase().replace(/[’]/g, "'").match(/[a-z][a-z0-9']{2,}/g)?.map((t) => t.replace(/'s$/, "")) ?? [];
}

// Terms and two-word phrases that show up in unhappy reviews far more than in
// happy ones. Per-review presence, so one rambling review cannot dominate.
export function distinctiveTerms(reviews, opts = DEFAULT_OPTIONS) {
  const low = reviews.filter((r) => r.rating <= opts.lowStar), high = reviews.filter((r) => r.rating >= 4);
  if (!low.length) return [];
  const grams = (r) => {
    const t = tokens(r.text), out = new Set();
    for (const w of t) if (!STOP.has(w)) out.add(w);
    for (let i = 0; i + 1 < t.length; i++) if (!STOP.has(t[i]) && !STOP.has(t[i + 1])) out.add(`${t[i]} ${t[i + 1]}`);
    return out;
  };
  const df = (list) => { const m = new Map(); for (const r of list) for (const g of grams(r)) m.set(g, (m.get(g) || 0) + 1); return m; };
  const lowDf = df(low), highDf = df(high);
  const out = [];
  for (const [term, n] of lowDf) {
    if (n < opts.minTermCount) continue;
    const h = highDf.get(term) || 0;
    const score = Math.log((n + 0.5) / (low.length + 1)) - Math.log((h + 0.5) / (high.length + 1));
    if (score > 0.7) out.push({ term, low: n, high: h, score });
  }
  out.sort((a, b) => b.score - a.score || b.low - a.low || (a.term < b.term ? -1 : 1));
  // Drop a single word when a listed phrase already contains it.
  const phrases = out.filter((x) => x.term.includes(" "));
  return out.filter((x) => x.term.includes(" ") || !phrases.some((p) => p.term.split(" ").includes(x.term))).slice(0, 12);
}

export function analyze(reviews, options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const n = reviews.length;
  const sum = reviews.reduce((s, r) => s + r.rating, 0);
  const avg = sum / n;
  const dist = [1, 2, 3, 4, 5].map((s) => ({ stars: s, count: reviews.filter((r) => r.rating === s).length }));
  const dated = reviews.filter((r) => r.date);
  const summary = {
    reviews: n, avg, lowShare: reviews.filter((r) => r.rating <= opts.lowStar).length / n,
    from: dated.length ? monthKey(dated.reduce((a, r) => (r.date < a ? r.date : a), dated[0].date)) : null,
    to: dated.length ? monthKey(dated.reduce((a, r) => (r.date > a ? r.date : a), dated[0].date)) : null,
  };

  const monthMap = new Map();
  for (const r of dated) { const k = monthKey(r.date); (monthMap.get(k) || monthMap.set(k, []).get(k)).push(r); }
  const byMonth = [...monthMap.keys()].sort().map((k) => {
    const list = monthMap.get(k);
    return { key: k, reviews: list.length, avg: mean(list.map((r) => r.rating)), lowShare: list.filter((r) => r.rating <= opts.lowStar).length / list.length };
  });

  // Versions in order of their first dated review (or first appearance).
  const verMap = new Map();
  reviews.forEach((r, i) => {
    if (!r.version) return;
    const v = verMap.get(r.version) || { key: r.version, list: [], first: Infinity };
    v.list.push(r);
    v.first = Math.min(v.first, r.date ? r.date.getTime() : i);
    verMap.set(r.version, v);
  });
  const byVersion = [...verMap.values()].sort((a, b) => a.first - b.first).map((v) => ({
    key: v.key, reviews: v.list.length, avg: mean(v.list.map((r) => r.rating)),
    lowShare: v.list.filter((r) => r.rating <= opts.lowStar).length / v.list.length,
  }));

  const regressions = [];
  const solid = byVersion.filter((v) => v.reviews >= opts.minVersionReviews);
  for (let i = 1; i < solid.length; i++) {
    const drop = solid[i - 1].avg - solid[i].avg;
    if (drop >= opts.regressionDrop - 1e-9) {
      const unhappy = verMap.get(solid[i].key).list.filter((r) => r.rating <= opts.lowStar);
      const top = THEMES.map((t) => ({ label: t.label, n: unhappy.filter((r) => t.re.test(r.text)).length })).filter((t) => t.n > 0).sort((a, b) => b.n - a.n)[0] || null;
      regressions.push({ from: solid[i - 1].key, to: solid[i].key, drop, fromAvg: solid[i - 1].avg, toAvg: solid[i].avg, topTheme: top ? top.label : null, themeCount: top ? top.n : 0 });
    }
  }

  const themes = THEMES.map((t) => {
    const hit = reviews.filter((r) => t.re.test(r.text)), rest = reviews.filter((r) => !t.re.test(r.text));
    const tAvg = mean(hit.map((r) => r.rating));
    const restAvg = mean(rest.map((r) => r.rating));
    // What-if: these reviews rated like the rest of the file.
    const uplift = hit.length && rest.length ? (hit.length * (restAvg - tAvg)) / n : 0;
    return { key: t.key, label: t.label, mentions: hit.length, share: hit.length / n, avg: tAvg, lowMentions: hit.filter((r) => r.rating <= opts.lowStar).length, uplift };
  }).filter((t) => t.mentions > 0).sort((a, b) => b.uplift - a.uplift || b.mentions - a.mentions);

  const terms = distinctiveTerms(reviews, opts);

  const hasReply = reviews.some((r) => r.reply);
  const unanswered = hasReply ? reviews.filter((r) => r.rating <= opts.lowStar && !r.reply).sort((a, b) => (a.date?.getTime() ?? 0) - (b.date?.getTime() ?? 0)) : [];
  const answeredLow = hasReply ? reviews.filter((r) => r.rating <= opts.lowStar && r.reply).length : 0;

  // Rising: a theme's share of reviews in the newest window against the window before it, measured back from the
  // newest review in the file (not today). Needs three mentions in the newest window so one angry user cannot start one.
  let rising = [];
  if (dated.length) {
    const DAY = 86400000, newest = Math.max(...dated.map((r) => r.date.getTime()));
    const cut = newest - opts.recentDays * DAY, cut2 = cut - opts.recentDays * DAY;
    const recent = dated.filter((r) => r.date.getTime() > cut), prior = dated.filter((r) => r.date.getTime() > cut2 && r.date.getTime() <= cut);
    rising = THEMES.map((t) => {
      const a = recent.filter((r) => t.re.test(r.text)).length, b = prior.filter((r) => t.re.test(r.text)).length;
      const rs = recent.length ? a / recent.length : 0, ps = prior.length ? b / prior.length : 0;
      return { key: t.key, label: t.label, recent: a, prior: b, recentTotal: recent.length, priorTotal: prior.length, recentShare: rs, priorShare: ps };
    }).filter((t) => t.recent >= 3 && (t.priorShare === 0 || t.recentShare >= 1.5 * t.priorShare)).sort((a, b) => b.recent - a.recent);
  }
  for (const u of unanswered) {
    const t = THEMES.find((x) => x.key !== "requests" && x.re.test(u.text)) || THEMES.find((x) => x.re.test(u.text));
    u.draft = (t && REPLIES[t.key] ? REPLIES[t.key] : GENERIC_REPLY).replace("{support}", opts.support);
  }

  const findings = [];
  for (const t of rising.slice(0, 3)) {
    findings.push({ severity: "high", title: `"${t.label}" is rising`, detail: `${t.recent} of the ${t.recentTotal} reviews in the newest ${opts.recentDays} days mention it (${(t.recentShare * 100).toFixed(0)}%), against ${t.prior} of ${t.priorTotal} in the ${opts.recentDays} days before (${(t.priorShare * 100).toFixed(0)}%).` });
  }
  for (const g of regressions) {
    findings.push({ severity: "high", title: `Version ${g.to} averages ${g.toAvg.toFixed(2)}, down ${g.drop.toFixed(2)} stars from ${g.from}`,
      detail: g.topTheme ? `Among the unhappy reviews of ${g.to}, the most common theme is "${g.topTheme}" (${g.themeCount}). Read those reviews first.` : `Read the unhappy reviews of ${g.to} first.` });
  }
  const worst = themes.find((t) => t.uplift >= 0.02);
  if (worst) findings.push({ severity: "medium", title: `"${worst.label}" costs the most stars`, detail: `${worst.mentions} reviews (${(worst.share * 100).toFixed(0)}%) mention it and average ${worst.avg.toFixed(2)} stars. If they had rated like the rest of the file, the overall average would be about ${worst.uplift.toFixed(2)} higher. That is a what-if, not a promise.` });
  if (hasReply && unanswered.length) findings.push({ severity: "medium", title: `${unanswered.length} low-star review(s) have no developer reply`, detail: `${answeredLow} low-star review(s) did get one. Replying to an unhappy reviewer is the cheapest thing you can do for a rating, since many stores let a reviewer revise it.` });
  if (byMonth.length >= 4) {
    const last3 = byMonth.slice(-3), prev = byMonth.slice(0, -3);
    const a = mean(last3.map((m) => m.avg)), b = mean(prev.map((m) => m.avg));
    if (b - a >= 0.3) findings.push({ severity: "medium", title: "The last three months are rating lower than before", detail: `${a.toFixed(2)} on average, against ${b.toFixed(2)} in the ${prev.length} month(s) before.` });
  }
  if (!findings.length) findings.push({ severity: "info", title: "No version drop or costly theme stands out", detail: "Nothing in this file crosses the thresholds. Lower the thresholds or add more reviews if you expected a finding." });

  return { summary, dist, byMonth, byVersion, regressions, rising, themes, terms, unanswered, answeredLow, hasReply, findings, options: opts };
}

export const stars = (x) => (x === null || x === undefined ? "–" : x.toFixed(2));
export const pct = (x) => (x === null || x === undefined ? "–" : `${(x * 100).toFixed(1)}%`);

export function sampleCsv() {
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const lines = ["Review Submit Date and Time,App Version Name,Star Rating,Review Title,Review Text,Developer Reply Text"];
  const happy = ["Does exactly what I need", "Clean and simple", "Love the widgets", "Great for daily tracking", "Easy to use, thanks"];
  const crash = ["Crashes every time I open the camera", "App keeps freezing after the update", "Constant crashes since the update, unusable"];
  const bill = ["Too expensive for what it does", "Charged me after I cancelled my subscription", "Paywall appeared after the update, want a refund"];
  const sync = ["Lost all my data after syncing", "Sync never finishes and entries disappear"];
  const request = ["Please add dark mode", "Would love an export option, missing CSV export"];
  const versions = [["2.1.0", 0.12, 40], ["2.2.0", 0.12, 45], ["2.3.0", 0.45, 50], ["2.4.0", 0.3, 55]];
  const pad = (n) => String(n).padStart(2, "0");
  let month = 3;
  for (const [v, badRate, count] of versions) {
    for (let i = 0; i < count; i++) {
      const d = `2026-${pad(month)}-${pad(1 + Math.floor(rnd() * 27))} 10:00:00`;
      const bad = rnd() < badRate;
      let r, text, reply = "";
      if (bad) {
        const k = rnd(); r = rnd() < 0.6 ? 1 : 2;
        const pool = v === "2.3.0" ? (k < 0.7 ? crash : bill) : k < 0.35 ? bill : k < 0.6 ? sync : k < 0.8 ? request : crash;
        text = pool[Math.floor(rnd() * pool.length)];
        if (rnd() < 0.35) reply = "Sorry about this, please email support so we can fix it.";
      } else { r = rnd() < 0.6 ? 5 : 4; text = happy[Math.floor(rnd() * happy.length)]; }
      lines.push(`${d},${v},${r},,"${text}",${reply}`);
    }
    month += 1;
  }
  return lines.join("\n") + "\n";
}
