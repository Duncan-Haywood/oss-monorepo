// Babysitting Business Kit: the sitter's own safety. Pure functions, shared by the
// browser app and the server (safety-server.mjs); nothing here touches the network.
//
//   Late-sit check-in    newCheckin(), checkinAction(), checkinDue(), alertMessage(),
//                        mergeSafety(): a trusted contact and a "home by" time; if the
//                        sitter has not tapped "I'm home safe" by then plus a grace
//                        period, the sitter's own server alerts the contact. Off until the sitter starts one.
//   Emergency card       emergencyCard(): a printable page per family from the family
//                        record and its info sheet (intake.mjs), with 911 and Poison Help.
//   House checklist      HOUSE_CHECKLIST, checklistState(), setChecklistItem(): exits,
//                        first-aid kit, meds, pets, water, stored per family.
//
// What a trusted contact is told is only what the sitter chose: a place (the family's
// town, their street, or nothing) and the time. Never children's names or details.

export const POISON_HELP = "1-800-222-1222";
// Read 2026-10-30 on poison.org (National Capital Poison Center): "call 1-800-222-1222"
// for poison help in the US; the same number reaches the local poison center nationwide.
export const POISON_HELP_SOURCE = "https://www.poison.org/";

export const GRACE_DEFAULT = 30;
export const GRACE_MIN = 10;
export const GRACE_MAX = 240;
export const MAX_CHECKINS = 60;
export const MAX_ALERT_TRIES = 5;
const KEEP_DAYS = 30;

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const clip = (s, n = 200) => String(s ?? "").replace(/[\r\n]+/g, " ").trim().slice(0, n);
const digits = (s) => String(s || "").replace(/\D/g, "");

export const isSafetyToken = (t) => /^[a-f0-9]{32,64}$/.test(String(t || ""));
export function safetyToken(bytes) {
  const b = Array.from(bytes || []);
  if (b.length < 16) throw new Error("need at least 16 random bytes");
  return b.map((x) => (x & 255).toString(16).padStart(2, "0")).join("");
}
const isEmail = (s) => /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(String(s || "").trim());
const isPhone = (s) => { const d = digits(s); return d.length === 10 || (d.length === 11 && d[0] === "1"); };

// ---------- what the contact may see ----------

// The family's town: the part of the address after the first comma ("12 Oak St,
// Springfield, IL" -> "Springfield, IL"), else the sitter's own city.
export function townOf(family = {}, profile = {}) {
  const parts = String(family.address || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length > 1) return parts.slice(1).join(", ").replace(/\s*\d{5}(-\d{4})?$/, "").trim();
  return String(profile.city || "").trim();
}
// The street only, without the house number: "12 Oak St" -> "Oak St".
export function streetOf(family = {}) {
  const first = String(family.address || "").split(",")[0].trim();
  return first.replace(/^\d+[a-z]?\s+/i, "").trim();
}
// share: "town", "street" (street and town) or "none".
export function sharedPlace(family, profile, share = "town") {
  if (share === "none" || !family) return "";
  const town = townOf(family, profile);
  if (share === "street") return [streetOf(family), town].filter(Boolean).join(", ");
  return town;
}

// ---------- check-ins ----------

export function safetyState(desk) {
  const s = desk && desk.safety && typeof desk.safety === "object" && !Array.isArray(desk.safety) ? desk.safety : {};
  return { checkins: Array.isArray(s.checkins) ? s.checkins.filter((c) => c && typeof c === "object" && c.id) : [] };
}

