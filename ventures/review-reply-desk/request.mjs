// Ask for reviews: the other half of what reputation tools sell. Builds the
// customer's review link, writes a text / email / receipt-line request per
// customer, and checks every request against the mistakes platforms penalise
// (review gating, incentives, asking for a rating, texts with no opt-out).
// Pure functions, no network, no storage.

export const GOOGLE_WRITE_REVIEW = "https://search.google.com/local/writereview?placeid=";
export const SMS_SEGMENT = 160; // GSM-7 single segment
export const SMS_SEGMENT_UNICODE = 70; // any character outside GSM-7 drops it to UCS-2
export const CUSTOMER_LIMIT = 200;

const PLACE_ID = /^[A-Za-z0-9_-]{20,}$/;
const HOSTS = [
  ["google", /(^|\.)google\.com$|^g\.page$|^maps\.app\.goo\.gl$/],
  ["yelp", /(^|\.)yelp\.com$/],
  ["facebook", /(^|\.)facebook\.com$|^fb\.me$/],
];

/**
 * Turn what the owner pasted into a review link. Accepts a Google Place ID,
 * a Google write-review or g.page/r/.../review link, or a Yelp or Facebook page.
 */
export function parseReviewLink(input) {
  const raw = String(input || "").trim();
  if (!raw) return { ok: false, error: "Paste your review link or Google Place ID." };
  if (!/^https?:\/\//i.test(raw)) {
    if (PLACE_ID.test(raw)) return { ok: true, platform: "google", placeId: raw, url: GOOGLE_WRITE_REVIEW + raw };
    return { ok: false, error: "That is not a link or a Place ID. A Place ID is 20+ letters and digits, usually starting ChIJ." };
  }
  let u;
  try { u = new URL(raw); } catch { return { ok: false, error: "That link does not parse." }; }
  if (u.protocol !== "https:") return { ok: false, error: "Use the https version of the link." };
  const hit = HOSTS.find(([, re]) => re.test(u.hostname));
  if (!hit) return { ok: false, error: "Only Google, Yelp and Facebook review links are supported." };
  const placeId = u.searchParams.get("placeid") || "";
  if (hit[0] === "google" && /writereview/.test(u.pathname) && !placeId) return { ok: false, error: "That Google link has no placeid." };
  return { ok: true, platform: hit[0], placeId, url: u.toString() };
}

const EMAIL = /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/;

/** One customer per line: `Name`, `Name, phone-or-email`, or `Name, phone, what we did`. */
export function parseCustomers(text) {
  const out = [];
  for (const line of String(text || "").split(/\r?\n/)) {
    const parts = line.split(/[,|\t]/).map((s) => s.trim()).filter(Boolean);
    if (!parts.length) continue;
    const c = { name: "", phone: "", email: "", service: "" };
    for (const p of parts) {
      if (EMAIL.test(p)) c.email = c.email || p;
      else if (/^\+?[\d\s().-]{7,20}$/.test(p) && (p.match(/\d/g) || []).length >= 7) c.phone = c.phone || p;
      else if (!c.name) c.name = p;
      else if (!c.service) c.service = p;
    }
    c.name = c.name.split(/\s+/)[0].slice(0, 40);
    c.service = c.service.slice(0, 60);
    out.push(c);
    if (out.length >= CUSTOMER_LIMIT) break;
  }
  return out;
}

const STOP = "Reply STOP to opt out.";

function who(profile) {
  return profile.business || "us";
}

function forService(c) {
  return c.service ? ` for the ${c.service.replace(/^(the|a|an)\s+/i, "")}` : "";
}

/** The three channels. Every template asks for honest feedback and nothing else. */
export function composeRequest(customer, channel, profileIn = {}, link = "") {
  const p = { business: String(profileIn.business || "").trim(), owner: String(profileIn.owner || "").trim(), tone: profileIn.tone || "warm" };
  const hi = customer.name ? `Hi ${customer.name}` : "Hi";
  const name = who(p);
  const sign = p.owner || p.business;
  if (channel === "sms") {
    const body = {
      warm: `${hi}, thanks for choosing ${name}${forService(customer)}. Would you share your honest feedback? It takes a minute and helps others decide: ${link} ${STOP}`,
      professional: `${hi}, thank you for using ${name}${forService(customer)}. We would value your honest review: ${link} ${STOP}`,
      brief: `${hi}, how did ${name} do? Honest feedback here: ${link} ${STOP}`,
    }[p.tone] || "";
    return { channel, text: body.replace(/\s+/g, " ").trim() };
  }
  if (channel === "receipt") {
    return { channel, text: `How was your visit? Tell us honestly, good or bad: ${link}` };
  }
  const subject = p.tone === "brief" ? `How did ${name} do?` : `Your honest feedback on ${name}`;
  const lines = [
    `${hi},`,
    "",
    p.tone === "professional"
      ? `Thank you for using ${name}${forService(customer)}. We would value your honest review.`
      : `Thanks for choosing ${name}${forService(customer)}. Whatever your experience was, a short honest review helps us improve and helps other people decide.`,
    "",
    link,
    "",
    "It takes about a minute. If something went wrong, the review is the place to say so and we will read it.",
    "",
    sign ? `Thank you,\n${sign}` : "Thank you",
  ];
  return { channel, subject, text: lines.join("\n") };
}

