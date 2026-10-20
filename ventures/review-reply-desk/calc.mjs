// Review Reply Desk: read pasted customer reviews and write the owner's public reply.
// Pure functions, no network, no dependencies. The deterministic composer is the
// product; ai.mjs can polish it with the owner's own key and every AI reply is
// run back through checkReply() before it is shown.

export const REVIEW_LIMIT = 4096; // Google Business Profile reply limit, characters

export const BUSINESS_TYPES = {
  restaurant: { label: "Restaurant, cafe or bar", health: false, noun: "meal", visit: "visit" },
  home: { label: "Contractor or home service", health: false, noun: "job", visit: "project" },
  auto: { label: "Auto repair or detailing", health: false, noun: "service", visit: "visit" },
  salon: { label: "Salon, spa or barber", health: false, noun: "appointment", visit: "appointment" },
  retail: { label: "Shop or retail", health: false, noun: "order", visit: "visit" },
  lodging: { label: "Hotel or short-term rental", health: false, noun: "stay", visit: "stay" },
  health: { label: "Dental, medical or therapy practice", health: true, noun: "care", visit: "experience" },
  generic: { label: "Other local business", health: false, noun: "experience", visit: "visit" },
};

// Topic lexicon: each topic has words that appear in complaints and in praise.
export const TOPICS = {
  wait: { label: "waiting time", words: ["wait", "waited", "waiting", "slow", "late", "took forever", "hour", "delay", "delayed", "long time"] },
  price: { label: "pricing", words: ["price", "priced", "expensive", "overpriced", "overcharged", "cost", "charged", "fee", "rip off", "ripoff", "cheap", "value", "affordable"] },
  staff: { label: "the team", words: ["staff", "server", "waiter", "waitress", "employee", "receptionist", "manager", "technician", "stylist", "owner", "crew", "team", "rude", "friendly", "kind", "helpful", "professional"] },
  quality: { label: "quality", words: ["quality", "cold", "undercooked", "overcooked", "bland", "broken", "shoddy", "sloppy", "delicious", "perfect", "flawless", "excellent work", "great work", "tasty", "fresh", "stale", "poor workmanship"] },
  clean: { label: "cleanliness", words: ["dirty", "filthy", "clean", "spotless", "hair", "smell", "smelled", "mess", "bugs", "roach"] },
  communication: { label: "communication", words: ["call", "called back", "never called", "no response", "ghosted", "communicat", "text", "email", "returned my", "didn't answer", "did not answer", "no show", "no-show", "showed up", "didn't show", "did not show"] },
  booking: { label: "scheduling", words: ["appointment", "booked", "booking", "reservation", "reschedule", "rescheduled", "cancel", "cancelled", "canceled", "schedule"] },
  results: { label: "the result", words: ["result", "results", "love it", "love the", "turned out", "fixed", "fixed it", "solved", "still broken", "came back", "not fixed", "worked", "works great"] },
};

const NEG_WORDS = ["rude", "terrible", "awful", "horrible", "worst", "never again", "disappointed", "disappointing", "slow", "cold", "dirty", "filthy", "overcharged", "rip off", "ripoff", "unprofessional", "waste", "avoid", "poor", "bad", "late", "no show", "no-show", "ghosted", "broken", "refund"];
const POS_WORDS = ["love", "loved", "great", "amazing", "excellent", "best", "perfect", "friendly", "fantastic", "wonderful", "awesome", "recommend", "highly", "thank", "happy", "fast", "professional", "clean", "delicious"];