// Clean one check-in from the app or the API. Returns { ok, checkin } or { ok: false, why }.
export function normalizeCheckin(c = {}) {
  const homeBy = Date.parse(c.homeBy);
  const grace = Math.round(Number(c.graceMin ?? GRACE_DEFAULT));
  const out = {
    id: clip(c.id, 64),
    token: String(c.token || ""),
    contactName: clip(c.contactName, 80),
    contactPhone: clip(c.contactPhone, 40),
    contactEmail: clip(c.contactEmail, 200),
    place: clip(c.place, 160),
    homeBy: Number.isFinite(homeBy) ? new Date(homeBy).toISOString() : "",
    graceMin: Number.isFinite(grace) ? Math.min(GRACE_MAX, Math.max(GRACE_MIN, grace)) : GRACE_DEFAULT,
    status: ["active", "home", "cancelled", "alerted"].includes(c.status) ? c.status : "active",
    createdAt: clip(c.createdAt, 30),
    updatedAt: clip(c.updatedAt, 30),
    reminded: !!c.reminded,
    alertTries: Math.max(0, Math.min(MAX_ALERT_TRIES, Number(c.alertTries) || 0)),
    log: Array.isArray(c.log) ? c.log.slice(-20).map((e) => ({ at: clip(e && e.at, 30), what: clip(e && e.what, 200) })) : [],
  };
  for (const k of ["alertedAt", "homeAt"]) if (c[k]) out[k] = clip(c[k], 30);
  if (!/^[\w-]{1,64}$/.test(out.id)) return { ok: false, why: "A check-in needs an id." };
  if (!isSafetyToken(out.token)) return { ok: false, why: "A check-in needs a random token." };
  if (!out.homeBy) return { ok: false, why: "Enter the time you expect to be home." };
  if (!out.contactName) return { ok: false, why: "Name your trusted contact." };
  if (!isPhone(out.contactPhone) && !isEmail(out.contactEmail)) return { ok: false, why: "Give your contact's mobile number or email address." };
  if (out.contactPhone && !isPhone(out.contactPhone)) out.contactPhone = "";
  if (out.contactEmail && !isEmail(out.contactEmail)) out.contactEmail = "";
  return { ok: true, checkin: out };
}

// A new check-in. `homeBy` is an absolute time (ISO); the browser turns the sitter's
// local "home by" into one, so the server's time zone does not matter.
export function newCheckin(fields, { id, token, nowMs }) {
  const at = new Date(nowMs).toISOString();
  return normalizeCheckin({ ...fields, id, token, status: "active", createdAt: at, updatedAt: at, log: [{ at, what: "started" }] });
}

export const deadline = (c) => Date.parse(c.homeBy) + (Number(c.graceMin) || GRACE_DEFAULT) * 60000;

// home | cancel | extend (by `minutes`, from the later of now and the current home-by).
export function checkinAction(c, action, nowMs, minutes = 30) {
  const at = new Date(nowMs).toISOString();
  const out = { ...c, log: [...(c.log || [])] };
  if (action === "home") {
    if (c.status === "home" || c.status === "cancelled") return { ok: false, why: "This check-in is already closed.", checkin: c };
    out.status = "home"; out.homeAt = at; out.log.push({ at, what: c.status === "alerted" ? "home safe (after the alert)" : "home safe" });
  } else if (action === "cancel") {
    if (c.status !== "active") return { ok: false, why: "Only a running check-in can be cancelled.", checkin: c };
    out.status = "cancelled"; out.log.push({ at, what: "cancelled" });
  } else if (action === "extend") {
    if (c.status !== "active") return { ok: false, why: "Only a running check-in can be extended.", checkin: c };
    const m = Math.min(240, Math.max(5, Math.round(Number(minutes) || 30)));
    out.homeBy = new Date(Math.max(Date.parse(c.homeBy), nowMs) + m * 60000).toISOString();
    out.reminded = false; out.log.push({ at, what: `extended by ${m} min` });
  } else return { ok: false, why: "Unknown action.", checkin: c };
  out.log = out.log.slice(-20);
  out.updatedAt = at;
  return { ok: true, checkin: out };
}

// What the server's tick should do with one check-in now: "remind" the sitter at their
// home-by time, "alert" the contact after the grace period, or nothing.
export function checkinDue(c, nowMs) {
  if (c.status !== "active") return null;
  if (nowMs >= deadline(c)) return c.alertTries < MAX_ALERT_TRIES ? "alert" : null;
  if (nowMs >= Date.parse(c.homeBy) && !c.reminded) return "remind";
  return null;
}

const fmtTime = (iso, tz) => {
  try { return new Intl.DateTimeFormat("en-US", { timeZone: tz || undefined, weekday: "short", hour: "numeric", minute: "2-digit" }).format(new Date(iso)); } catch { return new Date(iso).toISOString().slice(11, 16) + " UTC"; }
};

