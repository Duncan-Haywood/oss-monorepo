// Babysitting Business Kit: lead qualification and family intake. Pure functions, like
// engine.mjs: nothing here touches the network, the clock (callers pass `today`) or storage.
//
//   MEET_AND_GREET          the questions a sitter asks parents before the first sit
//   RED_FLAGS, leadFlags()  a safety-and-payment checklist; never beliefs or demographics
//   intakeFormPage()        the family info sheet parents fill in at /intake/<token>
//   parseIntake(), mergeIntake(), keepIntakes()   form -> family record, once, and kept
//                           when the app next syncs
//   pipelineStats()         leads by channel and stage, conversion and median days to book
//   meetAndGreetPage()      the printable kit, also published as meet-and-greet.html

import { daysBetween, unpaid, DEFAULT_PROFILE } from "./engine.mjs";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const clip = (s, n = 500) => String(s ?? "").replace(/\r\n?/g, "\n").trim().slice(0, n);
const NO_WARRANTY = "<strong>No warranty.</strong> Provided free and as-is, without warranty of any kind, express or implied. It is not legal, tax, or financial advice, and it is not medical or child-safety advice; it does not replace a qualified professional or your own judgment. You are responsible for reviewing and verifying it before relying on it. To the maximum extent permitted by law, the authors accept no liability for any loss or damage arising from its use.";
const SPONSOR = `<a href="https://github.com/sponsors/Duncan-Haywood" rel="noopener">Support</a> is optional and never changes what the tool does.`;

// ---------- the meet-and-greet kit ----------

export const MEET_AND_GREET = [
  { topic: "Routines", questions: [
    "What does a normal evening (or afternoon) look like, hour by hour?",
    "Meals and snacks: when, what, and anything they must not eat?",
    "Naps and bedtime: what time, and what helps each child settle (a song, a light, a toy)?",
    "Bath, teeth, homework: which of these do you want done, and how?",
  ] },
  { topic: "Discipline and behavior", questions: [
    "When a child does not listen, what do you do, and what would you like me to do?",
    "Is there anything I should never do (take away a toy, time-outs, raise my voice)?",
    "What usually upsets each child, and what calms them down?",
  ] },
  { topic: "Screens and photos", questions: [
    "Which shows, games and apps are allowed, and for how long?",
    "Any screens before bed or at meals?",
    "May I text you photos during the sit? (I never post children's photos anywhere.)",
  ] },
  { topic: "Allergies, medications and health", questions: [
    "Any allergies (food, insect stings, medicine)? How severe, and what does a reaction look like?",
    "Where is the EpiPen, inhaler or other medicine, and when is it used?",
    "Any medication during the sit: name, dose, time, and written instructions?",
    "Any conditions I should know about (asthma, seizures, diabetes) and the plan for each?",
    "Where is the first-aid kit? May I give over-the-counter medicine, and which?",
  ] },
  { topic: "Emergencies", questions: [
    "How do I reach you during the sit, and how fast will you answer?",
    "Who is the backup contact if I cannot reach you?",
    "Pediatrician's name and number, and which hospital you prefer?",
    "The home address to give 911, the exits, smoke alarms and fire extinguisher?",
    "Will you sign a note letting me get emergency treatment if you cannot be reached? (The info sheet has a template.)",
  ] },
  { topic: "Pick-up and other people", questions: [
    "Who else may pick up the kids? Should I ask them for ID?",
    "Is there anyone who may not pick them up, or a custody arrangement I should know about?",
    "Will any other adults be home during the sit? Are visitors or friends' kids allowed?",
  ] },
  { topic: "Pets", questions: [
    "What pets do you have, are they friendly with new people, and do they need feeding?",
    "Anything the kids should not do with the pets?",
  ] },
  { topic: "House rules", questions: [
    "Any rooms, yard areas or a pool that are off-limits?",
    "May the kids play outside or go to the park? Doors locked, alarm on?",
    "May I use the stove or oven? What food may I have?",
  ] },
  { topic: "Driving", questions: [
    "Will I drive the kids anywhere? If so, whose car, and are the right car seats or boosters installed?",
  ] },
  { topic: "Pay and booking", questions: [
    "My rate, how you will pay (cash, Venmo, Zelle) and when: at the end of each sit?",
    "Cancellation and late-return terms, and how far ahead you usually book?",
  ] },
];

