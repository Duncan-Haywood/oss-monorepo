// Babysitting Business Kit: the sitter's own credentials and business setup. Pure
// functions over the desk; credentials-ui.mjs draws them in Settings and on Today.
//
//   desk.credentials  [{ id, kind, name, provider, issued, expires, note, onSite }]
//                     issued / expires: "YYYY-MM-DD" or "YYYY-MM" (a month means its last day)
//   desk.business     { structure: "sole" | "llc" | "", ein, bank, records, drivesKids, licenseChecked }
//                     ticks only; the EIN itself, an SSN or a policy number never go here
//
// The website already hides a certification whose "valid through" date has passed
// (site.mjs, certCurrent over profile.site.certs). syncSiteCerts writes the tracker's
// "show on my website" items into that same text, so there is one expiry rule, not two.

const str = (s) => String(s ?? "").trim();
const isoDay = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const isoMonth = (s) => /^\d{4}-\d{2}$/.test(s);
const datePart = (s) => (isoDay(str(s)) || isoMonth(str(s)) ? str(s) : "");
const dayMs = (d) => Date.parse(`${d}T12:00:00Z`);
const between = (a, b) => Math.round((dayMs(b) - dayMs(a)) / 864e5);

// What a babysitter is commonly asked for, or carries for her own protection. `site`:
// shown on the website by default. `driving`: only matters when she drives children.
export const KINDS = {
  cpr: { label: "CPR and First Aid", site: true },
  background: { label: "Background check", site: true },
  driver: { label: "Driver's license", site: false, driving: true },
  auto: { label: "Car insurance", site: false, driving: true },
  liability: { label: "Liability insurance", site: false },
  local: { label: "Local business license", site: false },
  other: { label: "Other", site: false },
};

// Reminders go out at these many days before expiry, then once it has expired.
export const REMIND_DAYS = [60, 30, 7];

// "2028-03" -> "2028-03-31"; a full date is kept; anything else -> "".
export function expiryDay(expires) {
  const e = str(expires);
  if (isoDay(e)) return e;
  if (!isoMonth(e)) return "";
  const [y, m] = e.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0, 12)).toISOString().slice(0, 10);
}

export function normalizeCredential(c = {}, id) {
  const kind = KINDS[c.kind] ? c.kind : "other";
  return {
    id: str(c.id) || id || `cred_${Math.floor(Math.random() * 36 ** 8).toString(36)}`,
    kind,
    name: str(c.name) || (kind === "other" ? "" : KINDS[kind].label),
    provider: str(c.provider),
    issued: datePart(c.issued),
    expires: datePart(c.expires),
    note: str(c.note),
    onSite: c.onSite === undefined ? KINDS[kind].site : c.onSite === true || c.onSite === "on" || c.onSite === "true",
    ...(typeof c.dismissed === "string" && /^[\d-]+:\d+$/.test(c.dismissed) ? { dismissed: c.dismissed } : {}),
  };
}

// From the Settings form's fields (strings, a checkbox "on").
export function credentialFromForm(fields, id) {
  return normalizeCredential({ ...fields, onSite: fields.onSite === "on" || fields.onSite === true }, id);
}

// { state: "current" | "expiring" | "expired" | "no-date", days, step }
// days: days left until the expiry day (negative once past). step: the reminder window
// it is in (60, 30 or 7), 0 once expired, null when not yet within 60 days.
export function credentialStatus(c, today) {
  const end = expiryDay(c && c.expires);
  if (!end || !isoDay(str(today))) return { state: "no-date", days: null, step: null };
  const days = between(today, end);
  if (days < 0) return { state: "expired", days, step: 0 };
  const windows = REMIND_DAYS.filter((n) => days <= n);
  const step = windows.length ? Math.min(...windows) : null;
  return { state: step === null ? "current" : "expiring", days, step };
}

const fmtDay = (d) => {
  const [y, m, day] = d.split("-").map(Number);
  return `${["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][m - 1]} ${day}, ${y}`;
};

// Today items, the same shape as engine.todayQueue's. An item is hidden after the sitter
// marks that step done (c.dismissed = "expires:step") until the next, closer step arrives;
// new dates after a renewal start the reminders afresh.
export function credentialReminders(desk, today) {
  const out = [];
  const drives = !!(desk.business && desk.business.drivesKids);
  for (const raw of Array.isArray(desk.credentials) ? desk.credentials : []) {
    const c = normalizeCredential(raw);
    if (KINDS[c.kind].driving && !drives) continue;
    const s = credentialStatus(c, today);
    if (s.step === null) continue;
    const [dExp, dStep] = String(c.dismissed || "").split(":");
    if (c.dismissed && dExp === c.expires && Number(dStep) <= s.step) continue;
    const end = expiryDay(c.expires);
    const name = c.name || KINDS[c.kind].label;
    const title = s.state === "expired"
      ? `${name} expired on ${fmtDay(end)}${c.onSite ? ": it is off your website until you renew" : ""}`
      : `${name} expires ${s.days === 0 ? "today" : s.days === 1 ? "tomorrow" : `in ${s.days} days`} (${fmtDay(end)})`;
    const how = c.provider ? `Renew with ${c.provider}` : "Book the renewal";
    const message = s.state === "expired" ? `${how}, then enter the new dates in Settings, Credentials.` : `${how} now so there is no gap${c.onSite ? "; your website stops listing it the day after it expires" : ""}.`;
    out.push({ kind: "credential", priority: s.step <= 7 ? 1 : s.step === 30 ? 2 : 3, title, message, id: c.id, step: s.step });
  }
  return out.sort((a, b) => a.priority - b.priority);
}

