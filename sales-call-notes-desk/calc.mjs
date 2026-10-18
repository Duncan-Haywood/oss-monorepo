// Sales call notes -> what you learned, what you still do not know, the CRM
// fields, and a follow-up email you send yourself. Pure functions: no network,
// no storage. The rules are keyword and pattern rules over the text you paste,
// so every item it reports carries the sentence it came from; nothing is
// invented, and a field with no evidence is reported as missing, not guessed.

export const FIELDS = [
  { id: "need", label: "Pain / need", ask: "What is not working today, and what does it cost you when it goes wrong?" },
  { id: "metrics", label: "Quantified impact", ask: "How would you measure success: hours, dollars, error rate, volume?" },
  { id: "budget", label: "Budget", ask: "Is there a budget set aside for this, or how do you usually fund something like it?" },
  { id: "authority", label: "Decision maker", ask: "Who else signs off on this, and can we include them in the next call?" },
  { id: "timeline", label: "Timeline", ask: "Is there a date this needs to be live by, and what happens if it slips?" },
  { id: "process", label: "Decision process", ask: "What steps come between a yes from you and a signed order (security review, legal, procurement)?" },
  { id: "criteria", label: "Decision criteria", ask: "What must a solution do for you to pick it, and what would rule one out?" },
  { id: "competition", label: "Alternatives", ask: "What are you using today, and who else are you looking at?" },
  { id: "nextstep", label: "Dated next step", ask: "Can we put the next call on the calendar before we hang up?" },
];

