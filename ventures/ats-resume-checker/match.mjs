/**
 * Job-posting keyword match, as a deterministic module.
 *
 * The second half of the resume problem. checker.mjs asks "does the text
 * extract cleanly?"; this asks "does the wording cover what this posting asks
 * for?". It reads a resume and one job posting, pulls the skills, tools and
 * qualifications the posting leans on, and reports which the resume covers and
 * which it never mentions, most important first.
 *
 * How the posting is read (all original heuristics, no model, no network):
 *
 *   - Terms are single words and 2-3 word phrases, compared on a light stem
 *     (plural / -ing / -ed stripped) so "managing" matches "managed" and
 *     "dashboards" matches "dashboard".
 *   - A term's weight rises with how often the posting repeats it, whether it
 *     appears in the title line, in a "requirements" style section, or next to
 *     "required / must / proficient"; it falls in "nice to have" sections.
 *   - Boilerplate that appears in nearly every posting ("team", "company",
 *     "ability to") is dropped, as are words that carry no skill.
 *   - Common aliases are treated as one term (js = javascript, k8s =
 *     kubernetes, ml = machine learning, ...).
 *   - Years-of-experience and degree requirements are reported separately,
 *     since they are not keywords a person can "add".
 *
 * The score is this tool's own weighted coverage figure, not any applicant
 * tracking system's score and not a prediction of an interview. Matching a
 * keyword you do not actually have is not something this encourages: every
 * "missing" entry is a prompt to check whether you have the experience and say
 * so truthfully, not an instruction to paste words in.
 */

const STOP = new Set(`a an and are as at be but by for from has have in is it its of on or our that the their
this to was we will with you your they them these those who which what when where how not can may should would
could also any all each both more most other such than then there into over under about up out per via etc ie eg
including include includes using use used work works working role position job candidate candidates applicant
applicants looking seeking join opportunity company team teams ability able strong excellent good great
experience experienced years year plus required requirements preferred qualification qualifications responsibilities
responsible duties day days week new well across within while like need needs must nice
equal employer employment benefits salary apply based us we're you'll proficient senior junior complex strong`.split(/\s+/));

// Boilerplate that survives the stop list but says nothing about skills.
const GENERIC = new Set(`business customers customer clients client people individuals environment fast paced
success successful growth help helping ensure support supports provide provides providing develop developing
manage manages ability skills skill knowledge understanding understand familiarity proficiency proven track
record results driven self motivated passionate passion dynamic organization organizations stakeholders
cross functional functional collaborate collaborating collaboration communicate communication
multiple various relevant related similar etc area areas level levels high highly make making take
building build drive creating create deliver delivering part full time remote hybrid onsite location
requirement preferred bonus plus equivalent degree field`.split(/\s+/));

// Alias groups: any member counts as the first.
const ALIASES = [
  ["javascript", "js", "ecmascript", "es6"],
  ["typescript", "ts"],
  ["kubernetes", "k8s"],
  ["machine learning", "ml"],
  ["artificial intelligence", "ai"],
  ["natural language processing", "nlp"],
  ["continuous integration", "ci", "ci/cd", "cicd"],
  ["amazon web services", "aws"],
  ["google cloud platform", "gcp", "google cloud"],
  ["microsoft excel", "excel"],
  ["search engine optimization", "seo"],
  ["customer relationship management", "crm"],
  ["key performance indicators", "kpi", "kpis"],
  ["user experience", "ux"],
  ["user interface", "ui"],
  ["application programming interface", "api", "apis", "rest api", "restful"],
  ["structured query language", "sql"],
  ["human resources", "hr"],
  ["quality assurance", "qa"],
  ["project management", "project manager"],
  ["profit and loss", "p&l", "pnl", "p and l"],
  ["return on investment", "roi"],
  ["objectives and key results", "okr", "okrs"],
  ["software as a service", "saas"],
  ["business intelligence", "bi"],
  ["point of sale", "pos"],
  ["enterprise resource planning", "erp"],
  ["electronic health records", "ehr", "emr"],
  ["cpr", "cardiopulmonary resuscitation"],
  ["node.js", "nodejs", "node js", "node"],
  ["react", "react.js", "reactjs"],
  ["postgresql", "postgres"],
  ["golang", "go lang"],
];

