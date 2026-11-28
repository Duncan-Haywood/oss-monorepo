// Arizona preliminary twenty day notice (Ariz. Rev. Stat. § 33-992.01): the last day to give it and
// what a late notice still covers.
//
// Source: A.R.S. §§ 33-992.01 and 33-992.02 as published by the Arizona Legislature
// (https://www.azleg.gov/ars/33/00992-01.htm, https://www.azleg.gov/ars/33/00992-02.htm), read
// 2026-11-28; the same text PayApps checks its printed notice against
// (ventures/payapps/packages/lien-waivers/sources/az-33-992.txt).
//
// Day counting: § 33-992.01(C) says the notice "shall be given not later than twenty days after the
// claimant has first furnished" to the jobsite, so the last day is first furnished + 20 calendar
// days. § 33-992.01(F): mailed notice ("first class mail sent with a certificate of mailing,
// registered or certified mail") is complete "at the time of the deposit of notice in the mail", so
// the mailing day is the day it is given. A late notice covers what was "furnished within twenty days
// before the service of the notice and at any time thereafter" (§ 33-992.01(E)), so the earliest
// covered day is the mailing day less 20. Nothing here moves a date off a weekend or holiday.
// Pure functions, no I/O.

const DAY = 86400000;
export const AZ_DAYS = 20;

export function parseDate(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v ?? "").trim());
  if (!m) return NaN;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  const d = new Date(t);
  return d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] ? t : NaN;
}
export const isoDate = (t) => new Date(t).toISOString().slice(0, 10);

/**
 * { lastDay, daysLeft?, state?, mailed?: { onTime, coversFrom } } from YYYY-MM-DD strings, or
 * { error } when the first-furnished date is missing or invalid. `mailed` and `today` are optional.
 */
export function azNoticeDates({ firstFurnished, mailed, today } = {}) {
  const first = parseDate(firstFurnished);
  if (Number.isNaN(first)) return { error: "Enter the first day you furnished labor or materials to the jobsite as YYYY-MM-DD." };
  const last = first + AZ_DAYS * DAY;
  const out = { lastDay: isoDate(last) };
  const t = parseDate(today);
  if (!Number.isNaN(t)) {
    const left = Math.round((last - t) / DAY);
    out.daysLeft = left;
    out.state = left < 0 ? "past" : left === 0 ? "today" : left <= 5 ? "soon" : "open";
  }
  if (mailed !== undefined && String(mailed).trim() !== "") {
    const m = parseDate(mailed);
    if (Number.isNaN(m)) return { error: "Enter the mailing day as YYYY-MM-DD, or leave it blank." };
    if (m < first) return { error: "The mailing day is before the first day you furnished. A notice can go out early; enter the first furnishing day you expect, or leave the mailing day blank." };
    const onTime = m <= last;
    out.mailed = { onTime, coversFrom: onTime ? isoDate(first) : isoDate(m - AZ_DAYS * DAY) };
  }
  return out;
}
