// Meal records: creation, versioned corrections, deletion, and the HealthKit
// projection the iOS device applies.
import { randomUUID } from "node:crypto";
import { DEFAULT_POLICY, getPolicy } from "./policy.mjs";
import { cleanNutrients, scaleNutrients, mealTotals, referenceItem, toGrams, findReference, localDate, NUTRIENTS, ITEM_SOURCES, round } from "./nutrition.mjs";

export const MEAL_STATUSES = ["logged", "provisional", "deleted"];

export function newItemId() {
  return `it_${randomUUID().slice(0, 8)}`;
}

export function normalizeItem(raw) {
  if (!raw || typeof raw !== "object") throw new Error("item must be an object");
  const name = String(raw.name || "").trim();
  if (!name) throw new Error("item.name is required");
  const item = {
    id: raw.id || newItemId(),
    name: name.slice(0, 120),
    grams: raw.grams == null || raw.grams === "" ? null : round(Number(raw.grams), 0),
    preparation: raw.preparation ? String(raw.preparation).slice(0, 120) : null,
    source: ITEM_SOURCES.includes(raw.source) ? raw.source : "estimate",
    confidence: raw.confidence == null ? null : Math.max(0, Math.min(1, Number(raw.confidence))),
    nutrients: cleanNutrients(raw.nutrients || {}),
  };
  if (Array.isArray(raw.energy_range) && raw.energy_range.length === 2) item.energy_range = raw.energy_range.map((x) => Math.max(0, Math.round(Number(x))));
  if (raw.note) item.note = String(raw.note).slice(0, 300);
  if (item.nutrients.energy_kcal == null) throw new Error(`item "${name}" has no energy_kcal`);
  return item;
}

export function presentMeal(meal, { withVersions = null, policy = DEFAULT_POLICY } = {}) {
  if (!meal) return null;
  const totals = mealTotals(meal.items);
  const out = {
    id: meal.id,
    version: meal.version,
    status: meal.status,
    name: meal.name,
    eaten_at: meal.eaten_at,
    local_date: meal.local_date,
    time_zone: meal.time_zone,
    origin: meal.origin,
    confidence: meal.confidence,
    totals,
    items: meal.items,
    healthkit: healthKitState(meal, policy),
  };
  if (meal.deleted_reason) out.deleted_reason = meal.deleted_reason;
  if (withVersions) out.history = withVersions.map((v) => ({ version: v.version, actor: v.actor, reason: v.reason, at: v.created_at, change: v.change }));
  return out;
}

export function healthKitState(meal, policy = DEFAULT_POLICY) {
  const wanted = wantsHealthKit(meal, policy);
  if (meal.hk_error) return { state: "error", error: meal.hk_error, written_version: meal.hk_version };
  if (meal.hk_version >= meal.version) return { state: wanted ? "synced" : meal.hk_version > 0 ? "removed" : "not_applicable", written_version: meal.hk_version };
  if (!wanted && meal.hk_version === 0) return { state: "not_applicable", written_version: 0 };
  return { state: "pending", written_version: meal.hk_version };
}

export function wantsHealthKit(meal, policy = DEFAULT_POLICY) {
  return meal.status === "logged" || (meal.status === "provisional" && !!policy.provisional_to_healthkit);
}

export function createMeal(store, { id, name, eaten_at, tz_offset_min = 0, time_zone = null, items, status = "logged", confidence = null, origin = "chat", actor = "chat", reason = null }) {
  if (!MEAL_STATUSES.includes(status) || status === "deleted") throw new Error(`invalid status ${status}`);
  if (!Array.isArray(items) || !items.length) throw new Error("a meal needs at least one item");
  const when = eaten_at ? new Date(eaten_at) : store.now();
  if (Number.isNaN(when.getTime())) throw new Error(`invalid eaten_at: ${eaten_at}`);
  const iso = when.toISOString();
  const zone = time_zone || store.getSetting("current_time_zone", null);
  const meal = {
    id: id || `ml_${randomUUID()}`,
    version: 1,
    status,
    name: String(name || items.map((i) => i.name).join(", ")).slice(0, 160),
    eaten_at: iso,
    tz_offset_min,
    time_zone: zone,
    local_date: localDate(iso, { timeZone: zone, offsetMin: tz_offset_min }),
    items: items.map(normalizeItem),
    confidence,
    origin,
  };
  if (store.meal(meal.id)) return store.meal(meal.id); // idempotent on id
  return store.writeMeal(meal, { actor, reason, change: { op: "create" } });
}