// Asked only when the sitter offers faith-based activities, and only as a service the
// parents may want: "none" is an equally good answer, and nothing about it is scored.
export const FAITH_QUESTION = { topic: "Faith-based activities (optional)", questions: [
  "I offer some faith-based activities (like bedtime prayers or Bible stories) only when parents ask. Would you like any, or none?",
] };

export function meetAndGreetQuestions(profile = DEFAULT_PROFILE) {
  return profile.showFaith && String(profile.faithActivities || "").trim() ? [...MEET_AND_GREET, FAITH_QUESTION] : MEET_AND_GREET;
}

// Safety and payment only. Each flag says why it matters, so the sitter can decide.
// `hint` is a pattern looked for in a lead's or family's notes; it only suggests a flag.
export const RED_FLAGS = [
  { id: "no_emergency", kind: "safety", label: "Will not give an emergency contact or a way to reach them during the sit", why: "If a child is hurt or sick you need a parent or a backup adult within minutes." },
  { id: "no_medical", kind: "safety", label: "Will not tell you about allergies, medications or medical needs", why: "You cannot keep a child safe from a reaction you were never told about." },
  { id: "car_seat", kind: "safety", label: "Asks you to drive the kids without a proper car seat or booster", why: "Every US state requires child restraints for young children in cars; it is your licence and their safety.", hint: /(no|without( a| the)?|don'?t need( a)?|skip the) (car ?seats?|boosters?)/i },
  { id: "refuses_meet", kind: "safety", label: "Refuses a meet-and-greet or to let you see the home before the first sit", why: "Meeting first is how both sides check each other; a family that will not is a family you know nothing about.", hint: /(no need to|don'?t need to|won'?t|skip( the)?) meet/i },
  { id: "pickup_unclear", kind: "safety", label: "Will not say who may pick up the children, or you learn of a custody order only by accident", why: "Handing a child to the wrong adult is the one mistake you cannot undo." },
  { id: "unknown_adults", kind: "safety", label: "Other adults will be in the home during the sit and the parents will not say who", why: "You should know who else is in the house before you agree to be there." },
  { id: "hazard", kind: "safety", label: "A hazard they will not address: an unlocked firearm, an unfenced pool, an aggressive dog", why: "Ask for it to be locked, fenced or put away while you are there; decline if they refuse." },
  { id: "more_kids", kind: "safety", label: "More children than agreed, or other families' kids added without asking", why: "Your limit on children is a safety limit as much as a price." },
  { id: "pay_later", kind: "payment", label: "Wants to pay \"later\" with no date", why: "Agree when you are paid before the first sit; the end of each sit is the usual answer.", hint: /pay (you )?(later|next time|eventually|when i can)|owe you/i },
  { id: "no_terms", kind: "payment", label: "Will not agree a rate or cancellation terms before the first sit", why: "Terms agreed afterwards are terms you were not able to say no to." },
  { id: "overpay", kind: "payment", label: "Sends more than the agreed amount and asks you to send the difference back", why: "The US Federal Trade Commission describes this as a fake-check scam (consumer.ftc.gov/articles/fake-checks).", hint: /(send|pay|wire) (back )?the (difference|extra|rest)|overpa/i },
  { id: "upfront_fee", kind: "payment", label: "Asks you to pay anything up front (a \"background check fee\", supplies, a deposit) to get the job", why: "The FTC lists paying to get a job as a sign of a job scam (consumer.ftc.gov/articles/job-scams).", hint: /(pay|send).{0,30}(fee|deposit) (first|up ?front)|background check fee/i },
  { id: "unpaid_history", kind: "payment", label: "Still owes you for an earlier sit", why: "Settle what is owed before you book the next sit." },
];

// The flags the desk itself suggests for one lead or family. They are prompts to ask,
// never a verdict: the sitter ticks the real ones on the printed checklist.
export function leadFlags(item, desk = { families: [], bookings: [], profile: DEFAULT_PROFILE }, today = "9999-12-31", isFamily = Array.isArray(item.kids) && item.kids.some((k) => k && typeof k === "object")) {
  const text = `${item.notes || ""} ${item.wants || ""} ${item.schedule || ""}`;
  const out = [];
  for (const f of RED_FLAGS) if (f.hint && f.hint.test(text)) out.push({ id: f.id, kind: f.kind, label: f.label, why: f.why, from: "notes" });
  if (isFamily) {
    const contacts = (item.emergencyContacts || []).filter((c) => c && c.phone);
    if (!String(item.emergency || "").trim() && !contacts.length) out.push({ ...pick(RED_FLAGS[0]), from: "record", label: "No emergency contact on file yet" });
    const owed = unpaid(desk, today).filter((u) => u.booking.familyId === item.id);
    if (owed.length) out.push({ ...pick(RED_FLAGS.find((f) => f.id === "unpaid_history")), from: "record", label: `Still owes $${owed.reduce((a, u) => a + u.owed, 0).toFixed(2)} for an earlier sit` });
  }
  return out;
}
const pick = (f) => ({ id: f.id, kind: f.kind, label: f.label, why: f.why });

// ---------- the family info sheet ----------

export const MAX_KIDS = 6;
export const MAX_CONTACTS = 3;
export const MAX_INTAKE_BYTES = 32 * 1024;

export function intakeToken(bytes) {
  const b = Array.from(bytes || []);
  if (b.length < 16) throw new Error("need at least 16 random bytes");
  return b.map((x) => (x & 255).toString(16).padStart(2, "0")).join("");
}
export const isIntakeToken = (t) => /^[a-f0-9]{32,64}$/.test(String(t || ""));

export function medicalConsentTemplate(family = {}, profile = DEFAULT_PROFILE) {
  const kids = (family.kids || []).map((k) => k && k.name).filter(Boolean).join(", ") || "____________________";
  return [
    "MEDICAL CONSENT NOTE: A TEMPLATE, NOT LEGAL ADVICE",
    "Your state may have its own form or rules; ask your pediatrician or a lawyer before relying on this.",
    "",
    `I/We, ____________________, parent(s) or legal guardian(s) of ${kids},`,
    `authorize ${profile.name || "____________________"}, our babysitter, to seek emergency medical care for`,
    "our child(ren) while in their care, if we cannot be reached, and to share the",
    "information on this sheet with the doctors treating them. This does not replace",
    "calling 911, and we ask to be called as soon as possible.",
    "",
    "Pediatrician: ____________________   Preferred hospital: ____________________",
    "Health insurance (optional, carry the card instead): ____________________",
    "Signed: ____________________   Date: __________",
  ].join("\n");
}

const KID_FIELDS = [["name", "Name", 80], ["birth", "Birth date", 10], ["allergies", "Allergies (and what a reaction looks like)", 500], ["meds", "Medications (name, dose, time)", 500], ["bedtime", "Bedtime and routine", 300], ["notes", "Anything else (comfort items, fears, needs)", 500]];
const CONTACT_FIELDS = [["name", "Name", 80], ["relation", "Relationship", 60], ["phone", "Phone", 40]];
const CARE_FIELDS = [
  ["pickup", "Who else may pick up the kids (and anyone who may not)", 600],
  ["doctor", "Pediatrician (name and phone)", 200],
  ["hospital", "Preferred hospital", 200],
  ["routines", "Meals, snacks and routines", 1000],
  ["discipline", "How you would like behavior handled", 1000],
  ["screens", "Screen rules", 500],
  ["pets", "Pets", 500],
  ["houseRules", "House rules (off-limit areas, outside play, stove)", 1000],
];

// Form fields (flat names, as a browser posts them) -> a clean intake object. Every
// value is trimmed and length-capped; unknown fields are dropped.
export function parseIntake(fields = {}) {
  const f = (k, n) => clip(fields[k], n);
  const kids = [];
  for (let i = 1; i <= MAX_KIDS; i++) {
    const k = {};
    for (const [key, , n] of KID_FIELDS) { const v = f(`kid${i}_${key}`, n); if (v) k[key] = v; }
    if (k.birth && !/^\d{4}-\d{2}-\d{2}$/.test(k.birth)) delete k.birth;
    if (k.name) kids.push(k);
  }
  const contacts = [];
  for (let i = 1; i <= MAX_CONTACTS; i++) {
    const c = {};
    for (const [key, , n] of CONTACT_FIELDS) { const v = f(`ec${i}_${key}`, n); if (v) c[key] = v; }
    if (c.name || c.phone) contacts.push(c);
  }
  const care = {};
  for (const [key, , n] of CARE_FIELDS) { const v = f(key, n); if (v) care[key] = v; }
  const consent = f("consentName", 120);
  return { parent: f("parent", 120), contact: f("contact", 200), address: f("address", 200), kids, contacts, care, ...(consent ? { consentName: consent, consentDate: f("consentDate", 10) } : {}) };
}

// Merge a parsed intake into the family record. Fills what is empty, updates kids by
// name, keeps the sitter's own notes, records the date and retires the token, so the
// link works exactly once. Returns a new object.
export function mergeIntake(family, intake, today) {
  const out = { ...family };
  if (intake.parent && !out.contactName) out.contactName = intake.parent;
  if (intake.contact && !out.contact) out.contact = intake.contact;
  if (intake.address && !out.address) out.address = intake.address;
  const old = Array.isArray(family.kids) ? family.kids.map((k) => ({ ...k })) : [];
  // "Make family" from a lead leaves unnamed placeholders ("age 4"); named kids replace them.
  const named = old.filter((k) => String(k.name || "").trim());
  const kids = intake.kids.length ? named : old;
  for (const k of intake.kids) {
    const same = kids.find((x) => String(x.name || "").trim().toLowerCase() === k.name.toLowerCase());
    if (same) Object.assign(same, k);
    else kids.push({ ...k });
  }
  out.kids = kids;
  if (intake.contacts.length) {
    out.emergencyContacts = intake.contacts;
    if (!String(out.emergency || "").trim()) out.emergency = intake.contacts.map((c) => [c.name, c.relation && `(${c.relation})`, c.phone].filter(Boolean).join(" ")).join("; ");
  }
  out.care = { ...(family.care || {}), ...intake.care };
  if (intake.consentName) out.medicalConsent = { name: intake.consentName, date: intake.consentDate || today, note: "typed on the info sheet; a template, not legal advice" };
  const lines = CARE_FIELDS.filter(([k]) => intake.care[k]).map(([k, label]) => `${label}: ${intake.care[k]}`);
  if (lines.length) out.notes = [String(family.notes || "").trim(), `From the family's info sheet (${today}):`, ...lines].filter(Boolean).join("\n");
  out.intakeReceived = today;
  delete out.intakeToken;
  return out;
}

const INTAKE_KEYS = ["contactName", "contact", "address", "kids", "emergency", "emergencyContacts", "care", "medicalConsent", "notes", "intakeReceived"];
// The app's sync replaces the server's desk. A family that filled in the sheet on the
// server since the app last synced keeps what they wrote. Mutates and returns `incoming`.
export function keepIntakes(serverDesk, incoming) {
  if (!incoming || typeof incoming !== "object" || !Array.isArray(incoming.families)) return incoming;
  const byId = new Map((serverDesk.families || []).map((f) => [f.id, f]));
  for (const [i, f] of incoming.families.entries()) {
    const s = f && byId.get(f.id);
    if (!s || !s.intakeReceived || f.intakeReceived === s.intakeReceived) continue;
    const kept = { ...f };
    for (const k of INTAKE_KEYS) if (s[k] !== undefined) kept[k] = s[k];
    delete kept.intakeToken;
    incoming.families[i] = kept;
  }
  return incoming;
}

const STYLE = "body{font:16px/1.55 system-ui,sans-serif;max-width:44rem;margin:2rem auto;padding:0 1rem;color:#2b2433;background:#fffaf6}h1{font-size:1.6rem;line-height:1.15}h2{font-size:1.1rem;margin-top:1.6rem}fieldset{border:1px solid #e8ded8;border-radius:10px;margin:12px 0;padding:8px 14px}label{display:block;font-weight:600;font-size:.92rem;margin:8px 0 2px}input,textarea{width:100%;box-sizing:border-box;padding:7px 8px;border:1px solid #a99aa6;border-radius:7px;font:15px system-ui,sans-serif}textarea{min-height:60px}button{border:0;border-radius:8px;padding:10px 16px;background:#9b3f68;color:#fff;font-weight:700;margin-top:14px}pre{white-space:pre-wrap;background:#faf5f8;border-left:3px solid #9b3f68;padding:8px 10px;font-size:.9rem}.note,footer{font-size:.86rem;color:#5f5669}.hp{position:absolute;left:-9999px}ul.check{list-style:none;padding-left:0}ul.check li{margin:6px 0;padding-left:1.6em;text-indent:-1.6em}ul.check li::before{content:'\\2610  '}a{color:#9b3f68}@media print{body{margin:0;background:#fff}button,.noprint{display:none}fieldset{break-inside:avoid}}";
const input = (name, label, value = "", { area = false, type = "text", max = 500 } = {}) => `<label for="${name}">${esc(label)}</label>${area ? `<textarea id="${name}" name="${name}" maxlength="${max}">${esc(value)}</textarea>` : `<input id="${name}" name="${name}" type="${type}" maxlength="${max}" value="${esc(value)}">`}`;

// The sheet parents fill in. With `action` it posts to the sitter's server; without, it
// is a paper sheet to print and fill by hand. Prefilled from what the sitter already has.
export function intakeFormPage(desk, family = {}, { action = "" } = {}) {
  const p = desk.profile || DEFAULT_PROFILE;
  const who = p.businessName || p.name;
  const known = (family.kids || []).filter((k) => String(k.name || "").trim());
  const slots = Math.min(MAX_KIDS, Math.max(known.length + 1, (family.kids || []).length, 2));
  const kids = Array.from({ length: slots }, (_, n) => {
    const k = known[n] || {};
    return `<fieldset><legend>Child ${n + 1}</legend>${KID_FIELDS.map(([key, label, max]) => input(`kid${n + 1}_${key}`, label, k[key] || "", { area: max > 100 && key !== "name", type: key === "birth" ? "date" : "text", max })).join("")}</fieldset>`;
  }).join("");
  const contacts = Array.from({ length: MAX_CONTACTS }, (_, n) => `<fieldset><legend>Emergency contact ${n + 1}${n ? " (optional)" : ""}</legend>${CONTACT_FIELDS.map(([key, label, max]) => input(`ec${n + 1}_${key}`, label, "", { type: key === "phone" ? "tel" : "text", max })).join("")}</fieldset>`).join("");
  const care = CARE_FIELDS.map(([key, label, max]) => input(key, label, (family.care || {})[key] || "", { area: max > 200, max })).join("");
  const body = `
<p>${esc(who)} asked you to fill this in once before the first sit, so the information a babysitter needs in an emergency is written down. ${action ? "It goes only to your sitter's own server. You can only send it once; tell your sitter directly about anything that changes later." : "Print it, fill it in and give it to your sitter."}</p>
${action ? `<form method="post" action="${esc(action)}">` : "<form>"}
<input class="hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
<h2>Parent</h2>
${input("parent", "Your name", family.contactName || "", { max: 120 })}${input("contact", "Phone and email during the sit", family.contact || "", { max: 200 })}${input("address", "Home address (what to tell 911)", family.address || "", { max: 200 })}
<h2>Children</h2>${kids}
<h2>Emergency contacts</h2><p class="note">Someone other than you, who can come if you cannot be reached.</p>${contacts}
<h2>Health, pick-up and the house</h2>${care}
<h2>Medical consent note</h2>
<pre>${esc(medicalConsentTemplate(family, p))}</pre>
<p class="note">To agree to the note, type your name below. This is a template, not legal advice, and a typed name may not be enough where you live; your sitter can bring a paper copy to sign.</p>
${input("consentName", "Typed name (optional)", "", { max: 120 })}${input("consentDate", "Date", "", { type: "date", max: 10 })}
${action ? `<button type="submit">Send to ${esc(p.name)}</button>` : `<button type="button" onclick="print()">Print</button>`}
</form>
<footer><p>Door codes, alarm codes and Social Security numbers do not belong on this sheet; tell your sitter in person.</p><p>${NO_WARRANTY}</p><p>Made with the free <a href="https://duncan-haywood.github.io/oss-monorepo/babysitting-business-kit/">Babysitting Business Kit</a>. ${SPONSOR}</p></footer>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(`Family info sheet for ${who}`)}</title><style>${STYLE}</style></head><body><h1>${esc(`Family info sheet${family.name ? `: ${family.name}` : ""}`)}</h1>${body}</body></html>`;
}

// ---------- pipeline stats ----------

// How a lead found the sitter, from the free-text source. Order matters: "church
// friend" is a church lead, "Nextdoor neighbor" a Nextdoor one.
export const CHANNELS = [
  ["church", "Church", /church|parish|congregation|ministry|youth group|bible study|small group/i],
  ["school", "School", /school|pta|pto|teacher|preschool|daycare|classroom/i],
  ["nextdoor", "Nextdoor", /nextdoor/i],
  ["marketplace", "Care.com / Sittercity", /care\.com|sittercity|urbansitter|bambino/i],
  ["social", "Social media", /facebook|instagram|tiktok|social|whatsapp|group chat/i],
  ["website", "Website", /website|web ?site|\bsite\b|google|search|online form|^web$/i],
  ["referral", "Referrals", /referr|friend|neighbou?r|word of mouth|client|family|mom|dad|parent|cousin|aunt/i],
];
export function channelOf(source) {
  const s = String(source || "").trim();
  if (!s) return "unknown";
  for (const [id, , re] of CHANNELS) if (re.test(s)) return id;
  return "other";
}
const LABELS = Object.fromEntries([...CHANNELS.map(([id, label]) => [id, label]), ["other", "Other"], ["unknown", "Not recorded"]]);
export const STAGES = ["new", "contacted", "meet-and-greet", "booked", "lost", "declined"];

const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// When a lead booked: the date the app recorded, or else the first sit for the family
// made from it (or with the same contact) on or after the inquiry.
export function bookedDate(lead, desk) {
  if (lead.bookedOn) return lead.bookedOn;
  if (lead.status !== "booked") return null;
  const fam = (desk.families || []).find((f) => (lead.familyId && f.id === lead.familyId) || (lead.contact && f.contact && f.contact.trim() === String(lead.contact).trim()));
  if (!fam) return null;
  const dates = (desk.bookings || []).filter((b) => b.familyId === fam.id && b.date >= (lead.created || "")).map((b) => b.date).sort();
  return dates[0] || null;
}

export function pipelineStats(desk) {
  const rows = new Map();
  const row = (id) => rows.get(id) || rows.set(id, { channel: id, label: LABELS[id], leads: 0, stages: Object.fromEntries(STAGES.map((s) => [s, 0])), booked: 0, closed: 0, days: [] }).get(id);
  const total = row("__all");
  total.label = "All channels";
  for (const l of desk.leads || []) {
    const stage = STAGES.includes(l.status) ? l.status : "new";
    for (const r of [row(channelOf(l.source)), total]) {
      r.leads++;
      r.stages[stage]++;
      if (stage === "booked") r.booked++;
      if (["booked", "lost", "declined"].includes(stage)) r.closed++;
      const d = stage === "booked" && bookedDate(l, desk);
      if (d && l.created) { const n = daysBetween(l.created, d); if (n >= 0) r.days.push(n); }
    }
  }
  const out = [...rows.values()].map((r) => ({
    channel: r.channel === "__all" ? "all" : r.channel,
    label: r.label,
    leads: r.leads,
    stages: r.stages,
    booked: r.booked,
    open: r.leads - r.closed,
    conversion: r.leads ? Math.round((r.booked / r.leads) * 1000) / 10 : null,
    medianDaysToBook: median(r.days),
    timed: r.days.length,
    smallSample: r.leads < 5,
  }));
  const all = out.find((r) => r.channel === "all");
  const channels = out.filter((r) => r.channel !== "all").sort((a, b) => b.booked - a.booked || b.leads - a.leads);
  return { channels, all };
}

export function pipelineHTML(desk) {
  const { channels, all } = pipelineStats(desk);
  if (!all || !all.leads) return `<p class="note">Pipeline stats appear once you have leads. Fill in "How they found you" on each one to see which channel brings families who book.</p>`;
  const pct = (r) => (r.conversion === null ? "" : `${r.conversion}%`);
  const days = (r) => (r.medianDaysToBook === null ? "" : `${r.medianDaysToBook} (${r.timed})`);
  const tr = (r, strong) => `<tr${strong ? ' style="font-weight:700"' : ""}><td>${esc(r.label)}${r.smallSample && !strong ? ' <span class="note">(under 5 leads)</span>' : ""}</td><td class="n">${r.leads}</td>${STAGES.map((s) => `<td class="n">${r.stages[s] || ""}</td>`).join("")}<td class="n">${pct(r)}</td><td class="n">${days(r)}</td></tr>`;
  const best = channels.filter((r) => !r.smallSample && r.booked).sort((a, b) => b.conversion - a.conversion)[0];
  return `<h3>Where booked families come from</h3><table><thead><tr><th>Channel</th><th class="n">Leads</th>${STAGES.map((s) => `<th class="n">${esc(s)}</th>`).join("")}<th class="n">Inquiry to booked</th><th class="n">Median days to book (n)</th></tr></thead><tbody>${channels.map((r) => tr(r)).join("")}${tr(all, true)}</tbody></table><p class="note">${best ? `${esc(best.label)} converts best so far: ${best.booked} of ${best.leads} booked. ` : ""}A channel with under 5 leads is too few to compare. Days to book count from the inquiry to "Make family" (or the first sit).</p>`;
}

// What the Families tab shows for intake: one row per family with its link state and
// the record-based flags. `base` is the sitter's server address, or "" when there is none.
export function intakeHTML(desk, today, base = "") {
  const fams = desk.families || [];
  if (!fams.length) return "";
  if (!/^https?:\/\/[^\s"'<>]+$/.test(base)) base = "";
  const rows = fams.map((f) => {
    const flags = leadFlags(f, desk, today, true);
    const link = base && f.intakeToken ? `${base}/intake/${f.intakeToken}` : "";
    const state = f.intakeReceived ? `<span class="pill good">received ${esc(f.intakeReceived)}</span>` : f.intakeToken ? `<span class="pill warm">link sent ${esc(f.intakeIssued || "")}</span>` : `<span class="note">not sent</span>`;
    const btns = [
      !f.intakeReceived && `<button type="button" class="small" data-intake-new="${esc(f.id)}">${f.intakeToken ? "New link" : "Make info-sheet link"}</button>`,
      link && `<button type="button" class="secondary small" data-copy="${esc(link)}">Copy link</button>`,
      `<button type="button" class="secondary small" data-intake-print="${esc(f.id)}">Print paper sheet</button>`,
      `<button type="button" class="secondary small" data-intake-kit="${esc(f.id)}">Print meet-and-greet kit</button>`,
    ].filter(Boolean).join("");
    return `<tr><td><strong>${esc(f.name)}</strong></td><td>${state}${f.intakeToken && !base ? '<br><span class="note">Add your server address in Settings, then Sync, to send this as a link.</span>' : ""}</td><td class="note">${flags.map((x) => `<span class="pill ${x.kind === "safety" ? "bad" : "warm"}">${esc(x.kind)}</span> ${esc(x.label)}`).join("<br>")}</td><td>${btns}</td></tr>`;
  });
  return `<h3>Family info sheets and meet-and-greets</h3><p class="note">Send each family a one-time link (it needs your own server; the family fills it in once and it merges into their record on your next Sync) or print the paper sheet. Flags here are prompts to ask about, from your records: safety and payment only.</p><table><thead><tr><th>Family</th><th>Info sheet</th><th>Check</th><th></th></tr></thead><tbody>${rows.join("")}</tbody></table>`;
}

// ---------- the printable kit / published page ----------

export function meetAndGreetPage(profile = null, family = null) {
  const qs = profile ? meetAndGreetQuestions(profile) : MEET_AND_GREET;
  const personal = !!profile;
  const title = personal ? `Meet-and-greet kit${family && family.name ? `: ${family.name}` : ""}` : "Babysitter meet-and-greet: questions to ask parents, and red flags";
  const desc = "A free printable meet-and-greet checklist for babysitters: the questions to ask parents about routines, discipline, screens, allergies and medications, emergencies, pick-up, pets and house rules, plus a red-flag checklist for safety and payment.";
  const sections = qs.map((s) => `<h2>${esc(s.topic)}</h2><ul class="check">${s.questions.map((q) => `<li>${esc(q)}</li>`).join("")}</ul>`).join("\n");
  const flags = ["safety", "payment"].map((k) => `<h2>Red flags: ${k}</h2><ul class="check">${RED_FLAGS.filter((f) => f.kind === k).map((f) => `<li><strong>${esc(f.label)}.</strong> <span class="note">${esc(f.why)}</span></li>`).join("")}</ul>`).join("\n");
  const head = personal
    ? `<meta name="robots" content="noindex"><title>${esc(title)}</title>`
    : `<title>${esc(title)}</title><meta name="description" content="${esc(desc)}"><link rel="canonical" href="./meet-and-greet.html"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">`;
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${head}<style>${STYLE}</style></head>
<body>
<h1>${esc(title)}</h1>
<p>${personal ? `For ${esc(profile.name)}'s meet-and-greet${family && family.name ? ` with the ${esc(family.name.replace(/ family$/i, ""))} family` : ""}. Tick each question as you cover it and write the answers on the family's info sheet.` : `A meet-and-greet is the short visit before the first sit where the babysitter and the parents check each other out. These are the questions worth asking, grouped so you can tick them off, and a list of red flags that are about <strong>safety and payment only</strong>. A family's religion, background or income is never a red flag.`} <button type="button" onclick="print()">Print</button></p>
${sections}
${flags}
<p class="note">One red flag is a question to ask, not a verdict. Two, or one the family will not discuss, is a good reason to decline politely.</p>
${personal ? "" : `<p class="noprint"><a href="./index.html">Open the Babysitting Business Kit</a>: it sends each family a one-time info sheet (kids, allergies, medications, bedtimes, emergency contacts, doctor) that fills in their record, and shows which channel (church, school, Nextdoor, referrals, your website) brings the families who book.</p>`}
<footer><p>${NO_WARRANTY}</p><p>Not affiliated with any church, school, Nextdoor or the FTC. Free and open source under the MIT licence: <a href="https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/babysitting-business-kit">source</a>. ${SPONSOR}</p></footer>
</body>
</html>
`;
}

// `node intake.mjs --write` regenerates the published page; a test checks it is current.
if (typeof process !== "undefined" && process.argv && import.meta.url === `file://${process.argv[1]}` && process.argv.includes("--write")) {
  const { writeFileSync } = await import("node:fs");
  writeFileSync(new URL("./meet-and-greet.html", import.meta.url), meetAndGreetPage());
  console.log("wrote meet-and-greet.html");
}