// Mark the current reminder step done for one credential.
export function dismissReminder(desk, id, step) {
  const c = (desk.credentials || []).find((x) => x.id === id);
  if (c) c.dismissed = `${datePart(c.expires)}:${Number(step) || 0}`;
  return desk;
}

// ---------- the website ----------

const lineName = (line) => line.split("|")[0].trim().toLowerCase();

// The lines the tracker contributes to profile.site.certs ("name | issued | valid through").
export function siteCertLines(desk) {
  return (desk.credentials || []).map((c) => normalizeCredential(c)).filter((c) => c.onSite && c.name).map((c) => [c.name, c.issued, c.expires].join(" | ").replace(/( \| )+$/, ""));
}

// Rewrites profile.site.certs: lines the sitter typed by hand for things the tracker does
// not hold are kept; every line named like a tracked credential is replaced by the
// tracker's own (or dropped when "show on my website" is off). Idempotent.
export function syncSiteCerts(desk) {
  const tracked = new Set((desk.credentials || []).map((c) => normalizeCredential(c).name.toLowerCase()).filter(Boolean));
  if (!tracked.size) return desk;
  const profile = desk.profile || (desk.profile = {});
  const site = profile.site && typeof profile.site === "object" ? profile.site : (profile.site = {});
  const kept = str(site.certs).split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !tracked.has(lineName(l)));
  site.certs = [...kept, ...siteCertLines(desk)].join("\n");
  return desk;
}

// ---------- business readiness ----------

export const STRUCTURES = { sole: "Sole proprietor", llc: "LLC" };

// Every step a one-person babysitting business is commonly told to take, done or not.
// `done` is from the sitter's own ticks and the tracker; nothing is assumed.
export function readiness(desk, today) {
  const b = desk.business && typeof desk.business === "object" ? desk.business : {};
  const creds = (desk.credentials || []).map((c) => normalizeCredential(c));
  const current = (kind) => {
    const list = creds.filter((c) => c.kind === kind);
    if (!list.length) return { done: false, detail: "Not in the tracker yet." };
    const ok = list.find((c) => credentialStatus(c, today).state !== "expired");
    if (!ok) return { done: false, detail: "Expired: renew it and enter the new dates." };
    const s = credentialStatus(ok, today);
    return { done: true, detail: s.state === "no-date" ? "On file (no expiry date entered)." : s.state === "expiring" ? `On file; expires in ${s.days} days.` : "On file and current." };
  };
  const items = [
    { id: "structure", label: "Business structure chosen", done: !!STRUCTURES[b.structure], detail: STRUCTURES[b.structure] ? STRUCTURES[b.structure] : "Doing business under your own name already makes you a sole proprietor; an LLC is a choice you file with your state.", guide: "structure" },
    { id: "ein", label: "Taxpayer ID ready for families' Form W-10", done: !!b.ein || !!str(desk.profile && desk.profile.taxId), detail: "Families claiming the child care credit need your name, address and taxpayer ID. An EIN is free from the IRS.", guide: "ein" },
    { id: "bank", label: "Separate account for business money", done: !!b.bank, detail: "Keeps babysitting income and spending apart from personal money.", guide: "bank" },
    { id: "records", label: "Every payment and receipt recorded", done: !!b.records, detail: "The Money & taxes tab is your books; keep receipts for at least 3 years.", guide: "records" },
    { id: "cpr", label: "CPR and First Aid current", ...current("cpr"), guide: "credentials" },
    { id: "background", label: "Background check on file", ...current("background"), guide: "credentials" },
    { id: "liability", label: "Liability insurance", ...current("liability"), guide: "insurance" },
  ];
  if (b.drivesKids) {
    items.push({ id: "driver", label: "Driver's license current", ...current("driver"), guide: "credentials" });
    items.push({ id: "auto", label: "Car insurance current (and it covers driving children for pay)", ...current("auto"), guide: "insurance" });
  }
  const local = current("local");
  items.push({ id: "licensing", label: "Local licensing checked", done: !!b.licenseChecked || local.done, detail: local.done ? local.detail : "Ask your state's child care licensing office and your city or county clerk whether you need anything.", guide: "licensing" });
  const done = items.filter((x) => x.done).length;
  return { items, done, total: items.length, missing: items.filter((x) => !x.done).map((x) => x.label) };
}

export function normalizeBusiness(b) {
  const x = b && typeof b === "object" && !Array.isArray(b) ? b : {};
  return { structure: STRUCTURES[x.structure] ? x.structure : "", ein: !!x.ein, bank: !!x.bank, records: !!x.records, drivesKids: !!x.drivesKids, licenseChecked: !!x.licenseChecked };
}