function findItem(meal, ref) {
  if (ref == null) {
    if (meal.items.length === 1) return meal.items[0];
    throw new Error(`which item? this meal has ${meal.items.length}: ${meal.items.map((i) => `${i.name} (${i.id})`).join(", ")}`);
  }
  const s = String(ref).toLowerCase().trim();
  const byId = meal.items.find((i) => i.id === ref);
  if (byId) return byId;
  const exact = meal.items.filter((i) => i.name.toLowerCase() === s);
  if (exact.length === 1) return exact[0];
  const partial = meal.items.filter((i) => i.name.toLowerCase().includes(s) || s.includes(i.name.toLowerCase()));
  if (partial.length === 1) return partial[0];
  if (partial.length > 1) throw new Error(`"${ref}" matches several items: ${partial.map((i) => `${i.name} (${i.id})`).join(", ")}`);
  throw new Error(`no item matching "${ref}" in this meal; items: ${meal.items.map((i) => `${i.name} (${i.id})`).join(", ")}`);
}

/**
 * Apply correction operations to a meal, producing a new version.
 * `estimateItem` (optional, async) estimates nutrients for a free-text food
 * the reference table doesn't know; ops are resolved before anything is written.
 */
export async function correctMeal(store, mealId, operations, { actor = "chat", reason = null, estimateItem = null } = {}) {
  const meal = store.meal(mealId);
  if (!meal) throw new Error(`no meal ${mealId}`);
  if (!Array.isArray(operations) || !operations.length) throw new Error("operations must be a non-empty array");
  const next = structuredClone(meal);
  const applied = [];
  for (const op of operations) {
    switch (op.op) {
      case "scale": {
        const f = Number(op.factor);
        if (!Number.isFinite(f) || f <= 0 || f > 20) throw new Error("scale factor must be > 0 and <= 20");
        const targets = op.item ? [findItem(next, op.item)] : next.items;
        for (const it of targets) scaleItemInPlace(it, f);
        applied.push({ op: "scale", factor: f, item: op.item ?? null });
        break;
      }
      case "set_amount": {
        const it = findItem(next, op.item);
        const ref = findReference(it.name);
        const { grams, assumption } = toGrams(op.amount, { density: ref?.density, gramsPerEach: ref?.gramsPerEach });
        if (!it.grams) throw new Error(`"${it.name}" has no recorded weight to scale from; use set_item_nutrients or remove and re-add it`);
        const before = it.grams;
        scaleItemInPlace(it, grams / it.grams);
        it.grams = round(grams, 0);
        if (it.source === "estimate") it.source = "user";
        it.confidence = Math.max(it.confidence ?? 0, 0.85);
        if (assumption) it.note = assumption;
        applied.push({ op: "set_amount", item: it.id, grams_before: before, grams_after: it.grams });
        break;
      }
      case "add_item": {
        let item = null;
        if (op.nutrients && op.nutrients.energy_kcal != null) {
          let grams = null;
          if (op.amount) grams = toGrams(op.amount, { gramsPerEach: findReference(op.name)?.gramsPerEach }).grams;
          item = { name: op.name, grams, nutrients: op.nutrients, source: op.source === "label" ? "label" : "chat_estimate", confidence: op.confidence ?? 0.7 };
        } else if (op.amount && findReference(op.name)) {
          item = referenceItem(op.name, op.amount);
        } else if (estimateItem) {
          item = await estimateItem({ name: op.name, amount: op.amount ?? null, context: next.name });
        } else {
          throw new Error(`no reference values for "${op.name}" and no analyzer configured; pass nutrients (energy_kcal, protein_g, carbs_g, fat_g) with the item`);
        }
        const norm = normalizeItem(item);
        next.items.push(norm);
        applied.push({ op: "add_item", item: norm.id, name: norm.name, energy_kcal: norm.nutrients.energy_kcal });
        break;
      }
      case "remove_item": {
        const it = findItem(next, op.item);
        next.items = next.items.filter((x) => x.id !== it.id);
        if (!next.items.length) throw new Error("removing the last item would empty the meal; use delete_meal instead");
        applied.push({ op: "remove_item", item: it.id, name: it.name });
        break;
      }
      case "set_item_nutrients": {
        const it = findItem(next, op.item);
        it.nutrients = { ...it.nutrients, ...cleanNutrients(op.nutrients) };
        it.source = op.source === "label" ? "label" : "user";
        it.confidence = 1;
        delete it.energy_range;
        applied.push({ op: "set_item_nutrients", item: it.id });
        break;
      }
      case "rename":
        next.name = String(op.name || "").slice(0, 160) || next.name;
        applied.push({ op: "rename", name: next.name });
        break;
      case "set_time": {
        const d = new Date(op.eaten_at);
        if (Number.isNaN(d.getTime())) throw new Error(`invalid eaten_at ${op.eaten_at}`);
        next.eaten_at = d.toISOString();
        if (op.time_zone) next.time_zone = op.time_zone;
        next.local_date = localDate(next.eaten_at, { timeZone: next.time_zone, offsetMin: next.tz_offset_min });
        applied.push({ op: "set_time", eaten_at: next.eaten_at });
        break;
      }
      case "set_status":
        if (!["logged", "provisional"].includes(op.status)) throw new Error("status must be logged or provisional (use delete_meal to delete)");
        next.status = op.status;
        applied.push({ op: "set_status", status: op.status });
        break;
      default:
        throw new Error(`unknown operation "${op.op}"`);
    }
  }
  next.version = meal.version + 1;
  return store.writeMeal(next, { actor, reason, change: applied });
}

