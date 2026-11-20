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
//   finished: FS and FF links from a finished predecessor into an unstarted
//            activity: { checked, agree: Set of link ids whose arls says P6
//            used the current lag, was: [{ rel, pred, succ, lag, was }] }.
//            There arls is the successor's late date less only the part of
//            the lag still unspent at the data date (cpm.mjs rule 17; 444 of
//            444 such links on CCA), so it names the lag while some is unspent.
//   added:   links with neither date in a file whose other links have them,
//            between two activities that have stored dates (P6 fills both
//            on every link it schedules, so the link came after the run)

import { lagCalendar } from "./cpm.mjs";
import { parseDate } from "./xer.mjs";

const TOL = 1; // minutes

export function relationshipLags(model) {
  const out = { checked: 0, links: [], added: [], finished: { checked: 0, agree: new Set(), was: [] } };
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
    if (pred.status === "TK_Complete" && succ.status === "TK_NotStart") { finishedLink(model, rel, pred, succ, out.finished); continue; }
    if (pred.status !== "TK_NotStart" || succ.status !== "TK_NotStart") continue;
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
// where that date is empty or not decoded), or null for an SF link.
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
    default:
    return null; // SF: one link in seven files, not decoded
  }
  return { fromA, fromL };
}

// A finished predecessor's FS or FF link: arls = the successor's late start
// (FS) or finish (FF) less max(0, lag - the lag calendar's working time from
// the actual finish to the data date).
function finishedLink(model, rel, pred, succ, acc) {
  if (rel.type !== "PR_FS" && rel.type !== "PR_FF") return;
  const arls = parseDate(rel.row.arls), af = pred.actEnd;
  const sL = parseDate(rel.type === "PR_FS" ? succ.row.late_start_date : succ.row.late_end_date);
  const dd = model.projects.get(succ.proj)?.dataDate;
  if (arls === null || sL === null || af === null || af === undefined || dd === null || dd === undefined) return;
  const lc = lagCalendar(model, rel);
  const spent = af < dd ? lc.workBetween(af, dd) : 0;
  const left = sL >= arls ? lc.workBetween(arls, sL) : -lc.workBetween(sL, arls);
  acc.checked++;
  const nowLeft = Math.max(0, rel.lag - spent);
  if (Math.abs(left - nowLeft) <= TOL) { acc.agree.add(rel.id); return; }
  // with nothing left the old lag is only known to be at most what was spent
  if (left > TOL) acc.was.push({ rel, pred, succ, lag: rel.lag, was: Math.round(spent + left) });
}