const FLAG_RULES = [
  { id: "legal", level: "stop", re: /\b(lawyer|attorney|sue|suing|lawsuit|legal action|small claims|bbb|better business bureau|attorney general)\b/i,
    text: "The review mentions legal action. Do not argue or admit fault in public: reply briefly, move it offline, and tell whoever advises your business before anything longer." },
  { id: "safety", level: "stop", re: /\b(injur\w+|hospital|food poisoning|got sick|sick after|allergic reaction|unsafe|fire hazard|assault\w*|harass\w+|discriminat\w+|racist|sexist|stolen|theft|stole)\b/i,
    text: "The review describes a safety, injury, harassment or theft claim. Keep the public reply short and non-committal, investigate privately, and do not describe what happened." },
  { id: "fake", level: "check", re: /\b(never (been|ate|ordered|visited|went|used)|not a customer|wasn'?t there|was never there|wrong (business|company|place))\b/i,
    text: "The reviewer may not be a real customer. Look for them in your records first. If there is no match, report the review to the platform as not based on a real experience; do not accuse them publicly." },
  { id: "incentive", level: "check", re: /\b(free (meal|drink|dessert|service|stuff)|discount|coupon|refund|compensat\w+|make it right)\b/i,
    text: "The reviewer is asking for something. A public offer of a refund or freebie invites copycat complaints, and you may never offer anything in exchange for a changed review. Resolve it privately." },
  { id: "competitor", level: "check", re: /\b(better (than you|at \w+)|went (to|with) (a )?(competitor|another|someone else))\b/i,
    text: "The review compares you to a competitor. Do not mention the competitor in your reply." },
];

const LEGAL_SAFE_FLAGS = new Set(["legal", "safety"]);

export function stripStarsLine(line) {
  const t = line.trim();
  let m = t.match(/^([★☆⭐]{1,5})(?:\s|$)/u);
  if (m) return { rating: (m[1].match(/[★⭐]/gu) || []).length, rest: t.slice(m[0].length).trim() };
  m = t.match(/^(?:rating[:\s]*)?([1-5])(?:\.0)?\s*(?:\/\s*5|stars?|\*)(?:\s*[-:–—]\s*|\s+|$)/i);
  if (m) return { rating: Number(m[1]), rest: t.slice(m[0].length).trim() };
  m = t.match(/^rating[:\s]+([1-5])\b\s*(.*)$/i);
  if (m) return { rating: Number(m[1]), rest: m[2].trim() };
  return null;
}

/**
 * Split pasted text into reviews. A review starts at a line that opens with a
 * star rating ("5 stars", "★★★★☆", "Rating: 2") or at a blank-line gap. A
 * leading "Name - " or "Name:" before the body names the reviewer.
 */
export function parseReviews(text) {
  const lines = String(text || "").replace(/\r/g, "").split("\n");
  const blocks = [];
  let cur = null;
  const flush = () => { if (cur && (cur.body.length || cur.rating)) blocks.push(cur); cur = null; };
  for (const line of lines) {
    if (!line.trim()) { if (cur && cur.body.length) flush(); continue; }
    const s = stripStarsLine(line);
    if (s) { flush(); cur = { rating: s.rating, body: s.rest ? [s.rest] : [] }; continue; }
    if (!cur) cur = { rating: null, body: [] };
    cur.body.push(line.trim());
  }
  flush();
  return blocks.map((b, i) => {
    let body = b.body.join(" ").replace(/\s+/g, " ").trim();
    let reviewer = "";
    const m = body.match(/^([A-Z][\p{L}'.-]*(?:\s[A-Z][\p{L}'.-]*)?)\s*(?:[-–—:]\s+)(.+)$/u);
    if (m && m[1].split(" ").length <= 2 && !/^(Great|Good|Bad|Terrible|Awful|Amazing|Love|Loved|Best|Worst|Excellent|Horrible|Update|Highly|Very|Never|Always|Food|Service)$/.test(m[1])) { reviewer = m[1]; body = m[2]; }
    return { index: i, rating: b.rating, reviewer, body };
  });
}