const OBJECTIONS = [
  { id: "price", label: "Price", re: /\b(too expensive|expensive|pricey|cost too much|costs too much|cheaper|discount|price is|pricing is|over (our|the) budget|budget is tight|can'?t afford|cannot afford)\b/i },
  { id: "timing", label: "Timing", re: /\b(not (right )?now|bad timing|next (year|quarter)|later this year|after (the )?(holidays?|launch|audit|q[1-4]|summer)|too busy|no bandwidth|not a priority right now)\b/i },
  { id: "authority", label: "Not their call", re: /\b(not my decision|run it by|check with|talk to my (boss|manager|team)|need (to get )?(approval|buy.?in)|have to ask)\b/i },
  { id: "need", label: "Need / status quo", re: /\b(we'?re (fine|good|ok)|works? fine|good enough|happy with (what|our|the)|don'?t (really )?see (the|a) need|not sure we need|no need)\b/i },
  { id: "trust", label: "Trust / security", re: /\b(security|privacy|soc ?2|hipaa|gdpr|data residency|references?|case stud(y|ies)|new company|startup|how long (have|has) you|burned before|been burned)\b/i },
  { id: "integration", label: "Integration / switching", re: /\b(integrat\w*|works? with|migrat\w*|switching cost|import our|api|sso)\b/i },
];

const BRUSH_OFF = /\b(send me (some |a )?(info|information|details|a deck|pricing|something)|email me (some|the|a)|call me back|check back|circle back (in|next|after)|think about it|let me get back to you|we'll be in touch)\b/i;

const TITLE = /\b(ceo|cfo|cto|coo|cmo|cro|ciso|cio|vp|vice president|svp|evp|director|head of|chief [a-z]+ officer|founder|co-?founder|owner|president|general manager|gm|manager|controller|procurement|purchasing|legal counsel|counsel)\b/i;
const SIGNOFF = /\b(sign(s|ed)? off|final say|decision.?maker|economic buyer|approves?|approval|budget owner|holds the budget|has to (approve|sign)|needs to (approve|sign))\b/i;

const MONEY = /\$\s?\d[\d,]*(?:\.\d+)?\s?(?:k|m|mm|thousand|million)?\b/gi;
const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const MON_RE = "(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
const DUE = new RegExp(
  "\\b(today|tonight|tomorrow|eod|end of (?:the )?(?:day|week|month|quarter)|next week|next month|(?:this |next |on )?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|" +
    "(?:by |on |before )?" + MON_RE + "\\.? \\d{1,2}(?:st|nd|rd|th)?|\\d{1,2}/\\d{1,2}(?:/\\d{2,4})?|in \\d+ (?:days?|weeks?|months?)|q[1-4])\\b",
  "i",
);

const clip = (s, n = 220) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);

/** Split pasted notes into units: one per bullet/line, long lines split by sentence. */
export function splitNotes(text) {
  const out = [];
  for (const raw of String(text || "").split(/\r?\n/)) {
    let line = raw.replace(/^\s*(?:[-*•·]|\d+[.)])\s+/, "").trim();
    if (!line) continue;
    let speaker = null;
    const sp = line.match(/^([A-Z][\w.'-]*(?: [A-Z][\w.'-]*){0,2})\s*(?:\([^)]*\))?\s*:\s+(.*)$/);
    if (sp && sp[1].split(" ").length <= 3 && !/^(Next steps?|Action items?|Notes?|Summary|TODO|AI|Pain|Budget|Timeline|Competition|Decision)$/i.test(sp[1])) {
      speaker = sp[1];
      line = sp[2];
    }
    for (const s of line.split(/(?<=[.!?])\s+(?=[A-Z"'(])/)) {
      const t = s.trim();
      if (t.length > 2) out.push({ text: t, speaker });
    }
  }
  return out;
}

function monthIndex(word) {
  const w = word.toLowerCase().slice(0, 3);
  return MONTHS.findIndex((m) => m.startsWith(w));
}

const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (d, n) => new Date(d.getTime() + n * 86400000);

/** Turn a due phrase into an ISO date relative to `today` (a Date or ISO string), or null. */
export function parseDue(phrase, today) {
  if (!phrase) return null;
  const base = new Date(`${typeof today === "string" ? today.slice(0, 10) : iso(today || new Date())}T00:00:00Z`);
  if (Number.isNaN(base.getTime())) return null;
  const p = phrase.toLowerCase().replace(/^(by|on|before) /, "").trim();
  if (p === "today" || p === "tonight" || p === "eod" || p === "end of day" || p === "end of the day") return iso(base);
  if (p === "tomorrow") return iso(addDays(base, 1));
  if (p === "next week") return iso(addDays(base, ((8 - base.getUTCDay()) % 7) || 7));
  if (p === "end of week" || p === "end of the week") return iso(addDays(base, ((5 - base.getUTCDay()) + 7) % 7));
  let m = p.match(/^in (\d+) (day|week|month)s?$/);
  if (m) {
    const n = Number(m[1]);
    if (m[2] === "month") { const d = new Date(base); d.setUTCMonth(d.getUTCMonth() + n); return iso(d); }
    return iso(addDays(base, n * (m[2] === "week" ? 7 : 1)));
  }
  m = p.match(/^(?:this |next |on )?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/);
  if (m) {
    const want = DAY_NAMES.indexOf(m[1]);
    let diff = (want - base.getUTCDay() + 7) % 7;
    if (diff === 0) diff = 7;
    return iso(addDays(base, diff));
  }
  m = p.match(new RegExp(`^(${MON_RE})\\.? (\\d{1,2})`, "i"));
  if (m) {
    let d = new Date(Date.UTC(base.getUTCFullYear(), monthIndex(m[1]), Number(m[2])));
    if (d < base) d = new Date(Date.UTC(base.getUTCFullYear() + 1, monthIndex(m[1]), Number(m[2])));
    return iso(d);
  }
  m = p.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (m) {
    const mo = Number(m[1]) - 1, day = Number(m[2]);
    if (mo < 0 || mo > 11 || day < 1 || day > 31) return null;
    let y = m[3] ? Number(m[3]) : base.getUTCFullYear();
    if (y < 100) y += 2000;
    let d = new Date(Date.UTC(y, mo, day));
    if (!m[3] && d < base) d = new Date(Date.UTC(y + 1, mo, day));
    return iso(d);
  }
  return null;
}

const NEXT_RE = /\b(next steps?|action items?|follow.?up|will (send|share|schedule|book|set up|loop|intro|introduce|review|check|get|come back|circle|forward|draft|prepare)|i'?ll|we'?ll|they'?ll|she'?ll|he'?ll|to send|send (over|them|her|him|a|the)|schedule|book (a|the|time)|set up (a|the|time)|loop in|todo|ai:)\b/i;
const THEM_RE = /\b(they|she|he|their side|customer|prospect|client|they'?ll|she'?ll|he'?ll)\b/i;
const YOU_RE = /\b(i|i'?ll|we|we'?ll|our side|me)\b/i;

function stepOwner(unit, repNames) {
  if (unit.speaker) {
    return repNames.some((n) => n && unit.speaker.toLowerCase() === n) ? "you" : "them";
  }
  const t = unit.text;
  if (/\b(they'?ll|she'?ll|he'?ll|their side|customer to|prospect to|client to|will (send|share|loop|intro|review|check|get|come back) .* (to|for) us)\b/i.test(t) || (THEM_RE.test(t) && !/\b(i'?ll|we'?ll|i will|we will)\b/i.test(t) && /\b(will|to)\b/i.test(t) && !YOU_RE.test(t))) return "them";
  if (/\b(i'?ll|we'?ll|i will|we will|our side|i'?m going to|we'?re going to)\b/i.test(t) || /^(i|we) /i.test(t)) return "you";
  return "unclear";
}

/**
 * Read the notes. `opts.rep` is your name(s), comma separated, so a transcript's
 * speaker labels can be sorted into you and them; `opts.competitors` is a list
 * of names to look for; `opts.today` anchors due dates (ISO date).
 */
export function analyzeCall(notes, opts = {}) {
  const units = splitNotes(notes);
  const repNames = String(opts.rep || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  const today = opts.today || iso(new Date());
  const found = Object.fromEntries(FIELDS.map((f) => [f.id, []]));
  const add = (id, u) => { if (!found[id].some((e) => e.text === u.text)) found[id].push({ text: clip(u.text), speaker: u.speaker }); };

  const stakeholders = new Map();
  const speakers = new Set();
  const competitors = new Set();
  const objections = [];
  const nextSteps = [];
  const brushOffs = [];
  const amounts = [];
  const customComp = String(opts.competitors || "").split(/[,\n]/).map((s) => s.trim()).filter(Boolean);

  for (const u of units) {
    const t = u.text;
    if (u.speaker && !repNames.includes(u.speaker.toLowerCase())) speakers.add(u.speaker);

    if (/\b(struggl\w*|pain|problem|issue|frustrat\w*|manual(ly)?|takes? (too )?(long|forever)|slow|errors?|mistakes?|churn\w*|losing|wast\w+|bottleneck|spreadsheets?|can'?t|cannot|falls? through|breaks?|broken|nightmare|hate)\b/i.test(t)) add("need", u);
    if (/\b\d[\d,.]*\s?(%|percent|hours?|hrs|days?|weeks?|people|reps|seats|users|employees|staff|tickets|leads|orders|invoices|locations|stores|customers)\b/i.test(t) || /\bper (week|month|year|day|seat|user)\b/i.test(t) || (t.match(MONEY) && /\b(lose|losing|cost|costs|costing|save|saving|waste|wasting|revenue|churn|leak)\b/i.test(t))) add("metrics", u);

    const money = t.match(MONEY);
    if (/\b(budget|allocated|approved (spend|funding)|funded|earmarked|set aside|spend(ing)? up to|cap of|can spend|ceiling)\b/i.test(t) || (money && /\b(budget|per (month|year|seat|user)|a (month|year)|annual|monthly|range|up to|around|about)\b/i.test(t))) {
      add("budget", u);
    }
    if (money) for (const m of money) if (!amounts.includes(m.trim())) amounts.push(m.trim());

    if (SIGNOFF.test(t) || (TITLE.test(t) && /\b(decid\w*|approv\w*|sign\w*|owns?|runs?|reports? to|boss|manager|lead|in charge)\b/i.test(t))) add("authority", u);
    const tm = t.match(TITLE);
    if (tm) {
      const name = t.match(/\b([A-Z][a-z]+(?: [A-Z][a-z]+)?)\s*\(([^)]*)\)/) || t.match(/\b([A-Z][a-z]+(?: [A-Z][a-z]+)?),? (?:the |our |their )?(?:vp|cfo|ceo|cto|coo|cmo|director|head of|controller|owner|founder|manager)/i);
      const key = (name ? name[1] : tm[1]).toLowerCase();
      if (!stakeholders.has(key)) stakeholders.set(key, { who: name ? name[1] : null, title: tm[1], text: clip(t) });
    }

    const due = t.match(DUE);
    if (/\b(deadline|(go|be|going) live|launch|renew\w*|expires?|by (the )?end of|before (the )?(season|peak|holidays|audit|launch|year.?end)|(must|have to|need to) be (live|done|in place|running)|need(s|ed)? (it |this )?(by|before)|in \d+ (weeks?|months?)|season|q[1-4])\b/i.test(t) && (due || /\b(deadline|(go|be|going) live|renew\w*|expires?|season|peak)\b/i.test(t))) add("timeline", u);

    if (/\b(process|procurement|security review|legal review|vendor (review|onboarding)|rfp|pilot|trial|poc|proof of concept|committee|board|steering|sign.?off chain|three quotes|approval (chain|process)|contract review|redlines?)\b/i.test(t)) add("process", u);
    if (/\b(must.?have|need(s)? to (have|support|work|integrate|be)|requirements?|criteria|deal.?breakers?|looking for|important to (them|us|her|him)|priorit\w+|compliance|soc ?2|hipaa|sso|evaluating (on|based)|non.?negotiable)\b/i.test(t)) add("criteria", u);

    const cm = [...t.matchAll(/\b(?:currently using|currently use|already use|already using|looked at|looking into|tried|demoed|evaluated|using|uses|switching from|replacing|replace|evaluating|looking at|compar(?:ing|ed) (?:to|with)|vs\.?|versus|incumbent|renewal with|moving off|migrating from)\s+([A-Z][\w.&+-]*(?: [A-Z][\w.&+-]*)?)/g)];
    let compHit = cm.length > 0;
    for (const m of cm) if (!/^(The|Our|Their|A|An|It|This|That|Excel|Google Sheets|Sheets|Spreadsheets?)$/.test(m[1])) competitors.add(m[1]); else if (/^(Excel|Google Sheets|Sheets|Spreadsheets?)$/.test(m[1])) competitors.add(m[1] === "Spreadsheets" ? "spreadsheets" : m[1]);
    for (const c of customComp) if (new RegExp(`\\b${c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(t)) { competitors.add(c); compHit = true; }
    if (/\b(spreadsheets?|status quo|in.?house|homegrown|built (it )?ourselves|do it by hand|pen and paper|competitor|alternatives?|other vendors?|shopping around)\b/i.test(t)) compHit = true;
    if (compHit) add("competition", u);

    for (const o of OBJECTIONS) {
      if (o.re.test(t) && !(o.id === "integration" && !/\b(concern|worr\w*|need|must|does it|can it|will it|how|issue|hard|difficult|cost)\b/i.test(t))) {
        objections.push({ id: o.id, label: o.label, text: clip(t) });
      }
    }
    if (BRUSH_OFF.test(t)) brushOffs.push(clip(t));

    if (NEXT_RE.test(t) && (due || /\b(next steps?|action items?|follow.?up|will|i'?ll|we'?ll|to send|send|schedule|book|set up|loop in)\b/i.test(t)) && !/^(they|she|he) (said|mentioned|told|asked|wants?|needs?|has|have|had)\b/i.test(t)) {
      const owner = stepOwner(u, repNames);
      const dueText = due ? due[0] : null;
      nextSteps.push({ text: clip(t), owner, dueText, due: dueText ? parseDue(dueText, today) : null });
    }
  }

  // A dated step is the field; an undated one is reported but does not count.
  if (nextSteps.some((s) => s.dueText)) for (const s of nextSteps.filter((x) => x.dueText)) found.nextstep.push({ text: s.text, speaker: null });

  const coverage = FIELDS.map((f) => ({ id: f.id, label: f.label, found: found[f.id].length > 0, evidence: found[f.id].slice(0, 3), ask: f.ask }));
  const have = coverage.filter((c) => c.found).length;
  const people = new Set([...speakers, ...[...stakeholders.values()].map((s) => (s.who || s.title).toLowerCase())]);

  const flags = [];
  if (!found.nextstep.length) flags.push({ id: "no-dated-next-step", level: "high", text: nextSteps.length ? "There is a next step but no date on it. An undated next step is usually a hope, not a plan: put a date on it before you send the follow-up." : "No next step in these notes. Agree one with a date, even a short call, before the deal goes quiet." });
  if (!found.authority.length) flags.push({ id: "no-decision-maker", level: "high", text: "Nobody who decides or signs off appears in the notes. Ask who else needs to say yes." });
  if (brushOffs.length) flags.push({ id: "brush-off", level: "high", text: `A brush-off phrase appears (“${brushOffs[0]}”). Ask what they would want to see in it, and book the time to review it together.` });
  if (!found.budget.length) flags.push({ id: "no-budget", level: "mid", text: "No budget or price range came up. You may be quoting blind." });
  if (!found.timeline.length) flags.push({ id: "no-timeline", level: "mid", text: "No date or deadline came up, so there is no reason for them to decide this quarter." });
  if (people.size <= 1 && units.length > 4) flags.push({ id: "single-threaded", level: "mid", text: "Only one person shows up in the notes. A deal with one contact stalls the day that person is busy or leaves." });
  if (competitors.size && !found.criteria.length) flags.push({ id: "competitor-no-criteria", level: "mid", text: "An alternative is in play but no decision criteria were captured. Ask what would make them pick one over the other." });
  const priceObj = objections.filter((o) => o.id === "price").length;
  if (priceObj && !found.metrics.length) flags.push({ id: "price-no-value", level: "mid", text: "Price came up but nothing in the notes puts a number on the problem. Without the cost of the status quo, any price is too high." });

  return {
    units: units.length,
    coverage,
    qualified: have,
    total: FIELDS.length,
    percent: Math.round((have / FIELDS.length) * 100),
    stakeholders: [...stakeholders.values()],
    speakers: [...speakers],
    competitors: [...competitors],
    objections,
    nextSteps,
    amounts,
    brushOffs,
    flags,
    gaps: coverage.filter((c) => !c.found).map((c) => ({ id: c.id, label: c.label, ask: c.ask })),
  };
}

/** One flat record for a CRM import or a paste into a deal's notes. */
export function crmFields(a, meta = {}) {
  const ev = (id) => (a.coverage.find((c) => c.id === id)?.evidence || []).map((e) => e.text).join(" | ");
  const dated = a.nextSteps.filter((s) => s.dueText).sort((x, y) => String(x.due || "9").localeCompare(String(y.due || "9")))[0] || a.nextSteps[0];
  return {
    Company: meta.company || "",
    Contact: meta.contact || "",
    "Call date": meta.date || "",
    "Qualification coverage": `${a.qualified}/${a.total}`,
    Pain: ev("need"),
    "Quantified impact": ev("metrics"),
    Budget: ev("budget"),
    "Amounts mentioned": a.amounts.join(", "),
    "Decision maker": ev("authority"),
    Stakeholders: a.stakeholders.map((s) => (s.who ? `${s.who} (${s.title})` : s.title)).join("; "),
    Timeline: ev("timeline"),
    "Decision process": ev("process"),
    "Decision criteria": ev("criteria"),
    Alternatives: [a.competitors.join(", "), ev("competition")].filter(Boolean).join(" | "),
    Objections: a.objections.map((o) => `${o.label}: ${o.text}`).join(" | "),
    "Next step": dated ? dated.text : "",
    "Next step date": dated && dated.due ? dated.due : dated && dated.dueText ? dated.dueText : "",
    "Next step owner": dated ? dated.owner : "",
    "Open questions": a.gaps.map((g) => g.label).join("; "),
    Risks: a.flags.map((f) => f.id).join("; "),
  };
}

/** CSV with the spreadsheet-formula guard: a cell starting = + - @ gets a leading apostrophe. */
export function toCsv(records) {
  const rows = Array.isArray(records) ? records : [records];
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]);
  const cell = (v) => {
    let s = String(v ?? "");
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.map(cell).join(","), ...rows.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\n") + "\n";
}

const humanDate = (isoDay) => new Date(`${isoDay}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
const firstName = (n) => String(n || "").trim().split(/\s+/)[0];
const lc = (s) => s.replace(/^[A-Z](?=[a-z])/, (c) => c.toLowerCase());

/**
 * A follow-up email draft built only from the notes: what you heard, what each
 * side agreed to do, and up to two questions for the gaps. You send it.
 */
export function followUpEmail(a, meta = {}) {
  const to = firstName(meta.contact);
  const sign = meta.you ? meta.you : "";
  const heard = (a.coverage.find((c) => c.id === "need")?.evidence || []).slice(0, 2);
  const mine = a.nextSteps.filter((s) => s.owner !== "them");
  const theirs = a.nextSteps.filter((s) => s.owner === "them");
  const fmt = (s) => `- ${s.text.replace(/^(i'?ll|we'?ll|i will|we will)\s+/i, (m) => (/^i/i.test(m) ? "I will " : "We will ")).replace(/\.$/, "")}${s.due ? ` (${humanDate(s.due)})` : ""}`;
  const lines = [];
  lines.push(`Hi${to ? " " + to : ""},`, "", `Thanks for the time${meta.company ? " on " + meta.company : ""}${meta.date ? " (" + meta.date + ")" : ""}. A quick recap so we are working from the same page.`);
  if (heard.length) {
    lines.push("", "What I heard:");
    for (const h of heard) lines.push(`- ${h.text}`);
  }
  if (mine.length || theirs.length) {
    lines.push("", "What we agreed:");
    for (const s of mine) lines.push(fmt(s));
    if (theirs.length) lines.push("", "On your side, as I noted it:");
    for (const s of theirs) lines.push(`- “${s.text.replace(/\.$/, "")}”${s.due ? ` (${humanDate(s.due)})` : ""}`);
  } else {
    lines.push("", "Proposed next step: a 20-minute call to walk through this together. Which day this week or next suits you?");
  }
  const qs = a.gaps.filter((g) => ["authority", "timeline", "budget", "criteria", "process"].includes(g.id)).slice(0, 2);
  if (qs.length) {
    lines.push("", "Two things that would help me before then:");
    for (const q of qs) lines.push(`- ${q.ask}`);
  }
  lines.push("", "Let me know if I got anything wrong.", "", sign || "[your name]");
  return { subject: `Recap${meta.company ? " — " + meta.company : ""} and next steps`, body: lines.join("\n") };
}

/** Checks any follow-up email (built-in, hand-written or model-written) against the notes. */
export function checkEmail(text, notes) {
  const errors = [], warnings = [];
  const body = String(text || "");
  const src = String(notes || "").toLowerCase().replace(/,/g, "");
  for (const m of body.match(MONEY) || []) {
    if (!src.includes(m.toLowerCase().replace(/,/g, "").replace(/\s+/g, " ").trim()) && !src.replace(/\s/g, "").includes(m.toLowerCase().replace(/[,\s]/g, ""))) errors.push(`The figure ${m.trim()} is not in your notes. Do not put a number in an email that you did not hear.`);
  }
  if (/\b(guarantee[sd]?|promise[sd]?|risk.?free|100%|best price|lowest price)\b/i.test(body)) errors.push("It makes a guarantee or a promise about price or results. Take it out unless you can stand behind it in writing.");
  if (/\b(discount|% off|special offer|limited time|act now|expires)\b/i.test(body)) warnings.push("It mentions a discount or urgency that you may not have agreed on the call.");
  if (/\b(unsubscribe|opt.?out)\b/i.test(body)) warnings.push("This reads like a mass email. A recap to someone you spoke with should read as one person writing to one person.");
  const words = body.trim().split(/\s+/).filter(Boolean).length;
  if (words > 220) warnings.push(`It runs ${words} words. A recap is read on a phone; aim for under 200.`);
  if (words < 25) warnings.push("It is very short; check that it still recaps the call.");
  if (!/\b(next|call|meet|demo|send|schedule|by )\b/i.test(body)) warnings.push("No next step is visible in it.");
  if (/\[your name\]/i.test(body)) warnings.push("Replace [your name] before sending.");
  return { errors, warnings };
}

export const SAMPLE_NOTES = `Call with Dana Reyes (Ops Director), Brightline Logistics, 45 min.
Dana: Right now dispatch builds the weekly routes by hand in spreadsheets. It takes two people about 12 hours a week and we still get errors, maybe 8% of stops are wrong.
Dana: We looked at RouteWorks last year but it was too expensive for our size.
Dana: Budget is roughly $20k a year, I'd have to check with Marcus (CFO) because he signs off on anything over $15k.
Dana: We have to be live before peak season starts on January 15.
Dana: Security review with their IT team takes about three weeks. Must have a QuickBooks integration.
Me: I'll send the sample route comparison by Tuesday.
Dana: I'll loop in Marcus and get you thirty minutes with him.
Me: I'll book a follow-up with Marcus for next Thursday.`;
