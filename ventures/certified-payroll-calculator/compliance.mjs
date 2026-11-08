// Draft Statement of Compliance text to go with a weekly report from wh347.mjs. It is a paraphrase of the points the signer certifies on the back
// of DOL form WH-347 (payroll correct and complete; wages paid in full with only permitted deductions; apprentices registered; fringe paid to plans
// or in cash, with exceptions listed). It is not the official wording and not a signed statement: copy the signed version from DOL's form or your
// agency's. Pure functions, no network, no storage.

const usd = (x) => "$" + x.toFixed(2);

export function buildCompliance(report) {
  const h = report.header;
  const exceptions = [];
  for (const w of report.workers) {
    if (w.underpayment > 0.005) exceptions.push({ worker: w.name, classification: w.classification, text: `Paid ${usd(w.underpayment)} less than the wage determination requires for the week; it must be paid before this statement is signed.` });
  }
  const apprentices = report.workers.filter((w) => /apprentice|trainee/i.test(w.classification)).map((w) => w.name);
  const planWorkers = report.workers.filter((w) => w.planFringeDue > 0.005);
  const cashWorkers = report.workers.filter((w) => w.flags.some((f) => /Cash fringe counted/.test(f)) || (w.gross > 0 && w.planFringeDue < 0.005));
  const fringeMode = planWorkers.length && cashWorkers.length ? "both" : planWorkers.length ? "plan" : "cash";
  const lines = [
    `Draft statement of compliance, payroll ${h.payrollNo || "(number)"}, week ending ${h.weekEnding || "(date)"}.`,
    `Contractor: ${h.contractor || "(name)"}. Project: ${h.project || "(project and location)"}. Contract: ${h.contractNo || "(number)"}.`,
    "1. The payroll for this period is correct and complete, and the wage rates shown are not less than those in the applicable wage determination.",
    "2. Each worker was paid the full weekly wages earned, with no deductions other than those the Copeland Act regulations (29 CFR part 3) permit.",
    apprentices.length
      ? `3. Apprentices or trainees on this payroll (${apprentices.join(", ")}) are enrolled in a registered program and paid at the approved rate and ratio; keep the registration on file.`
      : "3. No apprentices or trainees appear on this payroll.",
    fringeMode === "plan" ? "4. Required fringe benefits were paid to approved plans, funds or programs."
      : fringeMode === "cash" ? "4. Required fringe benefits were paid to the workers in cash."
      : "4. Required fringe benefits were paid partly to approved plans and partly in cash, as the rows show.",
    exceptions.length ? "Exceptions: " + exceptions.map((e) => `${e.worker} (${e.classification || "no classification"}): ${e.text}`).join(" ") : "Exceptions: none found in the rates you entered.",
    "Signature, printed name and title of the person who certifies: ______________________  Date: __________",
    "Willful falsification is punishable under 18 U.S.C. 1001. This is a draft to check against the official form, not legal advice.",
  ];
  return { lines, exceptions, fringeMode, apprentices, readyToSign: exceptions.length === 0 && report.ready };
}
