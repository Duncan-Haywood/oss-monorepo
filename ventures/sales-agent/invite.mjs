// A calendar file (.ics) for a meeting time a prospect proposed in a reply (added 2026-11-06).
// Rules only, no network, sends nothing. The user opens the file in their calendar and sends the invite themselves,
// after the prospect has confirmed the time zone: the file uses a floating local time (no zone) because slots.mjs
// never guesses one, and it is marked TENTATIVE with that said in the description. A slot that is only a part of the
// day ("Friday morning"), a lower bound ("after 3pm") or a time with no clock hour yields no file, never an invented hour.
import { createHash } from "node:crypto";

const esc = (s) => String(s ?? "").replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
// RFC 5545 section 3.1: lines folded at 75 octets, continuation starts with one space; fold on character edges.
function fold(line) {
  const out = []; let cur = "", n = 0;
  for (const ch of line) {
    const b = Buffer.byteLength(ch);
    if (n + b > (out.length ? 74 : 75)) { out.push(cur); cur = ""; n = 0; }
    cur += ch; n += b;
  }
  out.push(cur);
  return out.join("\r\n ");
}
const stamp = (date, time) => `${date.replaceAll("-", "")}T${time.replace(":", "")}00`;
function addMinutes(date, time, mins) {
  const d = new Date(`${date}T${time}:00Z`); d.setUTCMinutes(d.getUTCMinutes() + mins);
  return stamp(d.toISOString().slice(0, 10), d.toISOString().slice(11, 16));
}
const safeAddr = (e) => /^[^\s@<>;,"]+@[^\s@<>;,"]+\.[^\s@<>;,"]+$/.test(e || "") ? e : null;

/**
 * @param {{email:string,name?:string,company?:string,slot:object,today:string,offer?:{product?:string,sender_name?:string,sender_email?:string,duration_minutes?:number,booking_link?:string}}} a
 * @returns {{ok:boolean, why?:string, filename?:string, ics?:string, summary?:string}}
 */
export function buildInvite({ email, name, company, slot, today, offer = {} }) {
  const to = safeAddr(email);
  if (!to) return { ok: false, why: "no valid address for the prospect" };
  if (!slot || !slot.date) return { ok: false, why: "no date in the reply" };
  if (slot.after) return { ok: false, why: `only a lower bound ("${slot.text}"), ask for a start time` };
  if (!slot.time) return { ok: false, why: `no clock time ("${slot.text}"), ask which hour` };
  const dur = Number.isInteger(offer.duration_minutes) && offer.duration_minutes >= 5 && offer.duration_minutes <= 240 ? offer.duration_minutes : 30;
  const who = (name || "").trim() || to, org = (company || "").trim();
  const product = (offer.product || "").trim();
  const summary = `${product ? product + ": " : ""}Call with ${who}${org ? ` (${org})` : ""}`;
  const desc = [
    `Time proposed by ${who} in their reply: "${slot.text}"${slot.ambiguous ? " (read by the agent; check the date)" : ""}.`,
    "TIME ZONE NOT CONFIRMED. This file has no zone, so your calendar shows it in your own. Confirm theirs before you send the invite.",
    offer.booking_link ? `Booking link: ${offer.booking_link}` : "",
  ].filter(Boolean).join("\n");
  const uid = createHash("sha256").update(`${to}|${slot.date}|${slot.time}`).digest("hex").slice(0, 24) + "@sales-agent.local";
  const sender = safeAddr(offer.sender_email);
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//oss-monorepo//sales-agent//EN", "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT", `UID:${uid}`, `DTSTAMP:${stamp(today, "00:00")}Z`,
    `DTSTART:${stamp(slot.date, slot.time)}`, `DTEND:${addMinutes(slot.date, slot.time, dur)}`,
    `SUMMARY:${esc(summary)}`, `DESCRIPTION:${esc(desc)}`, "STATUS:TENTATIVE", "TRANSP:OPAQUE",
    sender ? `ORGANIZER;CN=${esc(offer.sender_name || sender).replace(/[":]/g, "")}:mailto:${sender}` : "",
    `ATTENDEE;CN=${esc(who).replace(/[":]/g, "")};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION:mailto:${to}`,
    "END:VEVENT", "END:VCALENDAR",
  ].filter(Boolean);
  return { ok: true, filename: `${to.replace(/[^a-z0-9@.+-]/gi, "_")}-${slot.date}.ics`, ics: lines.map(fold).join("\r\n") + "\r\n", summary };
}