// Skills worth recognising even when a posting mentions them once.
const HARD = new Set([
  "python",
  "java",
  "javascript",
  "typescript",
  "sql",
  "excel",
  "tableau",
  "looker",
  "matlab",
  "scala",
  "rust",
  "golang",
  "ruby",
  "php",
  "swift",
  "kotlin",
  "c++",
  "c#",
  ".net",
  "react",
  "angular",
  "vue",
  "node.js",
  "django",
  "flask",
  "spring",
  "aws",
  "azure",
  "gcp",
  "docker",
  "kubernetes",
  "terraform",
  "ansible",
  "jenkins",
  "git",
  "linux",
  "bash",
  "postgresql",
  "mysql",
  "mongodb",
  "redis",
  "kafka",
  "spark",
  "hadoop",
  "snowflake",
  "dbt",
  "airflow",
  "pytorch",
  "tensorflow",
  "scikit-learn",
  "pandas",
  "numpy",
  "figma",
  "sketch",
  "photoshop",
  "illustrator",
  "salesforce",
  "hubspot",
  "zendesk",
  "jira",
  "confluence",
  "asana",
  "quickbooks",
  "netsuite",
  "sap",
  "oracle",
  "workday",
  "gaap",
  "ifrs",
  "forecasting",
  "budgeting",
  "reconciliation",
  "payroll",
  "auditing",
  "underwriting",
  "compliance",
  "hipaa",
  "sox",
  "gdpr",
  "osha",
  "cpr",
  "phlebotomy",
  "forklift",
  "cdl",
  "autocad",
  "solidworks",
  "revit",
  "agile",
  "scrum",
  "kanban",
  "seo",
  "sem",
  "analytics",
  "a/b",
  "crm",
  "erp",
  "saas",
  "api",
  "graphql",
  "microservices",
  "statistics",
  "bookkeeping",
  "procurement",
  "merchandising",
  "copywriting",
  "power bi",
  "six sigma",
  "machine learning",
  "data analysis",
  "data science",
  "accounts payable",
  "accounts receivable",
  "supply chain",
  "project management",
  "rest api",
  "ci/cd",
  "natural language processing",
  "business intelligence",
  "financial modeling",
  "customer service",
  "product management",
  "a/b testing",
  "data visualization",
  "deep learning",
  "computer vision",
  "sales forecasting",
  "inventory management",
]);

const SOFT = new Set([
  "leadership",
  "communication",
  "collaboration",
  "teamwork",
  "mentoring",
  "coaching",
  "negotiation",
  "adaptability",
  "creativity",
  "prioritization",
  "stakeholder",
  "presentation",
  "facilitation",
  "empathy",
  "problem solving",
  "time management",
  "conflict resolution",
  "critical thinking",
  "stakeholder management",
  "cross-functional collaboration",
]);