function scaleItemInPlace(it, f) {
  it.nutrients = scaleNutrients(it.nutrients, f);
  if (it.grams != null) it.grams = round(it.grams * f, 0);
  if (it.energy_range) it.energy_range = it.energy_range.map((x) => Math.round(x * f));
}

export function deleteMeal(store, mealId, { actor = "chat", reason = "deleted" } = {}) {
  const meal = store.meal(mealId);
  if (!meal) throw new Error(`no meal ${mealId}`);
  if (meal.status === "deleted") return meal;
  return store.writeMeal({ ...meal, status: "deleted", deleted_reason: reason, version: meal.version + 1 }, { actor, reason, change: { op: "delete" } });
}

export function restoreMeal(store, mealId, { actor = "chat", status = "logged" } = {}) {
  const meal = store.meal(mealId);
  if (!meal) throw new Error(`no meal ${mealId}`);
  if (meal.status !== "deleted") return meal;
  return store.writeMeal({ ...meal, status, deleted_reason: null, version: meal.version + 1 }, { actor, reason: "restored", change: { op: "restore" } });
}

export function replaceItems(store, mealId, items, { actor = "pipeline", reason = "reanalysis", confidence = null, name = null } = {}) {
  const meal = store.meal(mealId);
  if (!meal) throw new Error(`no meal ${mealId}`);
  return store.writeMeal(
    { ...meal, items: items.map(normalizeItem), confidence: confidence ?? meal.confidence, name: name || meal.name, version: meal.version + 1 },
    { actor, reason, change: { op: "replace_items", count: items.length } }
  );
}

// ---------------------------------------------------------------- HealthKit projection

export function syncIdentifier(mealId, nutrientKey) {
  return `pna:${mealId}:${nutrientKey}`;
}

/**
 * What the device should make true in HealthKit for this meal. Upserts carry
 * one sample per nutrient with HKMetadataKeySyncIdentifier/SyncVersion, so a
 * newer version replaces the older sample in HealthKit itself; a nutrient that
 * disappears from the meal, or a deleted meal, becomes a delete.
 */
export function healthKitChange(meal, policy = DEFAULT_POLICY) {
  const base = { meal_id: meal.id, version: meal.version };
  if (!wantsHealthKit(meal, policy)) {
    return { ...base, action: "delete", sync_identifiers: NUTRIENTS.map((n) => syncIdentifier(meal.id, n.key)) };
  }
  const totals = mealTotals(meal.items);
  const samples = [];
  const missing = [];
  for (const n of NUTRIENTS) {
    const v = totals[n.key];
    const id = syncIdentifier(meal.id, n.key);
    if (v == null) {
      missing.push(id);
      continue;
    }
    samples.push({ type: n.hk, unit: n.hkUnit, value: v, sync_identifier: id });
  }
  return {
    ...base,
    action: "upsert",
    start: meal.eaten_at,
    end: meal.eaten_at,
    time_zone: meal.time_zone,
    food_type: meal.name,
    provisional: meal.status === "provisional",
    samples,
    delete_sync_identifiers: missing,
  };
}

export function healthKitFeed(store, sinceSeq = 0, limit = 200) {
  const meals = store.mealsChangedSince(sinceSeq, limit);
  const policy = getPolicy(store);
  const changes = [];
  for (const m of meals) {
    // A meal that never reached HealthKit and isn't wanted there needs no device work.
    if (!wantsHealthKit(m, policy) && m.hk_version === 0 && !m.hk_samples) continue;
    changes.push(healthKitChange(m, policy));
  }
  const cursor = meals.length ? meals[meals.length - 1].seq : sinceSeq;
  // Meals the device reported as failed are offered again (applying is idempotent on the device).
  const seen = new Set(changes.map((c) => c.meal_id));
  const retry = store.db
    .prepare("SELECT id FROM meals WHERE hk_error IS NOT NULL AND hk_version < version AND seq <= ? LIMIT 20")
    .all(sinceSeq)
    .map((r) => store.meal(r.id))
    .filter((m) => !seen.has(m.id));
  for (const m of retry) changes.push({ ...healthKitChange(m, policy), retry: true });
  return { cursor, changes, more: meals.length === limit };
}

/** Meals whose HealthKit projection is behind their current version. */
export function healthKitBacklog(store) {
  const policy = getPolicy(store);
  const rows = store.db.prepare("SELECT id FROM meals WHERE hk_version < version").all();
  return rows
    .map((r) => store.meal(r.id))
    .filter((m) => wantsHealthKit(m, policy) || m.hk_version > 0)
    .map((m) => ({ meal_id: m.id, name: m.name, version: m.version, written_version: m.hk_version, error: m.hk_error }));
}
