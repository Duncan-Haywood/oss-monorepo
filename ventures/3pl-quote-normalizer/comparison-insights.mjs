import { normalizeComparison, savingsPercent } from "./compare.mjs";
import { record } from "./usage.mjs";

const form = document.querySelector("#compare");
const result = document.querySelector("#result");
if (form && result) {
  const names = document.createElement("fieldset");
  names.innerHTML = `<legend>Provider names (optional)</legend>
    <label>Quote A<input name="firstName" type="text" maxlength="80" placeholder="Quote A"></label>
    <label>Quote B<input name="secondName" type="text" maxlength="80" placeholder="Quote B"></label>`;
  form.insertBefore(names, form.firstElementChild);

  const insight = document.createElement("p");
  insight.className = "insight";
  insight.setAttribute("aria-live", "polite");
  result.after(insight);

  function renderInsight() {
    const comparison = normalizeComparison(Object.fromEntries(new FormData(form)));
    if (comparison.error || comparison.equal) {
      insight.textContent = comparison.error ? "" : "No savings difference at this volume.";
      return;
    }
    const cheaper = comparison.cheaper === "first"
      ? (form.elements.firstName.value.trim() || "Quote A")
      : (form.elements.secondName.value.trim() || "Quote B");
    const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
    insight.textContent = `${cheaper} saves ${currency.format(comparison.difference)} per month, ${currency.format(comparison.annualDifference)} per year (${savingsPercent(comparison).toFixed(1)}% versus the higher quote).`;
    record("comparison_savings_viewed");
  }

  form.addEventListener("submit", renderInsight);
  form.addEventListener("input", () => {
    try { localStorage.setItem("3pl-quote-normalizer-comparison-names", JSON.stringify({ firstName: form.elements.firstName.value, secondName: form.elements.secondName.value })); } catch { /* local drafts are optional */ }
    renderInsight();
  });
  try {
    const saved = JSON.parse(localStorage.getItem("3pl-quote-normalizer-comparison-names") || "null");
    if (saved && typeof saved === "object") {
      form.elements.firstName.value = typeof saved.firstName === "string" ? saved.firstName : "";
      form.elements.secondName.value = typeof saved.secondName === "string" ? saved.secondName : "";
    }
  } catch { /* local drafts are optional */ }
}
