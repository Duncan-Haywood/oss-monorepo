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
const currencySelect = document.getElementById("currency");

const currencyOptions = {
  USD: { currency: "USD", symbol: "$" },
  EUR: { currency: "EUR", symbol: "€" },
  GBP: { currency: "GBP", symbol: "£" },
  CAD: { currency: "CAD", symbol: "CA$" },
  AUD: { currency: "AUD", symbol: "A$" },
};

function fmtMoney(n, currency = currencySelect.value) {
  const selected = currencyOptions[currency] ?? currencyOptions.USD;
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: selected.currency,
    maximumFractionDigits: 2,
  }).format(n);
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
  document.getElementById("out-recovery-rate").textContent = `${result.recoveryRatePct.toFixed(1)}%`;
  document.getElementById("out-break-even-collections").textContent = result.collectionsToBreakEven === null
    ? "Not possible at $0"
    : result.collectionsToBreakEven.toLocaleString();
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

/**
 * Recompute and repaint from the form's current values.
 *
 * Pure rendering — it records no usage. Counting lives in `countCalculation`
 * below, so that running this on load and on every keystroke cannot inflate the
 * usage log into a measure of typing rather than of calculations.
 *
 * Returns true when the inputs parsed, which is what tells the callers whether
 * there is a real result on screen worth counting.
 */
function render() {
  const raw = Object.fromEntries(new FormData(form).entries());
  const parsed = parseInputs(raw);

  if (!parsed.ok) {
    renderErrors(parsed.errors);
    resultsEl.hidden = true;
    policySection.hidden = true;
    // Hide the comparison too: a stale table next to fresh errors reads as if
    // the old numbers still apply to the edited inputs. This is #1022's fix;
    // a later merge on `main` dropped the line, so this restores it.
    scenarioSection.hidden = true;
    return false;
  }

  renderErrors([]);
  const result = computeAll(parsed.values);
  renderResults(result);
  renderScenarios(parsed.values);

  policyEl.value = generatePolicyText({
    businessName: String(raw.businessName ?? ""),
    serviceName: String(raw.serviceName ?? ""),
    noticeHours: parsed.values.noticeHours,
    feePercent: parsed.values.feePercent,
    feeAmount: result.feeAmount,
    currencySymbol: (currencyOptions[currencySelect.value] ?? currencyOptions.USD).symbol,
  });
  policySection.hidden = false;
  return true;
}

/** Count one calculation, but only when the screen actually shows one. */
function countCalculation() {
  if (!render()) return;
  recordEvent("calculation_run");
  recordEvent("fee_scenarios_viewed");
  renderUsageSummary();
}

// The Calculate button still works and still counts, for anyone who reaches for
// it or submits with the keyboard. With live recalculation below it is now a
// confirmation rather than the only way to see a number.
form.addEventListener("submit", (event) => {
  event.preventDefault();
  countCalculation();
});

// Repaint as the visitor types. `input` fires per keystroke, which is right for
// rendering and wrong for counting -- hence the split above.
form.addEventListener("input", () => { render(); });

// `change` fires once a field is settled (blur, or a committed spinner/step),
// so it is the honest place to count a calculation the visitor actually asked
// for. The two text fields only feed the policy wording, so editing them is not
// a new calculation.
form.addEventListener("change", (event) => {
  if (event.target instanceof HTMLInputElement && event.target.type === "text") {
    render();
    return;
  }
  if (event.target === optOutCheckbox) return;
  countCalculation();
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
const openedFromShareLink = Object.keys(sharedValues).length > 0;
if (openedFromShareLink) {
  for (const [key, value] of Object.entries(sharedValues)) {
    const input = form.elements.namedItem(key);
    if (input && "value" in input) input.value = value;
  }
}

// Show a worked result immediately, from the shipped defaults or from a share
// link's values. Before this the page opened with the results panel hidden, so
// a first-time visitor saw a form and had to guess that pressing Calculate
// would do something -- on a page whose entire promise is a specific number.
// Every other calculator in this portfolio computes on load; this one now does
// too.
if (openedFromShareLink) {
  // Opening someone's shared numbers is a calculation the visitor asked for, so
  // it counts exactly as it did when this path called requestSubmit().
  countCalculation();
  recordEvent("shared_calculation_opened");
  renderUsageSummary();
} else {
  // The default render is not counted: nobody asked for it, and counting it
  // would make `calculation_run` a synonym for `page_view`.
  render();
}
