// UK Self Assessment payments on account: what is due on 31 January and 31 July, why the first bill is ~150%, and what a reduction claim would defer.
// Pure functions, no I/O. Bad input is rejected with a message, never clamped.
// Written from memory WITHOUT network access in the building session. Modelled: each payment on account is 50% of the previous year's
// "relevant amount" (income tax + Class 4 NIC, less tax deducted at source); none are due if that amount is under GBP 1,000 or if more than 80%
// of the year's income tax and Class 4 NIC was collected at source. Due 31 January (in the tax year) and 31 July (after it); the balancing
// payment and the first payment on account for the next year fall on the same 31 January. Class 2/student loan/CGT are NOT part of the
// relevant amount and are only carried as an optional "other amounts due". Every result names its source to verify.

export const VERIFY = "GOV.UK 'Understand how to make payments on account' and 'Reduce your payments on account'; Taxes Management Act 1970 s59A";
export const MIN_RELEVANT = 1000;
export const SOURCE_SHARE = 0.8;
export const YEARS = { 2025: "2025/26", 2026: "2026/27" };

const money = (n) => (n < 0 ? "-" : "") + "GBP " + Number(Math.round(Math.abs(n) * 100) / 100).toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const r2 = (n) => Math.round(n * 100) / 100;

export function parse(input) {
  const i = input || {};
  const errors = [];
  const num = (key, label, optional) => {
    const v = i[key];
    if (v === undefined || v === null || v === "") { if (!optional) errors.push(`Enter ${label}.`); return optional === "blank" ? null : 0; }
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) { errors.push(`Enter ${label} as zero or more.`); return 0; }
    return n;
  };
  const totalTax = num("totalTax", "your income tax plus Class 4 NIC for the tax year");
  const atSource = num("atSource", "tax already deducted at source (zero if none)", true);
  const paid = num("paid", "payments on account already made for that year (zero if none)", true);
  const other = num("other", "other amounts due on 31 January (zero if none)", true);
  const estimate = num("estimate", "your expected income tax plus Class 4 NIC for the following year", "blank");
  const year = Number(i.year);
  if (!YEARS[year]) errors.push("Pick the tax year of the return you are filing.");
  return { errors, totalTax, atSource, paid, other, estimate, year };
}

