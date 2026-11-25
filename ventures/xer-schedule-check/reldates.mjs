// P6's own relationship dates: what each link's lag was when P6 last
// scheduled the file.
//
// An XER's TASKPRED table stores two dates per link besides its type and lag,
// `aref` and `arls`, which P6 writes at every schedule run and which no
// screen shows. Decoded on seven P6 files (P6 5.0 to 20.12, P6 Web 17.12;
// eval/relationship-dates-2026-11-20.md), between two unstarted activities:
//
//   aref = the early start the link gives the successor:
//            FS: pred early finish + lag     SS: pred early start + lag
//            FF: (pred early finish + lag) less the successor's duration
//   arls = the late date the link gives the predecessor:
//            FS: succ late start - lag       FF: succ late finish - lag
//            SS: succ late start - lag - the predecessor's duration
//            SF: aref = (pred early start + lag) less the successor's
//            duration; arls = succ late finish - lag - the predecessor's
//            duration (2026-11-24: the three SF links in seven files,
//            eval/p6-probes-2026-11-24.md)
//
// Both are written in the same run as the activities' stored dates, so they
// carry the lag P6 used. A lag edited afterwards (lengthened or shortened)
// leaves them pointing at the old one, and the old lag can be read back:
// the working time on the lag calendar between the predecessor's stored date
// and aref, and between arls and the successor's stored date.
//
// relationshipLags(model) -> { checked, links: [{ rel, pred, succ, lag,
//   was, witnesses: ["aref", "arls"] }], added: [{ rel, pred, succ }] }
//   checked: links between two unstarted activities with every date stored
//   links:   those whose stored relationship dates say the lag was `was`
//            minutes (not the current `lag`), on both witnesses where both
//            exist; arls alone when aref is empty or off the activities'
//            dates (P6 Web 17.12 writes some arefs an hour off)
//   started: every link with a started end (an in-progress or finished
//            predecessor, or an in-progress successor; never a finished
//            successor): { checked, agree: Set of link ids whose dates say P6
//            used the current lag, was: [{ rel, pred, succ, lag, was }],
//            atMost: [{ rel, pred, succ, lag, atMost }] }. There the dates
//            carry only the lag still unspent at the data date,
//            max(0, lag - the lag calendar's working time from the
//            predecessor's actual finish (FS, FF) or actual start (SS) to the
//            data date) (cpm.mjs rule 17; eval/relationship-dates-started-
//            2026-11-24.md: arls 11,610 of 11,610 links on six files).
//            `was` is exact while some of the old lag was unspent; where P6's
//            dates show none left but the current lag leaves some, the old lag
//            is only known to be at most what was spent (`atMost`).
//   finished: the same object as `started` (its earlier name, when only FS
//            and FF links from finished predecessors were read)
//   added:   links with neither date in a file whose other links have them,
//            between two activities that have stored dates (P6 fills both
//            on every link it schedules, so the link came after the run)

import { lagCalendar } from "./cpm.mjs";
import { parseDate } from "./xer.mjs";

const TOL = 1; // minutes

export function relationshipLags(model) {
  const out = { checked: 0, links: [], added: [], started: { checked: 0, agree: new Set(), was: [], atMost: [] } };
  out.finished = out.started;
  const rowOf = new Map();
  for (const t of model.tasks.values()) rowOf.set(t.id, t);
  let withDates = 0, total = 0;
  for (const rel of model.rels) {
    if (rel.external || !rel.row) continue;
    total++;
    if (rel.row.aref || rel.row.arls) withDates++;
  }
  if (!withDates) return out; // an exporter that writes neither (P6 24.12 Web, converters)
  for (const rel of model.rels) {
    if (rel.external || !rel.row) continue;
    const pred = rowOf.get(rel.predId), succ = rowOf.get(rel.succId);
    if (!pred || !succ || pred.span || succ.span) continue;
    if (succ.status === "TK_Complete") continue;
    if (pred.status !== "TK_NotStart" || succ.status !== "TK_NotStart") { startedLink(model, rel, pred, succ, out.started); continue; }
    const p = pred.row, s = succ.row;
    if ([p.early_start_date, p.early_end_date, s.late_start_date, s.late_end_date].some((d) => parseDate(d) === null)) continue;
    if (parseDate(rel.row.aref) === null && parseDate(rel.row.arls) === null) {
      if (withDates * 2 > total) out.added.push({ rel, pred, succ });
      continue;
    }
    const w = impliedLags(model, rel, pred, succ);
    if (!w) continue;
    const { fromA, fromL } = w;
    out.checked++;
    const off = (v) => v !== null && Math.abs(v - rel.lag) > TOL;
    let was = null, witnesses = [];
    if (fromL !== null && fromA !== null && Math.abs(fromL - fromA) <= TOL) {
      if (off(fromL)) { was = fromL; witnesses = ["aref", "arls"]; }
    } else if (fromL !== null && off(fromL) && (fromA === null || off(fromA))) {
      // arls is the steadier witness (aref is an hour off on some P6 Web
      // links); with aref disagreeing too, the lag did change
      was = fromL; witnesses = ["arls"];
    }
    if (was !== null) out.links.push({ rel, pred, succ, lag: rel.lag, was: Math.round(was), witnesses });
  }
  return out;
}

