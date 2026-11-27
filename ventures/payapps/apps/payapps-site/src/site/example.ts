// The home page's worked example: a made-up electrical job's second pay application, computed at
// build time by the app's own pay-app math (apps/payapps/src/shared/payapp-math.ts), so the panel
// can never show figures the product would not produce. Pure; no I/O.
//
// The job, the names and the amounts are invented and the panel says so. Nothing here is a customer.
import { formatCents } from "../../../payapps/src/shared/money";
import {
  type ComputedApplication,
  computeApplications,
  type PeriodInput,
  type SovLineInput,
} from "../../../payapps/src/shared/payapp-math";
import { type Html, html } from "./html";

const RETAINAGE_BPS = 1000; // 10%

const LINES: SovLineInput[] = [
  {
    id: "l1",
    itemNumber: "1",
    description: "Rough-in, floors 1–2",
    originalCents: 8_400_000,
    sortOrder: 1,
  },
  {
    id: "l2",
    itemNumber: "2",
    description: "Switchgear and panels",
    originalCents: 6_200_000,
    sortOrder: 2,
  },
  {
    id: "l3",
    itemNumber: "3",
    description: "Lighting fixtures",
    originalCents: 4_100_000,
    sortOrder: 3,
  },
  {
    id: "l4",
    itemNumber: "4",
    description: "Trim, test and close-out",
    originalCents: 2_300_000,
    sortOrder: 4,
  },
];

const PERIODS: PeriodInput[] = [
  {
    id: "p1",
    number: 1,
    periodTo: "2026-09-30",
    retainagePctBps: RETAINAGE_BPS,
    storedRetainagePctBps: RETAINAGE_BPS,
    lines: {
      l1: { workThisPeriodCents: 3_360_000, storedMaterialsCents: 0, retainageReleasedCents: 0 },
      l2: { workThisPeriodCents: 0, storedMaterialsCents: 2_480_000, retainageReleasedCents: 0 },
    },
  },
  {
    id: "p2",
    number: 2,
    periodTo: "2026-10-31",
    retainagePctBps: RETAINAGE_BPS,
    storedRetainagePctBps: RETAINAGE_BPS,
    lines: {
      l1: { workThisPeriodCents: 2_520_000, storedMaterialsCents: 0, retainageReleasedCents: 0 },
      l2: { workThisPeriodCents: 3_100_000, storedMaterialsCents: 0, retainageReleasedCents: 0 },
      l3: { workThisPeriodCents: 0, storedMaterialsCents: 1_230_000, retainageReleasedCents: 0 },
    },
  },
];

/** Application #2 of the example job, exactly as the app computes it. */
export function exampleApplication(): ComputedApplication {
  const apps = computeApplications(
    { originalContractSumCents: LINES.reduce((s, l) => s + l.originalCents, 0) },
    LINES,
    [],
    PERIODS,
  );
  const second = apps[1];
  if (!second) throw new Error("example job: expected two applications");
  if (second.warnings.length > 0) {
    throw new Error(`example job has warnings: ${second.warnings.map((w) => w.code).join(", ")}`);
  }
  return second;
}

const pct = (bps: number | null): string => (bps === null ? "–" : `${Math.round(bps / 100)}%`);

/** The hero's side panel: a mini continuation sheet and the summary lines that matter on billing day. */
export function examplePanel(): Html {
  const app = exampleApplication();
  const s = app.summary;
  const rows = app.lines.map(
    (l) => html`<tr>
          <th scope="row"><span class="ex-item">${l.itemNumber}</span> ${l.description}</th>
          <td>${formatCents(l.scheduledValueCents)}</td>
          <td><span class="ex-bar" aria-hidden="true"><span class="ex-fill ex-fill-${barStep(l.percentCompleteBps)}"></span></span>${pct(l.percentCompleteBps)}</td>
        </tr>`,
  );
  return html`<figure class="example" aria-labelledby="example-cap">
    <figcaption id="example-cap"><span class="ex-tag">Worked example</span> Application #2, period to Oct 31 · a made-up electrical job</figcaption>
    <table class="ex-sheet">
      <thead><tr><th scope="col">Line</th><th scope="col">Scheduled</th><th scope="col">Complete</th></tr></thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
    <dl class="ex-summary">
      <div><dt>Completed and stored to date</dt><dd>${formatCents(s.totalCompletedAndStoredCents)}</dd></div>
      <div><dt>Retainage held (10%)</dt><dd>−${formatCents(s.totalRetainageCents)}</dd></div>
      <div><dt>Less previous certificates</dt><dd>−${formatCents(s.lessPreviousCertificatesCents)}</dd></div>
      <div class="ex-due"><dt>Current payment due</dt><dd>${formatCents(s.currentPaymentDueCents)}</dd></div>
    </dl>
    <p class="ex-note">Figures computed by the same pay-app math the app runs. Line 3's fixtures are stored on site, not yet installed: they count toward the total and carry retainage.</p>
  </figure>`;
}

/** Percent complete rounded to the nearest 10, for a width class (inline styles are blocked by CSP). */
function barStep(bps: number | null): number {
  if (bps === null) return 0;
  return Math.max(0, Math.min(10, Math.round(bps / 1000)));
}
