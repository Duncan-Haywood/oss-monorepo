// Stage 2 of the pipeline: a multimodal model estimates what is in a photo the
// device's on-device classifier (stage 1) already judged likely to be food.
//
// Provider: any OpenAI-compatible Chat Completions endpoint that accepts image
// input and `response_format: json_schema` (OpenAI by default; set
// NUTRITION_API_BASE for a compatible gateway). With no key configured the
// server still accepts photos and queues them; nothing is lost.
import { cleanNutrients, atwaterGap, NUTRIENT_KEYS } from "./nutrition.mjs";

export const KINDS = ["meal", "beverage", "snack", "nutrition_label", "menu", "groceries", "recipe", "other_persons_food", "not_food"];
export const CONSUMABLE_KINDS = new Set(["meal", "beverage", "snack"]);
export const RELATIONS = ["new_meal", "same_meal", "additional_items", "none"];

const nutrientProps = Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, { type: ["number", "null"] }]));

export const ANALYSIS_SCHEMA = {
  name: "food_photo_analysis",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["kind", "consumed_likelihood", "relation_to_recent_meal", "meal_name", "overall_confidence", "items", "label", "notes"],
    properties: {
      kind: { type: "string", enum: KINDS },
      consumed_likelihood: { type: "number", description: "0..1: how likely the photographer is about to eat or drink this themselves" },
      relation_to_recent_meal: { type: "string", enum: RELATIONS },
      meal_name: { type: "string" },
      overall_confidence: { type: "number" },
      items: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["name", "grams", "preparation", "confidence", "energy_low_kcal", "energy_high_kcal", "nutrients"],
          properties: {
            name: { type: "string" },
            grams: { type: ["number", "null"], description: "estimated edible weight as served (cooked weight if cooked)" },
            preparation: { type: ["string", "null"], description: "e.g. grilled, fried in oil, raw; include visible oils, sauces, condiments as their own items" },
            confidence: { type: "number" },
            energy_low_kcal: { type: "number" },
            energy_high_kcal: { type: "number" },
            nutrients: { type: "object", additionalProperties: false, required: NUTRIENT_KEYS, properties: nutrientProps },
          },
        },
      },
      label: {
        type: ["object", "null"],
        additionalProperties: false,
        required: ["product", "serving_grams", "servings_per_container", "per_serving"],
        properties: {
          product: { type: ["string", "null"] },
          serving_grams: { type: ["number", "null"] },
          servings_per_container: { type: ["number", "null"] },
          per_serving: { type: "object", additionalProperties: false, required: NUTRIENT_KEYS, properties: nutrientProps },
        },
      },
      notes: { type: "string" },
    },
  },
};

export function systemPrompt() {
  return [
    "You estimate nutrition from a single photo taken by one person who logs what they eat.",
    "Classify the photo: meal, beverage, snack, nutrition_label (a Nutrition Facts panel or similar), menu, groceries (unprepared food in packaging or a store), recipe (a recipe card, screen or cookbook page), other_persons_food (clearly someone else's plate, e.g. across a table), or not_food.",
    "consumed_likelihood: how likely it is that the photographer is about to consume what is shown. A plate in front of the camera is high; a shop shelf, a menu or a friend's plate is low.",
    "For meals, list each component separately, including cooking oil, butter, sauces, dressings and drinks you can see or that the preparation clearly implies. Estimate the edible weight in grams as served, then nutrients for that weight. Use typical restaurant or home portions when scale is unclear, and use plates, cutlery and hands as scale cues.",
    "Give an honest energy range per item (energy_low_kcal..energy_high_kcal) reflecting portion and recipe uncertainty. Confidence values are 0..1. Never present a guess as precise: lower confidence instead.",
    "For a nutrition label, transcribe per-serving values exactly as printed into label.per_serving (use null for anything not printed), and leave items empty unless food is also shown.",
    "relation_to_recent_meal: if a recent meal is described below, say whether this photo shows the same meal again (another angle, the same plate partly eaten: same_meal), more food added to it (additional_items: list only the new items), or a separate eating occasion (new_meal). Use none when there is no recent meal.",
    "Return only the JSON object.",
  ].join("\n");
}

export function userText(context = {}) {
  const lines = [];
  if (context.captured_at_local) lines.push(`Photo taken at local time ${context.captured_at_local}.`);
  if (context.recent_meal) {
    const m = context.recent_meal;
    lines.push(`Recent meal (${m.minutes_ago} minutes before this photo): "${m.name}" with ${m.items.map((i) => `${i.name}${i.grams ? ` ~${i.grams} g` : ""}`).join(", ")}.`);
  } else lines.push("No recent meal.");
  if (context.preferences) lines.push(`Known habits of this person (use only as a tie-breaker): ${context.preferences}`);
  if (context.note) lines.push(`The person says: ${context.note}`);
  return lines.join("\n");
}

