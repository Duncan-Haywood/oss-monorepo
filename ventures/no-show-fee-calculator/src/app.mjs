import {
  parseInputs,
  computeAll,
  compareFeeScenarios,
  compareCollectionPolicies,
  compareNoticeWindows,
  noticeWindowSummary,
  compareOverbooking,
  generatePolicyText,
  generateDepositPolicyText,
  buildShareUrl,
  readShareValues,
} from "./calc.mjs";
import { recordEvent, isOptedOut, setOptedOut, getUsageSummary, clearUsageLog } from "./usage.mjs";

const form = document.getElementById("calc-form");
const errorsEl = document.getElementById("errors");
const resultsEl = document.getElementById("results");
const policyEl = document.getElementById("policy-text");
const policySection = document.getElementById("policy-section");
const copyBtn = document.getElementById("copy-policy");
const downloadBtn = document.getElementById("download-policy");
const shareBtn = document.getElementById("share-link");
const copyStatus = document.getElementById("copy-status");
const optOutCheckbox = document.getElementById("usage-opt-out");
const usageSummaryEl = document.getElementById("usage-summary");
const clearUsageBtn = document.getElementById("clear-usage");
const scenarioSection = document.getElementById("scenario-section");
const scenarioBody = document.getElementById("scenario-body");
const collectionSection = document.getElementById("collection-section");
const collectionBody = document.getElementById("collection-body");
const collectionNote = document.getElementById("collection-note");
const depositPolicyEl = document.getElementById("deposit-policy-text");
const copyDepositBtn = document.getElementById("copy-deposit-policy");
const noticeSection = document.getElementById("notice-section");
const noticeBody = document.getElementById("notice-body");
const noticeSummaryEl = document.getElementById("notice-summary");
const overbookSection = document.getElementById("overbook-section");
const overbookBody = document.getElementById("overbook-body");
const overbookSummary = document.getElementById("overbook-summary");
const currencySelect = document.getElementById("currency");
const resetDraftBtn = document.getElementById("reset-draft");

const DRAFT_STORAGE_KEY = "no-show-fee-calculator:draft:v1";
const DRAFT_FIELDS = [
  "currency", "price", "bookingsPerWeek", "noShowRatePct", "noticeHours",
  "feePercent", "enforcementRatePct", "depositPercent", "overflowCost",
  "fillSameDayPct", "fillDayAheadPct", "fillTwoDayPct",
  "businessName", "serviceName",
];

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

function renderCollectionPolicies(values, raw) {
  const comparison = compareCollectionPolicies(values);
  collectionBody.replaceChildren();
  for (const policy of comparison.policies) {
    const row = document.createElement("tr");
    const selected = policy.id === comparison.recommendedId;
    if (selected) row.className = "selected-scenario";
    row.appendChild(Object.assign(document.createElement("th"), {
      scope: "row",
      textContent: `${policy.label}${selected ? " (recovers more)" : ""}`,
    }));
    row.insertCell().textContent = fmtMoney(policy.recoveredPerNoShow);
    row.insertCell().textContent = fmtMoney(policy.annualRecovered);
    row.insertCell().textContent = fmtMoney(policy.annualStillLost);
    collectionBody.appendChild(row);
  }

  const winner = comparison.policies.find((policy) => policy.id === comparison.recommendedId);
  const advantage = comparison.annualAdvantage;
  if (winner && advantage > 0) {
    collectionNote.textContent = `On these numbers, ${winner.label.toLowerCase()} recovers ${fmtMoney(advantage)} more per year than the next-best option. The deposit rows treat the deposit as already collected at booking; the after-the-fact row uses your assumed enforcement rate. This is a model, not legal advice.`;
  } else if (winner) {
    collectionNote.textContent = "On these numbers the policies recover the same modeled cash. Prefer the deposit if you want the money in hand before the slot, or the after-the-fact fee if you do not want to collect anything at booking. This is a model, not legal advice.";
  }

  depositPolicyEl.value = generateDepositPolicyText({
    businessName: String(raw.businessName ?? ""),
    serviceName: String(raw.serviceName ?? ""),
    noticeHours: values.noticeHours,
    depositPercent: values.depositPercent,
    depositAmount: comparison.depositAmount,
    remainderAmount: comparison.remainderAmount,
    currencySymbol: (currencyOptions[currencySelect.value] ?? currencyOptions.USD).symbol,
  });
  collectionSection.hidden = false;
}

function renderNoticeWindows(values) {
  noticeBody.replaceChildren();
  const rows = compareNoticeWindows(values);
  for (const row of rows) {
    const tr = document.createElement("tr");
    if (row.selected) tr.className = "selected-scenario";
    const label = row.selected
      ? `${row.label} (your policy)`
      : row.nearest
        ? `${row.label} (closest to your policy)`
        : row.label;
    tr.appendChild(Object.assign(document.createElement("th"), { scope: "row", textContent: label }));
    tr.insertCell().textContent = `${row.fillPct}%`;
    tr.insertCell().textContent = row.slotsFilled.toFixed(1);
    tr.insertCell().textContent = fmtMoney(row.recoveredByRefill);
    tr.insertCell().textContent = fmtMoney(row.leftoverLost);
    tr.insertCell().textContent = fmtMoney(row.extraVsSameDay);
    noticeBody.appendChild(tr);
  }
  noticeSummaryEl.textContent = noticeWindowSummary(rows);
  noticeSection.hidden = false;
}