const REQ_HEAD = /\b(requirements?|qualifications?|what you('|’)ll need|what we('|’)re looking for|must have|you have|skills? (and|&) experience|minimum)\b/i;
const NICE_HEAD = /\b(nice to have|preferred|bonus|a plus|desired|ideal(ly)?)\b/i;
const RESP_HEAD = /\b(responsibilit(y|ies)|what you('|’)ll do|duties|the role|about the role)\b/i;
const STRONG_CUE = /\b(required|must|proficien(t|cy)|expert(ise)?|fluen(t|cy)|hands-on|minimum)\b/i;

export function stem(w) {
  let s = w.toLowerCase();
  if (s.length <= 3) return s;
  if (/(sses|ies)$/.test(s)) s = s.replace(/ies$/, "y").replace(/sses$/, "ss");
  else if (/[^s]s$/.test(s) && !/(ss|us|is)$/.test(s)) s = s.slice(0, -1);
  if (s.length > 5) s = s.replace(/(ing|ed)$/, "");
  if (s.length > 5) s = s.replace(/(er|or)$/, "");
  if (s.length > 4) s = s.replace(/(ation|ment)$/, "");
  return s;
}

// Tokens keep c++, c#, .net, node.js, ci/cd, a/b, p&l intact.
const TOKEN = /(?:\.(?=[a-z]))?[a-z0-9][a-z0-9+#.&/'’-]*[a-z0-9+#]|[a-z0-9]/gi;

export function tokenize(text) {
  const out = [];
  for (const m of String(text).toLowerCase().matchAll(TOKEN)) {
    let t = m[0].replace(/['’]s$/, "").replace(/\.+$/, "");
    if (t) out.push(t);
  }
  return out;
}

const aliasOf = new Map();
for (const group of ALIASES) {
  const canon = group[0];
  for (const g of group) aliasOf.set(tokenize(g).map(stem).join(" "), canon);
}

function canonical(tokens) {
  const key = tokens.map(stem).join(" ");
  const canon = aliasOf.get(key);
  return canon ? tokenize(canon).map(stem).join(" ") : key;
}

/** Every 1-3 token window as a canonical key -> display form. */
function ngramsOf(tokens, maxN = 3) {
  const list = [];
  for (let n = 1; n <= maxN; n++) {
    for (let i = 0; i + n <= tokens.length; i++) {
      const win = tokens.slice(i, i + n);
      list.push({ win, i, n });
    }
  }
  return list;
}

function isNoise(win) {
  if (win.every((t) => STOP.has(t) || GENERIC.has(t))) return true;
  if (STOP.has(win[0]) || STOP.has(win[win.length - 1])) return true;
  if (GENERIC.has(win[0]) && win.length === 1) return true;
  if (win.some((t) => /^\d+$/.test(t)) && win.length === 1) return true;
  if (win.length === 1 && win[0].length < 2) return true;
  return false;
}

function classify(display) {
  const d = display.toLowerCase();
  if (HARD.has(d)) return "hard";
  if (SOFT.has(d)) return "soft";
  if ([...HARD].some((h) => h.includes(" ") && d === h)) return "hard";
  return "other";
}

/** Split a posting into lines tagged with the section they sit in. */
function sectionLines(text) {
  const lines = String(text).split(/\r?\n/);
  let section = "body";
  return lines.map((line, idx) => {
    const t = line.trim();
    const headingLike = t.length > 0 && t.length < 70 && !/[.!?]$/.test(t) && (/:$/.test(t) || t === t.toUpperCase() || /^[A-Z][^.]{0,60}$/.test(t));
    if (headingLike) {
      if (NICE_HEAD.test(t)) section = "nice";
      else if (REQ_HEAD.test(t)) section = "req";
      else if (RESP_HEAD.test(t)) section = "resp";
    }
    return { line: t, idx, section };
  });
}

/** Weighted terms a posting leans on. */
export function extractTerms(posting, { limit = 40 } = {}) {
  const lines = sectionLines(posting).filter((l) => l.line);
  const titleIdx = lines.length ? lines[0].idx : -1;
  const found = new Map();

  for (const { line, idx, section } of lines) {
    const tokens = tokenize(line);
    const strong = STRONG_CUE.test(line);
    for (const { win } of ngramsOf(tokens)) {
      if (isNoise(win)) continue;
      const display = win.join(" ");
      const canon = canonical(win);
      if (!canon) continue;
      let e = found.get(canon);
      if (!e) {
        e = { key: canon, display, n: win.length, count: 0, weight: 0, title: false, req: false, nice: false, kind: classify(display) };
        found.set(canon, e);
      }
      e.count += 1;
      let w = 1;
      if (section === "req") { w += 1; e.req = true; }
      if (section === "nice") { w -= 0.5; e.nice = true; }
      if (strong) w += 1;
      if (idx === titleIdx) { w += 2; e.title = true; }
      e.weight += w;
    }
  }

  const terms = [...found.values()].filter((e) => {
    if (e.kind === "other") {
      // Unknown words must earn their place: repeated, in the title, or a
      // multi-word phrase repeated, or flagged required.
      if (e.n === 1) return e.count >= 2 || e.title || (e.req && e.weight >= 3);
      return e.count >= 2 || e.title;
    }
    return true;
  });

  // A longer phrase swallows a part of itself that is no more frequent than it
  // is ("senior data analyst" swallows "senior data"); a known skill is only
  // swallowed by a longer known skill.
  const contains = (long, short) => ` ${long} `.includes(` ${short} `);
  const keep = terms.filter((t) => {
    return !terms.some((p) => p !== t && p.n > t.n && p.count >= t.count && contains(p.key, t.key) && (t.kind === "other" || p.kind !== "other"));
  });

  keep.forEach((t) => {
    const boost = t.kind === "hard" ? 2 : t.kind === "soft" ? 0.5 : 1;
    t.importance = Math.round((t.weight * boost + (t.n > 1 ? 0.5 : 0)) * 10) / 10;
  });
  keep.sort((a, b) => b.importance - a.importance || b.count - a.count || a.display.localeCompare(b.display));
  return keep.slice(0, limit);
}

function yearsRequired(posting) {
  const re = /(\d{1,2})\s*(?:\+|-\s*\d{1,2}|to\s*\d{1,2})?\s*\+?\s*years?(?:['’]s?)?\s*(?:of\s+)?(?:\w+\s+){0,4}?experience/gi;
  const hits = [];
  for (const m of String(posting).matchAll(re)) hits.push(Number(m[1]));
  return hits.length ? Math.max(...hits) : null;
}

function yearsClaimed(resume) {
  const m = [...String(resume).matchAll(/(\d{1,2})\s*\+?\s*years?/gi)].map((x) => Number(x[1]));
  return m.length ? Math.max(...m) : null;
}

const DEGREES = [
  { id: "doctorate", re: /\b(ph\.?d|doctorate|doctoral)\b/i, rank: 4 },
  { id: "master", re: /\b(master'?s?|m\.?s\.?c?|mba|m\.?eng)\b/i, rank: 3 },
  { id: "bachelor", re: /\b(bachelor'?s?|b\.?s\.?c?|b\.?a\.?|undergraduate degree|4-year degree)\b/i, rank: 2 },
  { id: "associate", re: /\b(associate'?s?|a\.?a\.?s?)\s+degree\b/i, rank: 1 },
];

function degreeRank(text) {
  let best = 0;
  for (const d of DEGREES) if (d.re.test(text)) best = Math.max(best, d.rank);
  return best;
}

function resumeStemStream(resume) {
  const toks = tokenize(resume);
  const stems = toks.map(stem);
  return { toks, stems };
}

/**
 * Compare a resume with one posting.
 * Returns { ok, score, label, matched, missing, extras, years, degree, stats }.
 */
export function matchPosting(resume, posting) {
  const r = String(resume || "");
  const p = String(posting || "");
  if (tokenize(p).length < 25) {
    return { ok: false, reason: "posting-too-short", message: "Paste the whole job posting (at least a few sentences) so there is enough to read." };
  }
  if (tokenize(r).length < 25) {
    return { ok: false, reason: "resume-too-short", message: "Paste more of the resume text first." };
  }

  const terms = extractTerms(p);
  if (terms.length === 0) {
    return { ok: false, reason: "no-terms", message: "No skill-like terms could be read from that posting. Paste the requirements section too." };
  }

  // Build the resume stream, then canonicalise every 1-3 window so aliases line up.
  const { toks } = resumeStemStream(r);
  const windows = new Map();
  for (const { win } of ngramsOf(toks)) {
    const k = canonical(win);
    windows.set(k, (windows.get(k) || 0) + 1);
  }

  const matched = [];
  const missing = [];
  let gained = 0;
  let total = 0;
  for (const t of terms) {
    const hits = windows.get(t.key) || 0;
    total += t.importance;
    if (hits > 0) {
      gained += t.importance;
      matched.push({ term: t.display, kind: t.kind, importance: t.importance, inResume: hits, inPosting: t.count });
    } else {
      missing.push({ term: t.display, kind: t.kind, importance: t.importance, inPosting: t.count, required: t.req, niceToHave: t.nice && !t.req, inTitle: t.title });
    }
  }
  const score = total === 0 ? 0 : Math.round((gained / total) * 100);

  const need = yearsRequired(p);
  const claimed = yearsClaimed(r);
  const years = need === null ? null : { required: need, stated: claimed, meets: claimed === null ? null : claimed >= need };

  const wantRank = degreeRank(p);
  const haveRank = degreeRank(r);
  const degree = wantRank === 0 ? null : { required: DEGREES.find((d) => d.rank === wantRank).id, stated: haveRank ? DEGREES.find((d) => d.rank === haveRank).id : null, meets: haveRank >= wantRank };

  return {
    ok: true,
    score,
    label: score >= 75 ? "strong" : score >= 50 ? "partial" : "weak",
    matched,
    missing,
    years,
    degree,
    stats: { termsRead: terms.length, matchedCount: matched.length, missingCount: missing.length },
  };
}

export function summarizeMatch(result) {
  if (!result.ok) return { level: "error", text: result.message };
  const { score, matched, missing } = result;
  const top = missing.filter((m) => m.kind === "hard").slice(0, 3).map((m) => m.term);
  const lead = `Your resume covers ${score}% of the weighted terms this posting leans on (${matched.length} of ${matched.length + missing.length}).`;
  const tail = top.length ? ` Highest-weight terms it never mentions: ${top.join(", ")}.` : missing.length ? " The terms it never mentions are listed below." : " Every term read from the posting appears in your resume.";
  return { level: result.label, text: lead + tail };
}