/** Make whatever the model returned safe to store: clamp, clean, and flag inconsistencies. */
export function normalizeAnalysis(raw) {
  if (!raw || typeof raw !== "object") throw new Error("analysis is not an object");
  const clamp01 = (x, d = 0.5) => (Number.isFinite(Number(x)) ? Math.max(0, Math.min(1, Number(x))) : d);
  const kind = KINDS.includes(raw.kind) ? raw.kind : "not_food";
  const flags = [];
  const items = (Array.isArray(raw.items) ? raw.items : [])
    .filter((i) => i && i.name)
    .map((i) => {
      const nutrients = cleanNutrients(i.nutrients || {});
      let confidence = clamp01(i.confidence);
      const gap = atwaterGap(nutrients);
      if (gap != null && gap > 0.25) {
        confidence = Math.min(confidence, 0.4);
        flags.push(`energy and macros disagree for ${i.name} (${Math.round(gap * 100)}% gap)`);
      }
      let lo = Number(i.energy_low_kcal);
      let hi = Number(i.energy_high_kcal);
      const e = nutrients.energy_kcal ?? 0;
      if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo > hi) [lo, hi] = [e * 0.7, e * 1.3];
      lo = Math.min(lo, e);
      hi = Math.max(hi, e);
      return {
        name: String(i.name).slice(0, 120),
        grams: Number.isFinite(Number(i.grams)) && Number(i.grams) > 0 ? Math.round(Number(i.grams)) : null,
        preparation: i.preparation || null,
        source: "estimate",
        confidence,
        energy_range: [Math.round(lo), Math.round(hi)],
        nutrients,
      };
    })
    .filter((i) => i.nutrients.energy_kcal != null);
  let overall = clamp01(raw.overall_confidence);
  if (items.length) overall = Math.min(overall, Math.max(...items.map((i) => i.confidence)) + 0.1);
  if (CONSUMABLE_KINDS.has(kind) && !items.length) {
    flags.push("food recognised but no items estimated");
    overall = Math.min(overall, 0.2);
  }
  let label = null;
  if (raw.label && raw.label.per_serving) {
    label = {
      product: raw.label.product || null,
      serving_grams: Number(raw.label.serving_grams) > 0 ? Number(raw.label.serving_grams) : null,
      servings_per_container: Number(raw.label.servings_per_container) > 0 ? Number(raw.label.servings_per_container) : null,
      per_serving: cleanNutrients(raw.label.per_serving),
    };
    if (label.per_serving.energy_kcal == null) label = null;
  }
  return {
    kind,
    consumed_likelihood: clamp01(raw.consumed_likelihood, CONSUMABLE_KINDS.has(kind) ? 0.7 : 0.1),
    relation_to_recent_meal: RELATIONS.includes(raw.relation_to_recent_meal) ? raw.relation_to_recent_meal : "new_meal",
    meal_name: String(raw.meal_name || items.map((i) => i.name).join(", ") || kind).slice(0, 160),
    overall_confidence: overall,
    items,
    label,
    notes: String(raw.notes || "").slice(0, 1000),
    flags,
  };
}

export function openAiAnalyzer({ apiKey, model = "gpt-5-mini", baseUrl = "https://api.openai.com/v1", fetchImpl = globalThis.fetch, timeoutMs = 60000 } = {}) {
  if (!apiKey) return null;
  async function chat(messages, schema) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const res = await fetchImpl(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        signal: ctl.signal,
        headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model, messages, response_format: { type: "json_schema", json_schema: schema } }),
      });
      const text = await res.text();
      if (!res.ok) {
        const err = new Error(`analyzer HTTP ${res.status}: ${text.slice(0, 300)}`);
        err.retryable = res.status === 429 || res.status >= 500;
        throw err;
      }
      const body = JSON.parse(text);
      const content = body.choices?.[0]?.message?.content;
      if (!content) throw Object.assign(new Error("analyzer returned no content"), { retryable: true });
      return { parsed: JSON.parse(content), usage: body.usage || null, model: body.model || model };
    } catch (e) {
      if (e.name === "AbortError") throw Object.assign(new Error("analyzer timed out"), { retryable: true });
      if (e.retryable === undefined) e.retryable = true; // network errors
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }
  return {
    name: `openai-compatible:${model}`,
    async analyzeImage({ imageBase64, mime = "image/jpeg", context = {} }) {
      const { parsed, usage, model: used } = await chat(
        [
          { role: "system", content: systemPrompt() },
          {
            role: "user",
            content: [
              { type: "text", text: userText(context) },
              { type: "image_url", image_url: { url: `data:${mime};base64,${imageBase64}`, detail: "high" } },
            ],
          },
        ],
        ANALYSIS_SCHEMA
      );
      return { ...normalizeAnalysis(parsed), model: used, usage };
    },
    async estimateText({ description, amount = null, context = null }) {
      const what = amount ? `${amount.value} ${amount.unit} of ${description}` : description;
      const { parsed } = await chat(
        [
          { role: "system", content: systemPrompt() },
          { role: "user", content: `No photo. Estimate nutrition for: ${what}.${context ? ` It was part of: ${context}.` : ""} Treat it as kind "meal" with relation "none".` },
        ],
        ANALYSIS_SCHEMA
      );
      return normalizeAnalysis(parsed);
    },
  };
}

/** Deterministic analyzer for tests and offline demos: looks up `fixtures[assetHint]`. */
export function fakeAnalyzer(fixtures = {}, { fail = new Map() } = {}) {
  const calls = [];
  return {
    name: "fake",
    calls,
    async analyzeImage({ imageBase64, context }) {
      const key = Buffer.from(imageBase64, "base64").toString("utf8");
      calls.push({ key, context });
      const f = fail.get(key);
      if (f && f.remaining > 0) {
        f.remaining--;
        throw Object.assign(new Error("simulated outage"), { retryable: true });
      }
      const raw = fixtures[key];
      if (!raw) return normalizeAnalysis({ kind: "not_food", items: [], overall_confidence: 0.9, consumed_likelihood: 0 });
      return normalizeAnalysis(typeof raw === "function" ? raw(context) : raw);
    },
    async estimateText({ description, amount }) {
      calls.push({ text: description, amount });
      const raw = fixtures[`text:${description}`];
      if (!raw) throw new Error(`fake analyzer has no estimate for ${description}`);
      return normalizeAnalysis(raw);
    },
  };
}
