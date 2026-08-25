export function normalizeComparison(input) {
  if (input?.first === "" || input?.second === "" || input?.first == null || input?.second == null) return { error: "Enter a valid monthly total for both quotes." };
  const first = Number(input?.first);
  const second = Number(input?.second);
  if (!Number.isFinite(first) || !Number.isFinite(second)) return { error: "Enter a valid monthly total for both quotes." };
  if (first < 0 || second < 0) return { error: "Monthly totals cannot be negative." };
  const difference = Math.abs(first - second);
  const result = { first, second, equal: first === second, cheaper: first <= second ? "first" : "second", difference, annualDifference: difference * 12 };
  if (input?.target !== "" && input?.target != null) {
    const target = Number(input.target);
    if (!Number.isFinite(target) || target < 0) return { error: "The target monthly total must be a non-negative number." };
    result.target = target;
    result.firstWithinTarget = first <= target;
    result.secondWithinTarget = second <= target;
  }
  return result;
}

export function comparisonMessage(result, firstName = "Quote A", secondName = "Quote B") {
  if (result.error) return result.error;
  if (result.equal) return "Both normalized totals are equal.";
  const cheaperName = result.cheaper === "first" ? firstName : secondName;
  return `${cheaperName} is lower by ${money(result.difference)} per month at this volume (${money(result.annualDifference)} per year).`;
}

function money(value) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value); }

export function targetMessage(result, firstName = "Quote A", secondName = "Quote B") {
  if (result.error || result.target == null) return "";
  const status = (name, total, within) => `${name} ${within ? "is within" : "is above"} the ${money(result.target)} target by ${money(Math.abs(total - result.target))}.`;
  return `${status(firstName, result.first, result.firstWithinTarget)} ${status(secondName, result.second, result.secondWithinTarget)}`;
}
