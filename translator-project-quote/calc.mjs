const FIELDS = [
  "new_words",
  "fuzzy_words",
  "fuzzy_rate",
  "words_per_hour",
  "hourly_rate",
  "qa_hours",
  "dtp_cost",
  "rush_fee",
  "minimum_price",
  "target_margin",
];

export function loadQuote(data) {
  const currency = data.currency === undefined ? "USD" : data.currency;
  if (typeof currency !== "string" || !currency.trim() || currency.trim().length > 12) {
    throw new Error("currency must be a short non-empty label");
  }
  const values = {};
  for (const field of FIELDS) {
    const value = data[field] === undefined ? 0 : data[field];
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      throw new Error(`${field} must be a non-negative number`);
    }
    values[field] = value;
  }
  if (values.new_words + values.fuzzy_words <= 0) {
    throw new Error("word count must be greater than zero");
  }
  if (values.words_per_hour <= 0) {
    throw new Error("words_per_hour must be greater than zero");
  }
  if (values.hourly_rate <= 0) {
    throw new Error("hourly_rate must be greater than zero");
  }
  if (values.fuzzy_rate > 100) {
    throw new Error("fuzzy_rate must be 100 or less");
  }
  if (values.target_margin >= 100) {
    throw new Error("target_margin must be less than 100");
  }
  return { currency: currency.trim(), ...values };
}

export function calculate(q) {
  const weightedWords = q.new_words + q.fuzzy_words * (q.fuzzy_rate / 100);
  const translationHours = weightedWords / q.words_per_hour;
  const laborCost = translationHours * q.hourly_rate;
  const addons = q.qa_hours * q.hourly_rate + q.dtp_cost + q.rush_fee;
  const directCost = laborCost + addons;
  const targetPrice = directCost / (1 - q.target_margin / 100);
  // The floor beneath direct cost, before margin: a very small job's real
  // cost can sit under the flat minimum, so the minimum wins.
  const minimumPrice = Math.max(q.minimum_price, directCost);
  // What to actually quote: never below the stated minimum, and never below
  // what the stated target margin requires either. `minimumPrice` alone
  // stops short of that second guarantee -- once a job's direct cost clears
  // the flat minimum, `minimumPrice` tracks cost with zero margin, so a job
  // whose target-margin price is *above* both the minimum and the raw cost
  // (a normal outcome any time target_margin > 0) never had that margin
  // enforced anywhere. This venture's own guide already tells a reader to
  // "quote $435 or the target-margin price above it" by hand; this is that
  // same comparison, done once, for every quote.
  const recommendedPrice = Math.max(minimumPrice, targetPrice);
  return {
    weighted_words: weightedWords,
    translation_hours: translationHours,
    labor_cost: laborCost,
    add_on_costs: addons,
    direct_cost: directCost,
    target_price: targetPrice,
    minimum_price: minimumPrice,
    recommended_price: recommendedPrice,
  };
}
