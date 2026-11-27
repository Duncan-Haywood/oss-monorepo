// Texas' deadlines beside its two notices of claim (Tex. Prop. Code §§ 53.056, 53.057, 53.052 as
// amended by H.B. 2237): one notice per month of unpaid work, the retainage notice, and the lien
// affidavits. Pure date math from packages/lien-waivers/src/tx-dates.ts, run in the browser; nothing
// is saved. Dates move past a weekend (§ 53.003(e)) but not past a legal holiday, so a date shown can
// be a day early, never late.
import {
  txLienAffidavitDue,
  txMonthOf,
  txNoticeSchedule,
  txRetainageAffidavitDue,
  txRetainageNoticeDue,
} from "@lien-waivers/tx-dates";
import { useState } from "react";

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function monthName(m: string) {
  const [y, mo] = m.split("-").map(Number);
  return new Date(Date.UTC(y ?? 2000, (mo ?? 1) - 1, 1)).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function schedule(from: string, to: string, residential: boolean) {
  try {
    return { rows: txNoticeSchedule(from, to, residential), error: null };
  } catch (e) {
    return { rows: [], error: e instanceof Error ? e.message : String(e) };
  }
}

function retainageDates(ended: string) {
  try {
    return {
      notice: txRetainageNoticeDue(ended),
      affidavit: txRetainageAffidavitDue(txMonthOf(ended)),
    };
  } catch {
    return null;
  }
}

export function TxNoticeDates() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [residential, setResidential] = useState(false);
  const [ended, setEnded] = useState("");

  const last = MONTH.test(to) ? to : from;
  const months = MONTH.test(from) && MONTH.test(last) ? schedule(from, last, residential) : null;
  const affidavit = MONTH.test(last) ? txLienAffidavitDue(last, residential) : null;
  const retainage = DATE.test(ended) ? retainageDates(ended) : null;
  const retNotice = retainage?.notice;
  const retAffidavit = retainage?.affidavit;

  return (
    <div className="grid gap-3 border-t pt-3">
      <p className="font-medium">Texas deadlines</p>
      <p className="text-slate-600">
        For an owner's contract with the GC signed on or after 1 January 2022. Enter the months your
        work is still unpaid for: each needs its own notice of claim.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <label>
          <span className="block text-slate-600">First unpaid month</span>
          <input
            className="input w-44"
            type="month"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label>
          <span className="block text-slate-600">Last month of work</span>
          <input
            className="input w-44"
            type="month"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={residential}
            onChange={(e) => setResidential(e.target.checked)}
          />
          <span>Residential construction project (§ 53.001(10))</span>
        </label>
      </div>
      {months?.error && <p className="text-red-700">{months.error}</p>}
      {months && months.rows.length > 0 && (
        <ul className="grid gap-1">
          {months.rows.map((r) => (
            <li key={r.workMonth}>
              {monthName(r.workMonth)} work: send the notice by <strong>{r.due}</strong>
              {r.movedForWeekend ? ` (the 15th, ${r.statutory}, is a weekend)` : ""}.
            </li>
          ))}
        </ul>
      )}
      {affidavit && (
        <p>
          Lien affidavit, filed with the county clerk, by <strong>{affidavit.due}</strong> (the 15th
          day of the {residential ? "third" : "fourth"} month after your last month of work, §
          53.052).
        </p>
      )}
      <label>
        <span className="block text-slate-600">
          Day your contract was completed, terminated or abandoned (for retainage)
        </span>
        <input
          className="input w-44"
          type="date"
          value={ended}
          onChange={(e) => setEnded(e.target.value)}
        />
      </label>
      {retNotice && retAffidavit && (
        <p>
          Retainage notice by <strong>{retNotice.due}</strong> (30 days, § 53.057(a-1); sooner if
          the GC's contract with the owner was terminated or abandoned first). Retainage lien
          affidavit by <strong>{retAffidavit.due}</strong>, counted from the month the GC's contract
          was completed, terminated or abandoned (§ 53.052(d)): if that is later than yours, so is
          this date.
        </p>
      )}
      <p className="text-xs text-slate-500">
        Moved past a weekend (§ 53.003(e)), not past a legal holiday. Not legal advice.
      </p>
    </div>
  );
}