export function compute(input) {
  const p = parse(input);
  if (p.errors.length) return { errors: p.errors };
  const { totalTax, atSource, paid, other, estimate, year } = p;
  const label = YEARS[year];
  const nextLabel = YEARS[year + 1] || `${year + 1}/${String((year + 2) % 100).padStart(2, "0")}`;
  const janDate = `${year + 2}-01-31`;
  const julDate = `${year + 2}-07-31`;
  const relevant = r2(Math.max(0, totalTax - atSource));
  const sourceShare = totalTax > 0 ? atSource / totalTax : 0;
  const findings = [];
  const obligations = [];

  let required = true, reason = null;
  if (relevant < MIN_RELEVANT) { required = false; reason = "small"; }
  else if (sourceShare > SOURCE_SHARE) { required = false; reason = "source"; }

  const each = required ? r2(relevant / 2) : 0;
  const balancing = r2(totalTax - atSource - paid);
  const janTotal = r2(balancing + other + each);
  const julTotal = each;
  const firstTime = required && paid === 0;

  if (!required) {
    findings.push({ severity: "info", title: reason === "small"
      ? `Your bill after tax deducted at source is ${money(relevant)}, under ${money(MIN_RELEVANT)}: no payments on account are due for ${nextLabel}.`
      : `${Math.round(sourceShare * 100)}% of your income tax and Class 4 NIC was collected at source, more than 80%: no payments on account are due for ${nextLabel}.` });
  } else {
    findings.push({ severity: "high", title: `For ${nextLabel} you pay two advance instalments of ${money(each)}: one on ${janDate} and one on ${julDate}. Each is half of last year's ${money(relevant)} bill.` });
  }
  if (balancing > 0) findings.push({ severity: "high", title: `Balancing payment for ${label}: ${money(balancing)}, due ${janDate} (the total tax bill less tax at source and less payments on account already made).` });
  else if (balancing < 0) findings.push({ severity: "info", title: `You overpaid ${label} by ${money(-balancing)}. HMRC can repay it or offset it against the next amount due; ask, or it is netted off in the figure below.` });
  if (required) findings.push({ severity: "medium", title: `Cash needed on ${janDate}: ${money(janTotal)}${other ? ` (including ${money(other)} of other amounts)` : ""}. On ${julDate}: ${money(julTotal)}. Together ${money(janTotal + julTotal)} over seven months.` });
  else findings.push({ severity: "medium", title: `Cash needed on ${janDate}: ${money(janTotal)}. Nothing further is due in July for ${nextLabel}.` });
  if (firstTime) findings.push({ severity: "medium", title: `This looks like your first year with payments on account: the ${janDate} bill is ${money(janTotal)}, about 150% of a normal year's, because it carries the balance for ${label} and the first advance instalment for ${nextLabel}. Payments on account are not extra tax; they are next year's tax paid early.` });

  let reduction = null;
  if (required && estimate !== null) {
    const reducedEach = r2(Math.min(each, estimate / 2));
    if (reducedEach < each) {
      const saving = r2((each - reducedEach) * 2);
      reduction = { estimate, reducedEach, savingNow: saving, balancingNextStandard: r2(estimate - 2 * each), balancingNextReduced: r2(estimate - 2 * reducedEach) };
      findings.push({ severity: "medium", title: `If you really expect ${money(estimate)} of income tax and Class 4 NIC for ${nextLabel}, you can claim to reduce each instalment to ${money(reducedEach)}, keeping ${money(saving)} in your pocket across the two dates. It is a timing change only: reduce too far and interest runs from the original due date on any shortfall.` });
    } else {
      findings.push({ severity: "info", title: `Your expected ${nextLabel} bill (${money(estimate)}) is not below last year's, so a reduction claim would not help.` });
    }
  }

  obligations.push(
    { ref: "Jan", title: `Pay by ${janDate}`, why: `Balancing payment for ${label}${required ? ` plus the first ${nextLabel} instalment` : ""}, together with the return filed by the same date.` },
    ...(required ? [{ ref: "Jul", title: `Pay by ${julDate}`, why: `Second ${nextLabel} instalment.` }] : []),
    ...(required ? [{ ref: "Reduce", title: "Reduce if income falls", why: "Claim online through your HMRC account or on form SA303 if you expect a lower bill. A wrong claim can cost interest and, if careless, a penalty." }] : []),
    { ref: "Late", title: "Late payments cost interest", why: "Interest runs from the due date, and further penalties apply if tax stays unpaid. Check current rates on GOV.UK." },
  );
  findings.push({ severity: "info", title: "Payments on account cover income tax and Class 4 NIC only. Capital gains tax, student loan repayments, the High Income Child Benefit Charge and Class 2 are not part of the relevant amount." });
  return { errors: [], label, nextLabel, totalTax, atSource, paid, other, relevant, required, reason, each, balancing, janTotal, julTotal, janDate, julDate, firstTime, reduction, findings, obligations, perMonth: required ? r2(relevant / 12) : 0 };
}

export const SAMPLE = { year: 2025, totalTax: 6400, atSource: 0, paid: 0, other: 0, estimate: 4000 };

export function summaryText(r) {
  const L = [`UK payments on account, return for ${r.label}`, "", `Income tax + Class 4 NIC: ${money(r.totalTax)}`, `Deducted at source: ${money(r.atSource)}`, `Payments on account already made: ${money(r.paid)}`, ""];
  L.push(r.required ? `Instalments for ${r.nextLabel}: ${money(r.each)} on ${r.janDate} and ${money(r.each)} on ${r.julDate}` : `No payments on account for ${r.nextLabel}.`);
  L.push(`Balancing payment for ${r.label}: ${money(r.balancing)}`, `Total due ${r.janDate}: ${money(r.janTotal)}`);
  if (r.required) L.push(`Total due ${r.julDate}: ${money(r.julTotal)}`, `Set aside about ${money(r.perMonth)} a month to be ready.`);
  L.push("", ...r.findings.map((f) => `- ${f.title}`), "", ...r.obligations.map((o) => `- ${o.title}: ${o.why}`), "", `Verify against: ${VERIFY}`, "Not tax advice. No warranty.");
  return L.join("\n");
}
