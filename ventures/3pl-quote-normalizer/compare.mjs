export function normalizeComparison(input) {
  const firstInput = input?.first;
  const secondInput = input?.second;
  if (firstInput == null || secondInput == null || String(firstInput).trim() === "" || String(secondInput).trim() === "") return { error: "Enter a valid monthly total for both quotes." };
  const first = Number(firstInput);
  const second = Number(secondInput);
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

export function negotiationBrief(result, firstName = "Quote A", secondName = "Quote B") {
  if (result.error) return result.error;
  if (result.equal) {
    return "The normalized monthly totals are equal. Ask both providers to itemize minimums, implementation fees, and any volume assumptions before choosing.";
  }
  const cheaperName = result.cheaper === "first" ? firstName : secondName;
  const otherName = result.cheaper === "first" ? secondName : firstName;
  return [
    "Negotiation brief",
    `${cheaperName} is lower by ${money(result.difference)} per month (${money(result.annualDifference)} per year) at this volume.`,
    `Ask ${otherName}: Can you match or explain the ${money(result.difference)} monthly gap, including every minimum, return fee, and volume assumption? Please confirm the final all-in monthly total in writing.`,
  ].join("\n");
}

export function savingsPercent(result) {
  if (!result || result.error || result.equal) return 0;
  const higher = Math.max(result.first, result.second);
  return higher === 0 ? 0 : (result.difference / higher) * 100;
}

function money(value) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value); }

export function targetMessage(result, firstName = "Quote A", secondName = "Quote B") {
  if (result.error || result.target == null) return "";
  const status = (name, total, within) => `${name} ${within ? `is within the ${money(result.target)} target (${money(result.target - total)} under)` : `is above the ${money(result.target)} target by ${money(total - result.target)}`}.`;
  return `${status(firstName, result.first, result.firstWithinTarget)} ${status(secondName, result.second, result.secondWithinTarget)}`;
}