function hasWord(hay, w) {
  return new RegExp(`(^|[^a-z])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i").test(hay);
}

export function inferRating(body) {
  const t = String(body || "").toLowerCase();
  const neg = NEG_WORDS.filter((w) => hasWord(t, w)).length;
  const pos = POS_WORDS.filter((w) => hasWord(t, w)).length;
  if (pos === neg) return 3;
  return pos > neg ? (pos - neg >= 2 ? 5 : 4) : (neg - pos >= 2 ? 1 : 2);
}

/** Rating, tone, topics and flags for one parsed review. */
export function analyze(review, type = "generic") {
  const body = String(review.body || "");
  const low = body.toLowerCase();
  const guessed = review.rating == null;
  const rating = guessed ? inferRating(body) : review.rating;
  const sentiment = rating >= 4 ? "positive" : rating === 3 ? "mixed" : "negative";
  const topics = [];
  for (const [id, t] of Object.entries(TOPICS)) {
    const hit = t.words.find((w) => hasWord(low, w));
    if (hit) topics.push(id);
  }
  const flags = FLAG_RULES.filter((r) => r.re.test(body)).map((r) => ({ id: r.id, level: r.level, text: r.text }));
  const health = (BUSINESS_TYPES[type] || BUSINESS_TYPES.generic).health;
  if (health) flags.push({ id: "privacy", level: "stop", text: "Health privacy: replying in a way that confirms this person was a patient or client discloses protected information. This reply speaks only in general terms and confirms nothing. Do not add details of care, even if the reviewer shared theirs." });
  const short = body.split(/\s+/).filter(Boolean).length < 4;
  return { rating, ratingGuessed: guessed, sentiment, topics: topics.slice(0, 3), flags, short };
}

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function pick(list, seed) { return list[seed % list.length]; }

const TOPIC_PHRASE = {
  wait: { neg: "the wait you had", pos: "how quickly we got to you" },
  price: { neg: "how our pricing felt to you", pos: "the value you found with us" },
  staff: { neg: "how you were treated by our team", pos: "the care our team took" },
  quality: { neg: "the quality you got", pos: "the quality of the work" },
  clean: { neg: "the cleanliness you noticed", pos: "how clean the place stayed" },
  communication: { neg: "the communication you had from us", pos: "how easy we were to reach" },
  booking: { neg: "the scheduling trouble", pos: "how smoothly the booking went" },
  results: { neg: "how things turned out", pos: "how things turned out" },
};

const GREET = {
  warm: ["Hi {name},", "Hello {name},", "Dear {name},"],
  professional: ["Dear {name},", "Hello {name},", "Hi {name},"],
  brief: ["Hi {name},", "Hello {name},", "{name},"],
};

/** Normalise owner settings. */
export function readProfile(p = {}) {
  const t = String(p.type || "generic");
  return {
    business: String(p.business || "").trim().slice(0, 80),
    owner: String(p.owner || "").trim().slice(0, 60),
    contact: String(p.contact || "").trim().slice(0, 120),
    tone: ["warm", "professional", "brief"].includes(p.tone) ? p.tone : "warm",
    type: BUSINESS_TYPES[t] ? t : "generic",
    signoff: String(p.signoff || "").trim().slice(0, 80),
  };
}

function nameOf(review) {
  return review.reviewer ? review.reviewer.split(" ")[0] : "";
}

function closing(profile) {
  const who = profile.owner || profile.business || "";
  const lines = [];
  if (profile.signoff) lines.push(profile.signoff);
  if (who) lines.push(profile.owner && profile.business ? `${profile.owner}, ${profile.business}` : who);
  return lines.join("\n");
}

function contactLine(profile, seed) {
  if (!profile.contact) return "";
  return pick([
    `Please reach us at ${profile.contact} so we can look into this properly.`,
    `Would you contact us at ${profile.contact}? We would like to hear the details and look into it.`,
    `If you are willing, please get in touch at ${profile.contact} and we will take it from there.`,
  ], seed);
}

/**
 * Build the public reply for one review. Never offers money or freebies, never
 * argues, and for health practices and legal or safety claims says nothing
 * about the person's visit.
 */
export function composeReply(review, profileIn = {}) {
  const profile = readProfile(profileIn);
  const a = analyze(review, profile.type);
  const bt = BUSINESS_TYPES[profile.type];
  const seed = hash(`${review.reviewer}|${review.body}|${review.rating}`);
  const name = nameOf(review);
  const greet = pick(GREET[profile.tone], seed).replace("{name}", name || "there").replace("Dear there", "Hello").replace("Hi there,", "Hello,");
  const stop = a.flags.some((f) => LEGAL_SAFE_FLAGS.has(f.id));
  const health = bt.health;
  const parts = [greet];
  const topic = a.topics[0];
  const tp = topic ? TOPIC_PHRASE[topic] : null;
  const biz = profile.business || "our team";
  const brief = profile.tone === "brief";

  if (stop) {
    parts.push(pick([
      "Thank you for telling us. We take what you describe seriously and want to understand it fully.",
      "We are sorry to read this and want to look into it properly.",
    ], seed));
    parts.push(profile.contact ? `Please contact us directly at ${profile.contact} so we can speak with you.` : "Please contact us directly so we can speak with you.");
  } else if (a.sentiment === "positive") {
    if (health) {
      parts.push(pick([
        `Thank you for the kind words and for taking the time to post them. Feedback like this means a great deal to everyone here.`,
        `Thank you for your kind review. We are glad to hear it and will pass your words to the whole team.`,
      ], seed));
    } else {
      const praise = tp ? tp.pos : "your visit";
      parts.push(pick([
        `Thank you for the ${a.ratingGuessed ? "kind" : a.rating + "-star"} review. We are glad you were happy with ${tp ? praise : `your ${bt.visit}`}.`,
        `Thank you for taking the time to write this. It is great to hear about ${tp ? praise : `your ${bt.visit}`}.`,
        `That is wonderful to hear, and thank you for sharing it${tp ? `, especially ${praise}` : ""}.`,
      ], seed));
      if (!brief) parts.push(pick([
        `We will pass your words to the whole team at ${biz}.`,
        `Reviews like yours help other people find us, and they make the team's day.`,
        `We hope to see you again soon.`,
      ], seed >>> 3));
    }
  } else {
    const sorry = a.sentiment === "mixed"
      ? pick(["Thank you for the honest feedback.", "Thank you for taking the time to tell us what worked and what did not."], seed)
      : pick(["Thank you for letting us know, and we are sorry your experience fell short.", "We are sorry this was not the experience we want anyone to have."], seed);
    parts.push(sorry);
    if (!health && tp) parts.push(`We hear you on ${tp.neg}, and we will pass it to the people who can act on it.`);
    else if (health) parts.push("We take every concern seriously and review each one with our team.");
    if (!brief || !profile.contact) parts.push(contactLine(profile, seed >>> 5) || "If you are willing to contact us directly, we would like to hear more.");
    else parts.push(contactLine(profile, seed >>> 5));
  }
  if (a.sentiment !== "positive" && !stop && profile.tone === "warm" && !a.short) {
    parts.push("We appreciate you giving us the chance to do better.");
  }
  const sign = closing(profile);
  if (sign) parts.push(sign);
  return { text: tidy(parts, !!sign), analysis: a };
}