// The text the trusted contact gets. Only the sitter's name and phone, the place they
// chose to share and the time; nothing about the family or children.
export function alertMessage(c, profile = {}, tz = "") {
  const name = String(profile.name || "").trim() || "Your babysitter friend";
  const first = name.split(" ")[0];
  return [
    `Safety check-in for ${name}: ${first} expected to be home from babysitting by ${fmtTime(c.homeBy, tz)}${c.place ? ` (sitting in ${c.place})` : ""} and has not checked in ${c.graceMin} minutes later.`,
    `Please try to reach ${first}${profile.phone ? ` at ${String(profile.phone).trim()}` : ""}. If you cannot reach ${first} and are worried, call 911 or the local police.`,
    `This is an automatic message ${first} set up; you will get an all-clear if ${first} checks in.`,
  ].join(" ");
}
export function allClearMessage(c, profile = {}) {
  const first = (String(profile.name || "").trim() || "Your babysitter friend").split(" ")[0];
  return `All clear: ${first} has checked in safe. Thank you for being ${first}'s safety contact.`;
}
export function reminderMessage(c, link = "") {
  return `It's ${fmtTime(c.homeBy)} check-in time. If you're home, tap "I'm home safe"${link ? `: ${link}` : " in the app"}. Your contact ${c.contactName} will be alerted in ${c.graceMin} minutes otherwise. You can extend from the same link.`;
}

// The app's Sync replaces the server's desk; this keeps what happened on the server
// since (a tap on the link, an alert). For each id the newer `updatedAt` wins; a
// check-in only one side has is kept. Old closed ones fall off after 30 days.
export function mergeSafety(serverSafety, incomingSafety, nowMs = Date.now()) {
  const a = safetyState({ safety: serverSafety }).checkins, b = safetyState({ safety: incomingSafety }).checkins;
  const byId = new Map();
  for (const c of [...a, ...b]) {
    const have = byId.get(c.id);
    if (!have || String(c.updatedAt || "") > String(have.updatedAt || "")) byId.set(c.id, c);
  }
  const cutoff = nowMs - KEEP_DAYS * 864e5;
  const list = [...byId.values()].filter((c) => c.status === "active" || (Date.parse(c.updatedAt || c.homeBy) || nowMs) >= cutoff).sort((x, y) => String(x.createdAt).localeCompare(String(y.createdAt))).slice(-MAX_CHECKINS);
  return { ...(incomingSafety && typeof incomingSafety === "object" ? incomingSafety : {}), checkins: list };
}

export function upsertCheckin(desk, c) {
  const st = safetyState(desk);
  const i = st.checkins.findIndex((x) => x.id === c.id);
  if (i >= 0) st.checkins[i] = c; else st.checkins.push(c);
  desk.safety = { ...(desk.safety || {}), checkins: st.checkins.slice(-MAX_CHECKINS) };
  return c;
}

// ---------- house safety checklist ----------

export const HOUSE_CHECKLIST = [
  { id: "exits", label: "Two ways out", ask: "Where are the exits from the kids' rooms and the main floor? Which door do you use in a fire?" },
  { id: "alarms", label: "Smoke and CO alarms, fire extinguisher", ask: "Where is the fire extinguisher?" },
  { id: "firstaid", label: "First-aid kit", ask: "Where is it?" },
  { id: "meds", label: "Medicines, EpiPen, inhaler", ask: "Where are they kept, out of the kids' reach, and which may I give?" },
  { id: "pets", label: "Pets", ask: "Names, are they friendly, anything to keep the kids away from?" },
  { id: "water", label: "Pool, hot tub or water", ask: "Is it fenced or covered? Bath and pool rules?" },
  { id: "hazards", label: "Locked away", ask: "Cleaning products, sharp tools and any firearms locked and stored away while I'm there?" },
  { id: "doors", label: "Doors, keys and alarm", ask: "How do I lock up and set the alarm? (Don't write the code here; ask the parents in person.)" },
  { id: "address", label: "Address for 911", ask: "The exact address, nearest cross streets and how responders find the door." },
  { id: "phone", label: "Phone and Wi-Fi", ask: "Is there a landline, and does my phone get a signal in the house?" },
];

