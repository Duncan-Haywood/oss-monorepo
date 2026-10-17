// Catalogue of the UK money tools in this repository and a deterministic
// matcher from "what applies to me" to "which tool answers it". No network.

export const SITUATIONS = [
  ["employed", "I'm an employee on PAYE"],
  ["scotland", "I live in Scotland"],
  ["studentloan", "I have a student loan"],
  ["over100k", "I earn over £100,000"],
  ["children", "I get Child Benefit"],
  ["married", "I'm married or in a civil partnership"],
  ["selfemployed", "I'm self-employed or a sole trader"],
  ["sidehustle", "I have side income or sell things"],
  ["company", "I run (or am thinking of) a limited company"],
  ["contractor", "I'm a contractor (IR35)"],
  ["construction", "I'm a subcontractor in construction (CIS)"],
  ["landlord", "I rent out property"],
  ["investor", "I have shares, funds or assets to sell"],
  ["buying", "I'm buying a home"],
  ["employer", "I employ people"],
  ["leave", "I'm off sick, on leave or being made redundant"],
  ["pension", "I pay a lot into a pension"],
  ["estate", "I'm planning an estate or dealing with one"],
  ["late", "I'm late with Self Assessment"],
];

// category, slug, short title, one-line job, situations it answers
export const TOOLS = [
  ["Pay and tax on a salary", "uk-take-home-pay-calculator", "UK take-home pay calculator", "Salary after income tax, National Insurance, pension and student loan, per year, month and week.", ["employed", "studentloan"]],
  ["Pay and tax on a salary", "uk-tax-code-checker", "UK tax code checker", "Decode a PAYE tax code (1257L, BR, 0T, K, emergency), check payslip tax against it and estimate an overpayment.", ["employed", "married", "scotland"]],
  ["Pay and tax on a salary", "uk-working-from-home-tax-relief-calculator", "UK working from home tax relief calculator", "Backdated homeworking relief: refund per tax year still open, claim deadlines and what has expired.", ["employed"]],
  ["Pay and tax on a salary", "uk-bonus-tax-calculator", "UK bonus tax calculator", "What you keep of a bonus after tax, NI, student loan and the Child Benefit charge, and what a pension contribution changes.", ["employed"]],
  ["Pay and tax on a salary", "uk-scottish-income-tax-calculator", "Scottish income tax calculator", "The same take-home calculation under the six Scottish bands, compared with the rest of the UK.", ["scotland", "employed"]],
  ["Pay and tax on a salary", "uk-salary-sacrifice-calculator", "UK salary sacrifice calculator", "The same pension contribution by salary sacrifice, net pay or relief at source: tax, NI, take-home cost and employer NI saving.", ["employed", "pension", "employer"]],
  ["Pay and tax on a salary", "uk-student-loan-repayment-calculator", "UK student loan repayment calculator", "Monthly deduction for Plans 1, 2, 4, 5 and Postgraduate Loan, payoff year or write-off, overpay test.", ["studentloan", "employed"]],
  ["Pay and tax on a salary", "uk-100k-tax-trap-calculator", "UK £100k tax trap calculator", "The 60% effective rate between £100,000 and £125,140 and the pension payment that avoids it.", ["over100k", "pension", "children"]],
  ["Pay and tax on a salary", "uk-child-benefit-charge-calculator", "UK Child Benefit charge calculator", "High Income Child Benefit Charge over £60,000 and whether to opt out or pay into a pension.", ["children", "over100k", "married"]],
  ["Pay and tax on a salary", "uk-marriage-allowance-calculator", "UK Marriage Allowance calculator", "Whether you qualify, the tax saved and the four-year backdate.", ["married"]],
  ["Pension", "uk-state-pension-ni-years-checker", "UK State Pension NI years checker", "State Pension age, projected qualifying years and whether buying voluntary National Insurance years pays back.", ["pension", "employed"]],
  ["Pension", "uk-pension-annual-allowance-calculator", "UK pension annual allowance calculator", "Tapered annual allowance, three-year carry forward and the money purchase allowance.", ["pension", "over100k"]],
  ["Self-employed and side income", "uk-self-assessment-tax-calculator", "UK Self Assessment tax calculator", "Combine PAYE pay, self-employed profit, rental, interest and dividends into one 2025/26 tax, Class 4 NIC and 31 January balance estimate.", ["selfemployed", "sidehustle", "landlord"]],
  ["Pension", "uk-pension-withdrawal-tax-calculator", "UK pension withdrawal tax calculator", "Tax-free share, tax owed and emergency tax refund on a pension withdrawal, and the saving from spreading it over tax years.", ["pension"]],
  ["Pay and tax on a salary", "uk-tax-free-childcare-calculator", "UK Tax-Free Childcare calculator", "Free childcare hours, Tax-Free Childcare top-up and the Universal Credit comparison.", ["children", "employed"]],
  ["Self-employed and side income", "uk-mileage-allowance-calculator", "UK mileage allowance calculator", "HMRC approved mileage for cars, motorcycles and bicycles, tax relief on what your employer under-pays, and simplified mileage against actual costs.", ["selfemployed", "employed"]],
  ["Self-employed and side income", "uk-simplified-expenses-calculator", "UK simplified expenses calculator", "HMRC 45p/25p mileage and use-of-home flat rates against actual costs, and the tax saved.", ["selfemployed", "sidehustle"]],
  ["Self-employed and side income", "uk-self-employed-tax-set-aside-calculator", "UK self-employed tax set-aside calculator", "Income tax, Class 4 NIC, student loan and payments on account from your income and expenses, and the share of every invoice to set aside.", ["selfemployed", "sidehustle"]],
  ["Self-employed and side income", "uk-late-payment-interest-calculator", "UK late payment interest calculator", "Statutory interest and fixed compensation on a late business invoice.", ["selfemployed"]],
  ["Self-employed and side income", "uk-directors-loan-s455-calculator", "UK director's loan s455 calculator", "Tax on an overdrawn director's loan account, when it is due, and whether a dividend or bonus clears it cheaper.", ["company"]],
  ["Pay and tax on a salary", "uk-savings-interest-tax-calculator", "UK savings interest tax calculator", "Tax on bank interest after the starting rate and Personal Savings Allowance, tax-free interest and the cash ISA saving.", ["employed", "pension"]],
  ["Self-employed and side income", "uk-vat-flat-rate-scheme-calculator", "UK VAT flat rate scheme calculator", "Whether the VAT flat rate scheme beats standard VAT accounting, including the limited cost trader rate.", ["selfemployed", "company"]],
  ["Self-employed and side income", "uk-capital-allowances-calculator", "UK capital allowances calculator", "Equipment spend: AIA, full expensing and writing-down allowances, and where to put the AIA first.", ["company"]],
  ["Pay and tax on a salary", "uk-emi-share-option-tax-calculator", "UK EMI share option tax calculator", "Tax on EMI options at exit: income tax on any discount, Capital Gains Tax with Business Asset Disposal Relief, and what you keep.", ["employed", "company"]],
  ["Pay and tax on a salary", "uk-gift-aid-higher-rate-relief-calculator", "UK Gift Aid higher rate relief calculator", "What a charity donation really costs after higher rate relief, the carry-back to last tax year, and the gift that wins back your personal allowance.", ["employed", "selfemployed"]],
  ["Pay and tax on a salary", "uk-lifetime-isa-vs-pension-calculator", "UK Lifetime ISA vs pension calculator", "Per £1 of take-home pay, which is worth more: a Lifetime ISA or a pension, at 60, for a first home or after an early withdrawal, and where employer match or retirement tax flips it.", ["employed", "selfemployed"]],
  ["Self-employed and side income", "uk-rd-tax-relief-calculator", "UK R&D tax relief calculator", "Merged-scheme credit or R&D-intensive loss-maker relief, the PAYE/NIC cap, and what a claims agency fee would take.", ["company"]],
  ["Self-employed and side income", "uk-trading-allowance-calculator", "UK trading allowance calculator", "Claim the £1,000 trading allowance or deduct real expenses: which leaves you with more.", ["sidehustle", "selfemployed"]],
  ["Self-employed and side income", "uk-mtd-income-tax-checker", "UK Making Tax Digital checker", "Whether Making Tax Digital for Income Tax applies to you and from when.", ["selfemployed", "landlord"]],
  ["Self-employed and side income", "uk-vat-registration-checker", "UK VAT registration checker", "The month your rolling 12-month turnover passed the VAT threshold and the registration deadline.", ["selfemployed", "company"]],
  ["Self-employed and side income", "uk-payments-on-account-calculator", "UK payments on account calculator", "Balancing payment and two instalments due 31 January and 31 July, and the reduction claim.", ["selfemployed", "landlord"]],
  ["Self-employed and side income", "uk-self-assessment-late-penalty-calculator", "UK Self Assessment late penalty calculator", "Late filing and payment penalties plus interest, and what each extra month costs.", ["late", "selfemployed"]],
  ["Self-employed and side income", "uk-cis-deduction-refund-calculator", "UK CIS deduction and refund calculator", "The 20% or 30% Construction Industry Scheme deduction and your Self Assessment refund.", ["construction", "selfemployed"]],
  ["Company and contracting", "uk-sole-trader-vs-limited-company-calculator", "UK sole trader vs limited company calculator", "What you keep from the same profit as a sole trader or through a company.", ["company", "selfemployed"]],
  ["Company and contracting", "uk-umbrella-company-take-home-calculator", "UK umbrella company take-home calculator", "Agency day rate to take-home through an umbrella: margin, employer NI, tax and the day rate for a target.", ["contractor"]],
  ["Company and contracting", "uk-ir35-inside-outside-calculator", "UK IR35 inside vs outside calculator", "Take-home outside IR35 (own company) against inside IR35 (umbrella) and the break-even day rate.", ["contractor", "company"]],
  ["Company and contracting", "uk-dividend-tax-calculator", "UK dividend tax calculator", "Dividend tax by band for 2025/26 and 2026/27, the allowance and the cost of the next pound.", ["company", "investor"]],
  ["Property and investments", "uk-rent-a-room-relief-calculator", "UK Rent a Room Relief calculator", "Is rent from a lodger tax-free under the £7,500 limit, and above it, does the relief or claiming expenses cost less tax.", ["landlord", "sidehustle"]],
  ["Property and investments", "uk-landlord-section-24-calculator", "UK landlord Section 24 calculator", "Tax with the 20% mortgage interest credit against the old rules.", ["landlord"]],
  ["Property and investments", "uk-eis-seis-relief-calculator", "UK EIS and SEIS tax relief calculator", "Income tax relief you can use, CGT deferral, and your real loss after loss relief if the company fails.", ["investor"]],
  ["Property and investments", "uk-capital-gains-tax-calculator", "UK Capital Gains Tax calculator", "CGT for 2025/26 at 18% and 24% with the annual exempt amount, costs and losses.", ["investor", "landlord"]],
  ["Property and investments", "uk-stamp-duty-calculator", "UK Stamp Duty calculator", "SDLT in England and Northern Ireland band by band, with first-time buyer and additional-home rates.", ["buying"]],
  ["Property and investments", "uk-mortgage-overpayment-calculator", "UK mortgage overpayment calculator", "Interest saved and years cut by overpaying a repayment mortgage, overpaying versus saving, and the 10% early repayment charge allowance.", ["buying", "landlord"]],
  ["Property and investments", "uk-inheritance-tax-calculator", "UK Inheritance Tax calculator", "IHT on an estate for deaths from April 2025, with the home allowance and gifts.", ["estate"]],
  ["Pay and tax on a salary", "uk-company-car-tax-calculator", "UK company car tax calculator", "Benefit in kind on a company car for 2026/27, monthly income tax, employer Class 1A, fuel charge and the electric car schedule to 2029/30.", ["employed", "employer"]],
  ["Employing people", "uk-employer-hiring-cost-calculator", "UK employer hiring cost calculator", "True first-year cost of a hire with employer National Insurance and pension.", ["employer"]],
  ["Employing people", "uk-statutory-sick-pay-calculator", "UK Statutory Sick Pay calculator", "SSP weekly and daily rate, waiting days and the 28-week limit.", ["employer", "leave"]],
  ["Employing people", "uk-statutory-maternity-pay-calculator", "UK Statutory Maternity Pay calculator", "SMP eligibility and the 39-week schedule, plus paternity pay.", ["employer", "leave"]],
  ["Employing people", "uk-shared-parental-pay-planner", "UK Shared Parental Pay planner", "Split the 39 weeks of statutory pay between two parents and compare household totals.", ["employer", "leave"]],
  ["Employing people", "uk-minimum-wage-checker", "UK minimum wage checker", "Effective hourly rate against the National Living Wage and NMW, shortfall, arrears and HMRC penalty exposure.", ["employer", "employed"]],
  ["Employing people", "uk-holiday-pay-calculator", "UK holiday pay calculator", "Statutory holiday for part-year and irregular-hours workers and the value of unpaid leave.", ["employer", "leave", "employed"]],
  ["Employing people", "uk-redundancy-pay-calculator", "UK redundancy pay calculator", "Statutory redundancy pay, notice and whether an offer beats the statutory minimum.", ["leave", "employer", "employed"]],
  ["Employing people", "uk-unfair-dismissal-compensation-calculator", "UK unfair dismissal compensation calculator", "Estimate the basic and compensatory award for an unfair dismissal claim, the cap, and the three-months-less-a-day deadline.", ["leave", "employed"]],
];

export const SAMPLE = { picked: ["selfemployed", "landlord"] };

export function match(picked) {
  const set = new Set(picked || []);
  const out = [];
  for (const [category, slug, title, job, tags] of TOOLS) {
    const hits = tags.filter((t) => set.has(t));
    if (hits.length) out.push({ category, slug, title, job, hits, score: hits.length });
  }
  out.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
  return out;
}

export function categories() {
  const seen = [];
  for (const t of TOOLS) if (!seen.includes(t[0])) seen.push(t[0]);
  return seen.map((c) => ({ name: c, tools: TOOLS.filter((t) => t[0] === c) }));
}

export function summaryText(rows) {
  if (!rows.length) return "No tools matched. Tick at least one situation.";
  return rows.map((r, i) => `${i + 1}. ${r.title} - ${r.job}\n   ../${r.slug}/`).join("\n");
}
