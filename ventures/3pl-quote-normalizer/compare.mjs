export function normalizeComparison(input) {
  const firstInput = input?.first;
  const secondInput = input?.second;
  if (firstInput == null || secondInput == null || String(firstInput).trim() === "" || String(secondInput).trim() === "") return { error: "Enter a valid monthly total for both quotes." };
  const first = Number(firstInput);
  const second = Number(secondInput);
  if (!Number.isFinite(first) || !Number.isFinite(second)) return { error: "Enter a valid monthly total for both quotes." };
  if (first < 0 || second < 0) return { error: "Monthly totals cannot be negative." };
  const difference = Math.abs(first - second);
  return { first, second, equal: first === second, cheaper: first <= second ? "first" : "second", difference, annualDifference: difference * 12 };
}

export function comparisonMessage(result, firstName = "Quote A", secondName = "Quote B") {
  if (result.error) return result.error;
  if (result.equal) return "Both normalized totals are equal.";
  const cheaperName = result.cheaper === "first" ? firstName : secondName;
  return `${cheaperName} is lower by ${money(result.difference)} per month at this volume (${money(result.annualDifference)} per year).`;
}

function money(value) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value); }
