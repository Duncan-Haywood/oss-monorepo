export const fields = [
  "price",
  "delivery_hours",
  "admin_hours",
  "revision_hours",
  "overhead",
  "subcontractor_cost",
  "target_hourly_rate",
];

export function calculate(input) {
  const values = Object.fromEntries(fields.map((field) => [field, Number(input[field] || 0)]));
  if (values.price <= 0 || values.delivery_hours <= 0 || values.target_hourly_rate <= 0) {
    throw new Error("Price, delivery hours, and target hourly rate must be greater than zero.");
  }
  for (const field of fields) {
    if (!Number.isFinite(values[field]) || values[field] < 0) throw new Error(`${field} must be a non-negative number.`);
  }
  const total_hours = values.delivery_hours + values.admin_hours + values.revision_hours;
  const direct_costs = values.overhead + values.subcontractor_cost;
  const effective_hourly_rate = (values.price - direct_costs) / total_hours;
  const target_price = total_hours * values.target_hourly_rate + direct_costs;
  return { inputs: values, total_hours, direct_costs, effective_hourly_rate, target_price, gap_to_target: values.price - target_price };
}

export function formatMoney(value) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(value);
}
