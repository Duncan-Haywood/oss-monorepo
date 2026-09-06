// Puts a scenario's numbers in the URL itself, so a seat review can be sent to
// a manager or finance partner without uploading anything -- seat counts and
// per-seat price are commercially sensitive, which is the same reason
// usage.mjs never sends them anywhere either. Single-sourced from calc.mjs's
// INPUT_FIELDS so a field added to the form is shareable the day it ships.
import { INPUT_FIELDS as FIELDS } from './calc.mjs';

// `noticeDays` is not one of calculateTrueUp's own INPUT_FIELDS -- it only
// feeds evaluateNoticeDeadline -- but it has to ride in the same link. Found
// 2026-09-06 by `platform/pages/roundtrip.mjs`, the only failure across 720
// pages: a reviewer who typed a 60-day notice period, copied the link, and
// sent it to a manager watched that manager's copy of the page silently show
// 0 instead.
const EXTRA_NUMBER_FIELD_IDS = Object.freeze(['noticeDays']);

// The one date field on the form. It is deliberately excluded from the saved
// scenario in usage.mjs -- a renewal date from last quarter is stale next
// quarter, and reappearing on a later, unrelated visit would be actively
// wrong -- but that reasoning does not apply to a share link at all: the
// recipient is reviewing the *same* renewal the sender just looked at, not a
// future one. Leaving it out of the link, as it was until 2026-09-06,
// silently hid the entire notice-deadline verdict on the recipient's page --
// evaluateNoticeDeadline() returns null with no renewalDate, so a warning
// like "this auto-renews at the full seat count unless you act by <date>"
// that the sender saw simply never rendered for the person the review was
// sent to. `roundtrip.mjs` cannot catch this half on its own: it only reads
// `input[type="number"]`, and this is `type="date"`.
const DATE_FIELD_IDS = Object.freeze(['renewalDate']);

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Shape-checked rather than calendar-checked: a link carrying "2026-13-40" is
// passed through to calc.mjs's evaluateNoticeDeadline, which already treats
// an unparseable date as "no deadline" the same way an empty field does. This
// only guards against a fragment that is not a date-shaped string at all.
function usableDate(value) {
  return typeof value === 'string' && ISO_DATE_RE.test(value) ? value : null;
}

export function encodeInputs(input) {
  const params = new URLSearchParams();
  for (const field of [...FIELDS, ...EXTRA_NUMBER_FIELD_IDS]) {
    const value = Number(input?.[field]);
    if (Number.isFinite(value) && value >= 0) params.set(field, String(value));
  }
  for (const field of DATE_FIELD_IDS) {
    const value = usableDate(input?.[field]);
    if (value !== null) params.set(field, value);
  }
  return params.toString();
}

export function decodeInputs(value) {
  const params = new URLSearchParams(String(value || '').replace(/^[?#]/, ''));
  const result = {};
  for (const field of [...FIELDS, ...EXTRA_NUMBER_FIELD_IDS]) {
    if (!params.has(field)) continue;
    const number = Number(params.get(field));
    if (Number.isFinite(number) && number >= 0) result[field] = number;
  }
  for (const field of DATE_FIELD_IDS) {
    if (!params.has(field)) continue;
    const value = usableDate(params.get(field));
    if (value !== null) result[field] = value;
  }
  return result;
}