function overbookCells(row, outcome, winnerId, fmt) {
  const tr = document.createElement("tr");
  if (row.id === winnerId) tr.className = "selected-scenario";
  tr.appendChild(Object.assign(document.createElement("th"), { scope: "row", textContent: row.label }));
  tr.insertCell().textContent = outcome.extraBookingsPerWeek.toFixed(1);
  tr.insertCell().textContent = outcome.served.toFixed(1);
  tr.insertCell().textContent = outcome.overflow.toFixed(2);
  tr.insertCell().textContent = fmt(outcome.serviceRevenue);
  tr.insertCell().textContent = fmt(outcome.feeRevenue);
  tr.insertCell().textContent = fmt(outcome.overflowCostAnnual);
  tr.insertCell().textContent = fmt(outcome.netKept);
  return tr;
}

function renderOverbooking(values) {
  const comparison = compareOverbooking(values);
  overbookSummary.textContent = comparison.summary;
  overbookBody.replaceChildren();
  for (const row of comparison.rows) {
    overbookBody.appendChild(overbookCells(row, row.withFee, comparison.winner, fmtMoney));
  }
  overbookBody.appendChild(
    overbookCells(
      { id: "overbook_drop_fee", label: "Overbook to match, drop the fee" },
      comparison.matchNoFee,
      comparison.winner,
      fmtMoney,
    ),
  );
  overbookSection.hidden = false;
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

function readDraft() {
  try {
    const parsed = JSON.parse(localStorage.getItem(DRAFT_STORAGE_KEY) ?? "null");
    if (!parsed || typeof parsed !== "object") return {};
    return Object.fromEntries(
      DRAFT_FIELDS
        .filter((field) => typeof parsed[field] === "string")
        .map((field) => [field, parsed[field]]),
    );
  } catch {
    return {};
  }
}

function saveDraft() {
  try {
    const raw = Object.fromEntries(new FormData(form).entries());
    localStorage.setItem(
      DRAFT_STORAGE_KEY,
      JSON.stringify(Object.fromEntries(DRAFT_FIELDS.map((field) => [field, String(raw[field] ?? "")]))),
    );
  } catch {
    // Draft restoration is best-effort and must never block calculations.
  }
}

function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_STORAGE_KEY);
  } catch {
    // Storage may be disabled; the visible form still resets below.
  }
}

function applyValues(values) {
  for (const [key, value] of Object.entries(values)) {
    const input = form.elements.namedItem(key);
    if (input && "value" in input) input.value = value;
  }
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
    collectionSection.hidden = true;
    noticeSection.hidden = true;
    overbookSection.hidden = true;
    return false;
  }

  renderErrors([]);
  const result = computeAll(parsed.values);
  renderResults(result);
  renderScenarios(parsed.values);
  renderCollectionPolicies(parsed.values, raw);
  renderNoticeWindows(parsed.values);
  renderOverbooking(parsed.values);

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
  recordEvent("collection_policies_viewed");
  recordEvent("notice_windows_compared");
  recordEvent("overbooking_compared");
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
form.addEventListener("input", () => {
  saveDraft();
  render();
});

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

copyDepositBtn.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(depositPolicyEl.value);
    copyStatus.textContent = "Deposit policy copied.";
    recordEvent("deposit_policy_copied");
    renderUsageSummary();
  } catch {
    depositPolicyEl.select();
    copyStatus.textContent = "Press Ctrl/Cmd+C to copy (clipboard access was blocked).";
  }
  setTimeout(() => {
    copyStatus.textContent = "";
  }, 4000);
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

downloadBtn.addEventListener("click", () => {
  const businessName = String(new FormData(form).get("businessName") ?? "").trim();
  const safeName = (businessName || "cancellation-policy")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50) || "cancellation-policy";
  const blob = new Blob([policyEl.value], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${safeName}-policy.txt`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
  copyStatus.textContent = "Policy downloaded.";
  recordEvent("policy_downloaded");
  renderUsageSummary();
  setTimeout(() => { copyStatus.textContent = ""; }, 4000);
});

optOutCheckbox.addEventListener("change", () => {
  setOptedOut(optOutCheckbox.checked);
  renderUsageSummary();
});

resetDraftBtn.addEventListener("click", () => {
  clearDraft();
  form.reset();
  render();
  recordEvent("draft_reset");
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
const savedDraft = openedFromShareLink ? {} : readDraft();
applyValues(openedFromShareLink ? sharedValues : savedDraft);
if (Object.keys(savedDraft).length > 0) {
  recordEvent("draft_restored");
  renderUsageSummary();
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