export function checklistState(family = {}) {
  const s = family.safety && typeof family.safety === "object" ? family.safety : {};
  const items = s.checklist && typeof s.checklist === "object" ? s.checklist : {};
  const rows = HOUSE_CHECKLIST.map((q) => ({ ...q, done: !!(items[q.id] && items[q.id].done), note: String((items[q.id] && items[q.id].note) || "") }));
  return { rows, done: rows.filter((r) => r.done).length, total: rows.length, crossStreets: String(s.crossStreets || ""), checkedOn: String(s.checkedOn || "") };
}

// Returns a new family record with one item updated (done and/or note) or crossStreets.
export function setChecklistItem(family, id, patch = {}, today = "") {
  const s = { ...(family.safety || {}) };
  if (id === "crossStreets") s.crossStreets = clip(patch.note, 160);
  else {
    if (!HOUSE_CHECKLIST.some((q) => q.id === id)) return family;
    const cur = { ...((s.checklist || {})[id] || {}) };
    if ("done" in patch) cur.done = !!patch.done;
    if ("note" in patch) cur.note = clip(patch.note, 300);
    s.checklist = { ...(s.checklist || {}), [id]: cur };
  }
  if (today) s.checkedOn = today;
  return { ...family, safety: s };
}

// ---------- the emergency card ----------

const NO_WARRANTY = "<strong>No warranty.</strong> Provided free and as-is, without warranty of any kind, express or implied. It is not legal, tax, or financial advice, and it is not medical advice; it does not replace first-aid training, a qualified professional or your own judgment. Check every line with the parents. To the maximum extent permitted by law, the authors accept no liability for any loss or damage arising from its use.";

const kidAge = (birth, today) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(birth || "")) || !today) return "";
  const [y, m, d] = birth.split("-").map(Number), [ty, tm, td] = today.split("-").map(Number);
  const months = (ty - y) * 12 + (tm - m) - (td < d ? 1 : 0);
  if (months < 0) return "";
  return months < 24 ? `${months} mo` : `${Math.floor(months / 12)} yr`;
};

// Everything a card shows, as data (tested, and used by the app's preview).
export function emergencyCardData(desk, familyId, today = "") {
  const f = (desk.families || []).find((x) => x.id === familyId);
  if (!f) return null;
  const care = f.care && typeof f.care === "object" ? f.care : {};
  const cl = checklistState(f);
  const contacts = (Array.isArray(f.emergencyContacts) ? f.emergencyContacts : []).filter((c) => c && (c.name || c.phone)).map((c) => ({ name: clip(c.name, 80), relation: clip(c.relation, 60), phone: clip(c.phone, 40) }));
  const kids = (f.kids || []).filter((k) => k && typeof k === "object").map((k) => ({ name: String(k.name || ""), age: kidAge(k.birth, today), allergies: String(k.allergies || ""), meds: String(k.meds || ""), notes: String(k.notes || "") }));
  const where = Object.fromEntries(cl.rows.filter((r) => r.note).map((r) => [r.id, r.note]));
  return {
    family: f.name || "Family",
    address: String(f.address || ""),
    crossStreets: cl.crossStreets,
    parents: [{ name: String(f.contactName || ""), phone: String(f.contact || "") }].filter((p) => p.name || p.phone),
    contacts,
    emergencyText: contacts.length ? "" : String(f.emergency || ""),
    kids,
    doctor: String(care.doctor || ""),
    hospital: String(care.hospital || ""),
    medicalConsent: f.medicalConsent ? `${f.medicalConsent.name || "signed"}, ${f.medicalConsent.date || ""}`.trim() : "",
    where,
    missing: [!f.address && "address", !cl.crossStreets && "cross streets", !(f.contact) && "a parent's phone", !contacts.length && !f.emergency && "an emergency contact", !care.doctor && "the doctor"].filter(Boolean),
  };
}