function tidy(parts, hasSign) {
  const body = hasSign ? parts.slice(0, -1) : parts;
  const first = body[0];
  const rest = body.slice(1).join(" ");
  const out = `${first}\n\n${rest}`.trim();
  return hasSign ? `${out}\n\n${parts[parts.length - 1]}` : out;
}

/**
 * Lint a reply (ours, a staffer's, or a model's) against what review-reply
 * guidance says not to do. Returns { errors, warnings }; any error means do
 * not post it as written.
 */
export function checkReply(reply, review = {}, profileIn = {}) {
  const profile = readProfile(profileIn);
  const bt = BUSINESS_TYPES[profile.type];
  const text = String(reply || "");
  const errors = [];
  const warnings = [];
  if (!text.trim()) errors.push("The reply is empty.");
  if (text.length > REVIEW_LIMIT) errors.push(`The reply is ${text.length} characters; Google allows ${REVIEW_LIMIT}.`);
  if (bt.health && /\b(your|you'?d|you were|you came|you had)\b[^.]{0,40}\b(appointment|visit|treatment|procedure|surgery|diagnos\w+|prescription|medication|therapy session|root canal|cleaning|exam|patient|filling|crown|implants?)\b/i.test(text)) {
    errors.push("The reply refers to the reviewer's care or visit. Confirming someone is a patient can disclose protected health information; reply in general terms only.");
  }
  if (/\b(refund|free|comp(ed|ensation)?|discount|voucher|credit)\b/i.test(text) && !/\bnot\b[^.]{0,30}\b(refund|free|comp)/i.test(text)) {
    warnings.push("The reply mentions a refund, discount or free item. Offering money in public invites copycat complaints; settle it privately.");
  }
  if (/\b(change|update|remove|edit|delete)\b[^.]{0,30}\b(review|rating|stars?)\b/i.test(text)) {
    errors.push("The reply asks the reviewer to change, update or remove their review. Platforms ban asking for that in exchange for anything and it reads as pressure.");
  }
  if (/\b(fake|liar|lying|lies|scam(mer)?|idiot|stupid|crazy|troll|never (been|a customer))\b/i.test(text)) {
    errors.push("The reply accuses or insults the reviewer. Public arguments cost more customers than the review did.");
  }
  if (/\b(you are|you're|you were|you should have|if you had)\b[^.]{0,40}\b(wrong|mistaken|at fault|late|didn'?t|did not)\b/i.test(text)) {
    warnings.push("The reply argues the reviewer's facts. Correct a serious factual error once, politely, and move the rest offline.");
  }
  if (/\b(sorry you feel|sorry if|apologi[sz]e if|you feel that)\b/i.test(text)) {
    warnings.push("\"Sorry if\" and \"sorry you feel\" read as a non-apology. Say what you are sorry about or keep it short.");
  }
  if (/\b(lawyer|attorney|liab\w+|negligen\w+|admit\w*|our fault|we were wrong)\b/i.test(text)) {
    warnings.push("The reply uses liability language. Have your insurer or adviser see it before you post anything that admits fault.");
  }
  const phones = text.match(/\+?\d[\d\s().-]{8,}\d/g) || [];
  for (const p of phones) {
    if (!profile.contact || !profile.contact.replace(/\D/g, "").includes(p.replace(/\D/g, ""))) warnings.push(`The reply contains a phone number (${p.trim()}) that is not your contact line.`);
  }
  if (/[A-Z]{12,}/.test(text.replace(/\b[A-Z]{2,5}\b/g, ""))) warnings.push("The reply has shouting (long all-caps).");
  if (review && review.reviewer && new RegExp(`\\b${review.reviewer.split(" ")[1] || "@@"}\\b`).test(text) && review.reviewer.split(" ")[1]) {
    warnings.push("The reply uses the reviewer's full name. First name only keeps it friendly and avoids exposing them.");
  }
  if (text.length > 0 && text.length < 40) warnings.push("The reply is very short; a one-line answer can read as brush-off.");
  if (text.length > 900) warnings.push("The reply is long. Readers skim; 400 characters or fewer is usually enough.");
  return { errors, warnings };
}

/** Parse a batch, analyse and reply to each review. */
export function replyAll(text, profile = {}) {
  const reviews = parseReviews(text);
  return reviews.map((r) => {
    const { text: reply, analysis } = composeReply(r, profile);
    const lint = checkReply(reply, r, profile);
    return { review: r, analysis, reply, lint };
  });
}

/** Order for working a queue: safety and legal first, then low stars, then unanswered positives. */
export function triage(rows) {
  const score = (x) => (x.analysis.flags.some((f) => f.level === "stop") ? 0 : x.analysis.rating <= 2 ? 1 : x.analysis.rating === 3 ? 2 : 3);
  return [...rows].sort((a, b) => score(a) - score(b) || a.review.index - b.review.index);
}

export function summarize(rows) {
  const n = rows.length;
  const stars = n ? rows.reduce((s, x) => s + x.analysis.rating, 0) / n : 0;
  const counts = { positive: 0, mixed: 0, negative: 0 };
  const topics = {};
  for (const x of rows) {
    counts[x.analysis.sentiment]++;
    if (x.analysis.sentiment !== "positive") for (const t of x.analysis.topics) topics[t] = (topics[t] || 0) + 1;
  }
  const complaints = Object.entries(topics).sort((a, b) => b[1] - a[1]).map(([id, count]) => ({ id, label: TOPICS[id].label, count }));
  return { count: n, average: Math.round(stars * 100) / 100, ...counts, flagged: rows.filter((x) => x.analysis.flags.length).length, complaints };
}

export function toCsv(rows) {
  const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const head = ["reviewer", "rating", "sentiment", "topics", "flags", "review", "reply"];
  const lines = rows.map((x) => [x.review.reviewer, x.analysis.rating, x.analysis.sentiment, x.analysis.topics.join("; "), x.analysis.flags.map((f) => f.id).join("; "), x.review.body, x.reply].map(q).join(","));
  return [head.join(","), ...lines].join("\n");
}