// The lag each stored relationship date implies for one link between two
// unstarted activities with stored dates: { fromA, fromL } in minutes (null
// where that date is empty or not decoded).
export function impliedLags(model, rel, pred, succ) {
  const p = pred.row, s = succ.row;
  const pES = parseDate(p.early_start_date), pEF = parseDate(p.early_end_date);
  const sLS = parseDate(s.late_start_date), sLF = parseDate(s.late_end_date);
  const aref = parseDate(rel.row.aref), arls = parseDate(rel.row.arls);
  const lc = lagCalendar(model, rel);
  const span = (a, b) => (b >= a ? lc.workBetween(a, b) : -lc.workBetween(b, a));
  let fromA = null, fromL = null;
  switch (rel.type) {
    case "PR_FS":
    if (aref !== null) fromA = span(pEF, aref);
    if (arls !== null) fromL = span(arls, sLS);
    break;
    case "PR_SS":
    if (aref !== null) fromA = span(pES, aref);
    // arls is the predecessor's duration before (late start - lag);
    // only when the lag runs on the predecessor's own calendar
    if (arls !== null && lc === pred.cal) fromL = span(arls, sLS) - pred.remain;
    break;
    case "PR_FF":
    if (aref !== null) fromA = span(pEF, succ.cal.addWork(aref, succ.remain));
    if (arls !== null) fromL = span(arls, sLF);
    break;
    case "PR_SF":
    // the SS and FF shapes together: aref is the successor's early start,
    // arls a late date less the predecessor's duration
    if (aref !== null) fromA = span(pES, succ.cal.addWork(aref, succ.remain));
    if (arls !== null && lc === pred.cal) fromL = span(arls, sLF) - pred.remain;
    break;
    default:
    return null;
  }
  return { fromA, fromL };
}

// The part of a link's lag P6 counts at the data date: all of it, less the
// lag calendar's working time already spent since the predecessor's actual
// finish (FS, FF) or actual start (SS, SF). Returns { spent, eff } in minutes, or
// null when a date it needs is missing.
export function unspentLag(model, rel, pred, succ) {
  const fromStart = rel.type === "PR_SS" || rel.type === "PR_SF";
  const from = pred.status === "TK_Complete" && !fromStart ? pred.actEnd
    : pred.status !== "TK_NotStart" && fromStart ? pred.actStart : undefined;
  if (from === undefined) return { spent: 0, eff: rel.lag };
  const dd = model.projects.get(succ.proj)?.dataDate;
  if (from === null || dd === null || dd === undefined) return null;
  const spent = from < dd ? lagCalendar(model, rel).workBetween(from, dd) : 0;
  return { spent, eff: Math.max(0, rel.lag - spent) };
}

// A link with a started end. The witnesses are read as for two unstarted
// activities (the stored dates of a started activity are its remaining
// ones), against the unspent lag instead of the whole lag; a finished
// predecessor has no early dates, so arls is its only witness.
function startedLink(model, rel, pred, succ, acc) {
  const u = unspentLag(model, rel, pred, succ);
  if (!u) return;
  const p = pred.row, s = succ.row;
  const sLS = parseDate(s.late_start_date), sLF = parseDate(s.late_end_date);
  const pES = parseDate(p.early_start_date), pEF = parseDate(p.early_end_date);
  const aref = pred.status === "TK_Complete" ? null : parseDate(rel.row.aref), arls = parseDate(rel.row.arls);
  const lc = lagCalendar(model, rel);
  const span = (a, b) => (a === null || b === null ? null : b >= a ? lc.workBetween(a, b) : -lc.workBetween(b, a));
  let fromA = null, fromL = null;
  if (rel.type === "PR_FS") { fromA = span(pEF, aref); fromL = span(arls, sLS); }
  if (rel.type === "PR_SS") {
    fromA = span(pES, aref);
    if (arls !== null && sLS !== null && lc === pred.cal) fromL = span(arls, sLS) - (pred.status === "TK_Complete" ? 0 : pred.remain);
  }
  if (rel.type === "PR_SF") {
    fromA = aref === null || pES === null ? null : span(pES, succ.cal.addWork(aref, succ.remain));
    if (arls !== null && sLF !== null && lc === pred.cal) fromL = span(arls, sLF) - (pred.status === "TK_Complete" ? 0 : pred.remain);
  }
  if (rel.type === "PR_FF") { fromA = aref === null || pEF === null ? null : span(pEF, succ.cal.addWork(aref, succ.remain)); fromL = span(arls, sLF); }
  if (fromA === null && fromL === null) return;
  acc.checked++;
  const off = (v) => v !== null && Math.abs(v - u.eff) > TOL;
  let left = null;
  if (fromL !== null && fromA !== null && Math.abs(fromL - fromA) <= TOL) { if (off(fromL)) left = fromL; }
  else if (fromL !== null && off(fromL) && (fromA === null || off(fromA))) left = fromL;
  else if (fromL === null && off(fromA)) left = fromA;
  if (left === null) { acc.agree.add(rel.id); return; }
  const base = { rel, pred, succ, lag: rel.lag };
  // some of the old lag was still unspent: it reads back exactly
  // (with nothing spent, as from an unfinished FS predecessor, that is all of it)
  if (left > TOL || (u.spent <= TOL && left >= -TOL)) acc.was.push({ ...base, was: Math.round(u.spent + Math.max(0, left)) });
  // none left at that run, some left now: the old lag was at most what was spent
  else if (left >= -TOL && u.eff > TOL) acc.atMost.push({ ...base, atMost: Math.round(u.spent) });
  // a date before the lag could start reads as no rule here: neither listed nor agreeing
}