// A one-page card to print and keep in the sitter's bag, and to open offline in the app.
export function emergencyCard(desk, familyId, today = "") {
  const d = emergencyCardData(desk, familyId, today);
  if (!d) return "";
  const tel = (p) => (digits(p).length >= 7 ? `<a href="tel:${esc(digits(p))}">${esc(p)}</a>` : esc(p));
  const row = (label, value) => (value ? `<tr><th>${esc(label)}</th><td>${value}</td></tr>` : "");
  const kids = d.kids.length ? d.kids.map((k) => `<li><strong>${esc(k.name || "Child")}</strong>${k.age ? ` (${esc(k.age)})` : ""}${k.allergies ? `<br><span class="alert">Allergies: ${esc(k.allergies)}</span>` : ""}${k.meds ? `<br>Medicines: ${esc(k.meds)}` : ""}${k.notes ? `<br><span class="small">${esc(k.notes)}</span>` : ""}</li>`).join("") : "<li>No children on file yet.</li>";
  const whereLabels = { firstaid: "First-aid kit", meds: "Medicines", alarms: "Fire extinguisher", exits: "Exits", pets: "Pets", water: "Water", phone: "Phone", hazards: "Locked away" };
  const where = Object.entries(d.where).filter(([k]) => whereLabels[k]).map(([k, v]) => row(whereLabels[k], esc(v))).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Emergency card: ${esc(d.family)}</title><style>body{font:15px/1.45 system-ui,sans-serif;max-width:40rem;margin:1.2rem auto;padding:0 1rem;color:#1d1a22;background:#fff}h1{font-size:1.35rem;margin:.2rem 0}h2{font-size:1rem;margin:1rem 0 .3rem;border-bottom:2px solid #1d1a22}.first{border:3px solid #a3122a;border-radius:10px;padding:.6rem .9rem;margin:.6rem 0}.first strong{color:#a3122a}.big{font-size:1.25rem;font-weight:700}table{border-collapse:collapse;width:100%}th{text-align:left;vertical-align:top;padding:3px 8px 3px 0;width:9.5rem;font-weight:600}td{padding:3px 0}.alert{color:#a3122a;font-weight:700}.small,footer{font-size:.82rem;color:#4a4452}ul{padding-left:1.1rem;margin:.2rem 0}a{color:inherit}@media print{body{margin:0}.noprint{display:none}}</style></head><body>
<p class="noprint small"><button type="button" onclick="print()">Print</button> Keep one in your bag and one on the family's fridge.</p>
<h1>Emergency card: ${esc(d.family)}</h1>
<div class="first"><p class="big"><strong>Call 911 first</strong> for anything life-threatening: not breathing, unconscious, choking that does not clear, a seizure, a severe allergic reaction (use the child's EpiPen as the parents' plan says, then call), serious bleeding or a fire. Then call the parents.</p>
<p>Tell the dispatcher the address below and the cross streets, stay on the line and do what they say. Get everyone out first in a fire.</p>
<p><strong>Poison Help: <a href="tel:18002221222">${POISON_HELP}</a></strong> (US, free, 24 hours) if a child swallowed, breathed or touched something and is awake and breathing; call 911 instead if they are not.</p></div>
<h2>Where you are</h2><table>${row("Address", esc(d.address) || "<em>add the address</em>")}${row("Cross streets", esc(d.crossStreets) || "<em>ask the parents</em>")}</table>
<h2>Parents and emergency contacts</h2><table>${d.parents.map((p) => row(p.name || "Parent", tel(p.phone))).join("")}${d.contacts.map((c) => row(`${c.name}${c.relation ? ` (${c.relation})` : ""}`, tel(c.phone))).join("")}${d.emergencyText ? row("Emergency contact", esc(d.emergencyText)) : ""}</table>
<h2>Children: allergies and medicines</h2><ul>${kids}</ul>
<h2>Doctor and hospital</h2><table>${row("Pediatrician", esc(d.doctor) || "<em>ask the parents</em>")}${row("Hospital", esc(d.hospital))}${row("Medical consent", d.medicalConsent ? `on file: ${esc(d.medicalConsent)} (a template, not legal advice)` : "not on file")}</table>
${where ? `<h2>In the house</h2><table>${where}</table>` : ""}
${d.missing.length ? `<p class="noprint small">Missing: ${esc(d.missing.join(", "))}. Add them in the Families or Safety tab.</p>` : ""}
<footer><p>Printed ${esc(today)} from Babysitting Business Kit. Poison Help number from <a href="${POISON_HELP_SOURCE}">poison.org</a>. A first-aid and CPR class teaches what this card cannot.</p><p>${NO_WARRANTY}</p><p><a href="https://github.com/sponsors/Duncan-Haywood" rel="noopener">Support</a> is optional and never changes what the tool does.</p></footer>
</body></html>`;
}
