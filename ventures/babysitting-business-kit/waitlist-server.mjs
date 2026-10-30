// Babysitting Business Kit: the waitlist's server half, for server.mjs.
//
//   waitlistRoutes(...)   on every request, lapsed holds and offers expire (and the desk is
//                         saved); POST /book/waitlist adds a family to the waitlist for a
//                         time that is taken. A time that is open is sent back to the
//                         booking form instead. Honeypot, 10 per IP per hour, 16 KB cap.
//
// It reads no environment variables and calls no outside service except the sitter's own
// alert (the `notify` function server.mjs passes in).

import { openSlots, bookPage, fitsOpenSlot, localMinutes } from "./slots.mjs";
import { addToWaitlist, expireHolds, placeInLine, whenText } from "./waitlist.mjs";

const MAX_BODY = 16 * 1024;
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const page = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title><style>body{font:17px/1.6 Georgia,serif;max-width:36rem;margin:3rem auto;padding:0 1rem;color:#2b2433;background:#fffaf6}a{color:#b0507a}</style></head><body><h1>${esc(title)}</h1>${body}</body></html>`;

async function readBody(req, limit) {
  let size = 0;
  const chunks = [];
  for await (const c of req) { size += c.length; if (size > limit) return null; chunks.push(c); }
  return Buffer.concat(chunks).toString("utf8");
}

export function waitlistRoutes(state, save, env = {}, now = Date.now, notify = async () => false) {
  const hits = new Map();
  return async (req, url, send) => {
    if (state.desk && expireHolds(state.desk, now())) save();
    if (url.pathname !== "/book/waitlist") return false;
    if (req.method !== "POST") { send(303, "", "text/plain", { location: "/book" }); return true; }
    const ip = String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "").split(",")[0].trim();
    const key = `${ip}|${Math.floor(now() / 36e5)}`;
    hits.set(key, (hits.get(key) || 0) + 1);
    if (hits.size > 5000) hits.clear();
    if (hits.get(key) > 10) { send(429, page("Slow down", "<p>Too many requests from here. Please try again later.</p>")); return true; }
    const raw = await readBody(req, MAX_BODY);
    if (raw === null) { send(413, page("Too long", "<p>That request was too long.</p>")); return true; }
    let fields;
    try { fields = /json/.test(req.headers["content-type"] || "") ? JSON.parse(raw) : Object.fromEntries(new URLSearchParams(raw)); } catch { fields = {}; }
    fields = fields && typeof fields === "object" ? fields : {};
    const done = (place) => page("You're on the waitlist", `<p>Thank you! ${esc(state.desk.profile.name)} will message you if that time opens up${place ? ` (you're number ${place} in line)` : ""}.</p><p><a href="/book">Back</a></p>`);
    if (fields.website) { send(200, done(0)); return true; }
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: env.TZ || undefined, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(now()));
    const weeks = Math.min(8, Math.max(1, Number(env.BOOK_WEEKS) || 2));
    const slots = openSlots(state.desk, { from: today, weeks, nowMin: localMinutes(now(), env.TZ), at: now() });
    // Only the family's own fields: never a familyId from the public form.
    const clean = { name: fields.name, contact: fields.contact, date: fields.date, start: fields.start, end: fields.end, kids: fields.kids, notes: fields.notes };
    if (fitsOpenSlot(slots, String(clean.date || ""), String(clean.start || ""), String(clean.end || "")).ok) {
      send(400, bookPage(state.desk, slots, { message: "Good news: that time is open. Please request it with the form above." }));
      return true;
    }
    const r = addToWaitlist(state.desk, clean, { today, at: now(), source: "book" });
    if (!r.ok) { send(400, bookPage(state.desk, slots, { message: r.why })); return true; }
    save();
    const place = placeInLine(state.desk, r.entry.id);
    await notify(`Waitlist: ${r.entry.name}, ${whenText(r.entry)}`, [`Contact: ${r.entry.contact}`, r.entry.kids.length && `Kids: ${r.entry.kids.join(", ")}`, `Number ${place} in line for that day.`, "See it in the app's Waitlist tab."].filter(Boolean).join("\n"));
    send(200, done(place));
    return true;
  };
}