const INCENTIVE = /\b(discounts?|coupons?|gift ?cards?|freebies?|free|rewards?|raffle|giveaway|sweepstakes?|prizes?|bonus|cash ?back|credits?|in exchange|in return|% ?off|\$ ?\d+ ?off|entered? (in)?to win)\b/i;
const GATE_HAPPY = /\b(if|when|whenever)\s+(you|your)\b[^.!?\n]{0,50}\b(happy|satisfied|pleased|great|good|enjoyed|loved|liked|positive|delighted)/i;
const GATE_UNHAPPY = /\b(unhappy|not (happy|satisfied)|dissatisfied|disappointed|problem|complaint|issue)\b[^.!\n]{0,70}\b(contact|call|email|text|tell|reach|message) (us|me)\b[^.!?\n]{0,40}\b(first|instead|before|directly|privately|rather)/i;
const GATE_NEG = /\b(before|instead of) (you )?(post|leav|writ|submit)\w*[^.!?\n]{0,30}\b(review|feedback)/i;
const RATING_ASK = /\b(5|five)[ -]?stars?\b|\b(positive|good|glowing|favou?rable|excellent|perfect)\s+(review|rating|feedback)s?\b|\brate us (a )?(5|five|10)\b/i;
const NO_DOUBLE_ASK = /\b(remove|delete|change|update|edit)\b[^.!?\n]{0,25}\b(your )?(review|rating)\b/i;
// Anything outside GSM-7's common characters makes the whole text UCS-2 (70 per part).
const NON_GSM = /[^\x20-\x7E\n£¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ¤¡ÄÖÑÜ§¿äöñüà]/;

export function smsParts(text) {
  const unicode = NON_GSM.test(text);
  const one = unicode ? SMS_SEGMENT_UNICODE : SMS_SEGMENT;
  const per = unicode ? 67 : 153;
  const n = text.length <= one ? 1 : Math.ceil(text.length / per);
  return { length: text.length, unicode, parts: n };
}

/**
 * Check a request before it goes out. `errors` are things platforms or
 * regulators penalise; `warnings` are worth a second look.
 */
export function checkRequest(text, { channel = "sms", link = "" } = {}) {
  const body = String(text || "");
  const scan = body.replace(/\bfeel free\b/gi, "").replace(/https?:\/\/\S+/g, "");
  const errors = [];
  const warnings = [];
  if (INCENTIVE.test(scan)) errors.push("Offers something in connection with a review (discount, gift, free item, entry). Google and the FTC treat paid or rewarded reviews as prohibited. Remove it.");
  if (GATE_HAPPY.test(scan) || GATE_UNHAPPY.test(scan) || GATE_NEG.test(scan)) errors.push("Looks like review gating: it asks only happy customers, or steers unhappy ones away from the review. Google's policy prohibits selectively asking for positive reviews. Ask everyone the same way.");
  if (RATING_ASK.test(scan)) errors.push("Asks for a particular rating or a positive review. Ask for honest feedback, whatever it is.");
  if (NO_DOUBLE_ASK.test(scan)) errors.push("Asks the customer to change or remove a review. Resolve the problem and let them decide.");
  if (link && !body.includes(link)) errors.push("The review link is missing.");
  if (!link && !/https?:\/\//.test(body)) errors.push("The review link is missing.");
  if (channel === "sms") {
    if (!/\bSTOP\b/i.test(body)) warnings.push("No opt-out line. Carriers and US texting rules expect one on marketing-type texts; add \"Reply STOP to opt out.\"");
    const s = smsParts(body);
    if (s.unicode) warnings.push("Contains a non-GSM character (curly quote, emoji, accent), so each part holds 70 characters instead of 160.");
    if (s.parts > 2) warnings.push(`Sends as ${s.parts} text parts (${s.length} characters). A shorter link, such as your g.page review link, helps.`);
  }
  if (!/\bhonest/i.test(body) && channel !== "receipt") warnings.push("Does not say \"honest\". Saying so is the cleanest way to show you are not fishing for praise.");
  return { errors, warnings, ok: errors.length === 0 };
}

const enc = encodeURIComponent;

/** Tap-to-send links built from the customer's own contact details. */
export function sendLink(customer, msg) {
  if (msg.channel === "sms" && customer.phone) return `sms:${customer.phone.replace(/[^\d+]/g, "")}?&body=${enc(msg.text)}`;
  if (msg.channel === "email" && customer.email) return `mailto:${customer.email}?subject=${enc(msg.subject || "")}&body=${enc(msg.text)}`;
  return "";
}

/** Build one request per customer, checked, ready to send. */
export function buildRequests(customerText, linkInput, profile = {}, channel = "sms") {
  const link = parseReviewLink(linkInput);
  if (!link.ok) return { ok: false, error: link.error, rows: [] };
  const customers = parseCustomers(customerText);
  const rows = customers.map((c) => {
    const msg = composeRequest(c, channel, profile, link.url);
    const check = checkRequest(msg.text, { channel, link: link.url });
    const missing = (channel === "sms" && !c.phone) || (channel === "email" && !c.email);
    return { customer: c, message: msg, check, send: missing ? "" : sendLink(c, msg), missing };
  });
  return { ok: true, link, rows };
}

export function requestsToCsv(rows) {
  const q = (s) => `"${String(s ?? "").replace(/"/g, '""').replace(/^([=+\-@])/, "'$1")}"`;
  const head = ["name", "phone", "email", "channel", "subject", "message", "checks"];
  const lines = rows.map((r) => [r.customer.name, r.customer.phone, r.customer.email, r.message.channel, r.message.subject || "", r.message.text, r.check.errors.length ? "FIX: " + r.check.errors.join(" ") : "ok"].map(q).join(","));
  return [head.join(","), ...lines].join("\n");
}
