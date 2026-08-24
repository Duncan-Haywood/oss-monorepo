import { parseInputs, computeAll, compareFeeScenarios, generatePolicyText, buildShareUrl, readShareValues } from "./calc.mjs";
import { recordEvent, isOptedOut, setOptedOut, getUsageSummary, clearUsageLog } from "./usage.mjs";

const form = document.getElementById("calc-form");
const errorsEl = document.getElementById("errors");
const resultsEl = document.getElementById("results");
const policyEl = document.getElementById("policy-text");
const policySection = document.getElementById("policy-section");
const copyBtn = document.getElementById("copy-policy");
const shareBtn = document.getElementById("share-link");
const copyStatus = document.getElementById("copy-status");
const optOutCheckbox = document.getElementById("usage-opt-out");
const usageSummaryEl = document.getElementById("usage-summary");
const clearUsageBtn = document.getElementById("clear-usage");
const scenarioSection = document.getElementById("scenario-section");
const scenarioBody = document.getElementById("scenario-body");

const currencyFormatter = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

function fmtMoney(n) {
  return currencyFormatter.format(n);
}

function renderErrors(errors) {
  errorsEl.innerHTML = "";
  if (!errors || errors.length === 0) {
    errorsEl.hidden = true;
    return;
  }
  errorsEl.hidden = false;
  const list = document.createElement("ul");
  for (const e of errors) {
    const li = document.createElement("li");
    li.textContent = e;
    list.appendChild(li);
  }
  errorsEl.appendChild(list);
}

function renderResults(result) {
  resultsEl.hidden = false;
  document.getElementById("out-fee-amount").textContent = fmtMoney(result.feeAmount);
  document.getElementById("out-noshows-year").textContent = result.noShowsPerYear.toFixed(1);
  document.getElementById("out-annual-lost").textContent = fmtMoney(result.annualLostRevenue);
  document.getElementById("out-annual-fee-revenue").textContent = fmtMoney(result.annualFeeRevenue);
}

function renderScenarios(values) {
  scenarioBody.replaceChildren();
  for (const scenario of compareFeeScenarios(values)) {
    const row = document.createElement("tr");
    const selected = scenario.feePercent === values.feePercent;
    if (selected) row.className = "selected-scenario";
    row.appendChild(Object.assign(document.createElement("th"), { scope: "row", textContent: `${scenario.feePercent}%${selected ? " (selected)" : ""}` }));
    row.insertCell().textContent = fmtMoney(scenario.feeAmount);
    row.insertCell().textContent = fmtMoney(scenario.annualFeeRevenue);
    scenarioBody.appendChild(row);
  }
  scenarioSection.hidden = false;
}

function renderUsageSummary() {
  const { total, byEvent } = getUsageSummary();
  if (total === 0) {
    usageSummaryEl.textContent = "No local usage recorded yet.";
    return;
  }
  const parts = Object.entries(byEvent)
    .map(([name, count]) => `${name}: ${count}`)
    .join(", ");
  usageSummaryEl.textContent = `${total} events recorded in this browser — ${parts}`;
}

function syncOptOutUI() {
  optOutCheckbox.checked = isOptedOut();
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const formData = new FormData(form);
  const raw = Object.fromEntries(formData.entries());
  const parsed = parseInputs(raw);

  if (!parsed.ok) {
    renderErrors(parsed.errors);
    resultsEl.hidden = true;
    policySection.hidden = true;
    return;
  }

  renderErrors([]);
  const result = computeAll(parsed.values);
  renderResults(result);
  renderScenarios(parsed.values);

  const policyText = generatePolicyText({
    businessName: String(raw.businessName ?? ""),
    serviceName: String(raw.serviceName ?? ""),
    noticeHours: parsed.values.noticeHours,
    feePercent: parsed.values.feePercent,
    feeAmount: result.feeAmount,
  });
  policyEl.value = policyText;
  policySection.hidden = false;

  recordEvent("calculation_run");
  recordEvent("fee_scenarios_viewed");
  renderUsageSummary();
});

shareBtn.addEventListener("click", async () => {
  const raw = Object.fromEntries(new FormData(form).entries());
  const parsed = parseInputs(raw);
  if (!parsed.ok) {
    renderErrors(parsed.errors);
    copyStatus.textContent = "Fix the numbers before creating a share link.";
    return;
  }
  const shareUrl = buildShareUrl(raw, window.location.href.split("?")[0]);
  try {
    await navigator.clipboard.writeText(shareUrl);
    copyStatus.textContent = "Share link copied. Anyone with it can see the values in the link.";
    recordEvent("share_link_copied");
    renderUsageSummary();
  } catch {
    window.prompt("Copy this share link:", shareUrl);
  }
  setTimeout(() => { copyStatus.textContent = ""; }, 5000);
});

copyBtn.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(policyEl.value);
    copyStatus.textContent = "Copied.";
    recordEvent("policy_copied");
    renderUsageSummary();
  } catch {
    policyEl.select();
    copyStatus.textContent = "Press Ctrl/Cmd+C to copy (clipboard access was blocked).";
  }
  setTimeout(() => {
    copyStatus.textContent = "";
  }, 4000);
});

optOutCheckbox.addEventListener("change", () => {
  setOptedOut(optOutCheckbox.checked);
  renderUsageSummary();
});

clearUsageBtn.addEventListener("click", () => {
  clearUsageLog();
  renderUsageSummary();
});

syncOptOutUI();
renderUsageSummary();

const sharedValues = readShareValues(window.location.href);
if (Object.keys(sharedValues).length > 0) {
  for (const [key, value] of Object.entries(sharedValues)) {
    const input = form.elements.namedItem(key);
    if (input && "value" in input) input.value = value;
  }
  form.requestSubmit();
  recordEvent("shared_calculation_opened");
  renderUsageSummary();
}
