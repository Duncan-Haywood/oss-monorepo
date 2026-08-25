const FIELDS = ["new_words", "fuzzy_words", "fuzzy_rate", "hourly_rate", "qa_hours", "dtp_cost", "rush_fee", "minimum_price", "target_margin"];

export function loadQuote(data) {
  const currency = data.currency === undefined ? "USD" : data.currency;
  if (typeof currency !== "string" || !currency.trim() || currency.trim().length > 12) throw new Error("currency must be a short non-empty label");
  const values = {};
  for (const field of FIELDS) {
    const value = data[field] === undefined ? 0 : data[field];
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new Error(`${field} must be a non-negative number`);
    values[field] = value;
  }
  if (values.new_words + values.fuzzy_words <= 0) throw new Error("word count must be greater than zero");
  if (values.hourly_rate <= 0) throw new Error("hourly_rate must be greater than zero");
  if (values.fuzzy_rate > 100) throw new Error("fuzzy_rate must be 100 or less");
  if (values.target_margin >= 100) throw new Error("target_margin must be less than 100");
  return { currency: currency.trim(), ...values };
}

export function calculate(q) {
  const weightedWords = q.new_words + q.fuzzy_words * (q.fuzzy_rate / 100);
  const translationHours = weightedWords / q.hourly_rate;
  const laborCost = translationHours * q.hourly_rate;
  const addons = q.qa_hours * q.hourly_rate + q.dtp_cost + q.rush_fee;
  const targetPrice = (laborCost + addons) / (1 - q.target_margin / 100);
  const minimumPrice = Math.max(q.minimum_price, laborCost + addons);
  return { weighted_words: weightedWords, translation_hours: translationHours, labor_cost: laborCost, add_on_costs: addons, target_price: targetPrice, minimum_price: minimumPrice };
}
