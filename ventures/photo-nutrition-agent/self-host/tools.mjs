// One tool registry, served three ways: MCP (ChatGPT developer-mode apps,
// Claude and other MCP clients), plain REST (/api/tools/<name>) and an OpenAPI
// document for a ChatGPT Custom GPT's Actions. Handlers return plain JSON.
import { presentMeal, createMeal, correctMeal, deleteMeal, restoreMeal, healthKitBacklog } from "./meals.mjs";
import { presentPhoto, reanalyzeMeal, promotePhoto } from "./pipeline.mjs";
import { dailyTotals, nutritionHistory, weightHistory, energyBalance, bodyCompositionHistory, LB } from "./analytics.mjs";
import { getPolicy, updatePolicy, getTargets, updateTargets, getProfile, updateProfile } from "./policy.mjs";
import { localDate, addDays, referenceItem, NUTRIENT_KEYS } from "./nutrition.mjs";

const nutrientsSchema = {
  type: "object",
  description: "Nutrients for the stated amount. energy_kcal is required; others optional.",
  properties: Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, { type: "number", minimum: 0 }])),
  required: ["energy_kcal"],
};
const amountSchema = {
  type: "object",
  description: "A quantity, e.g. {value: 12, unit: 'oz'} or {value: 2, unit: 'tbsp'} or {value: 3, unit: 'each'}.",
  properties: { value: { type: "number", minimum: 0 }, unit: { type: "string" } },
  required: ["value", "unit"],
};
const dateSchema = { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$", description: "Local calendar date YYYY-MM-DD" };
const itemSchema = {
  type: "object",
  properties: {
    name: { type: "string" },
    amount: amountSchema,
    grams: { type: "number", minimum: 0 },
    preparation: { type: "string" },
    nutrients: nutrientsSchema,
  },
  required: ["name"],
};

export function today(store) {
  return localDate(store.nowIso(), { timeZone: store.getSetting("current_time_zone", null) });
}

const READ = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
const WRITE = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };
const DESTRUCTIVE = { readOnlyHint: false, destructiveHint: true, openWorldHint: false };

function estimatorFor(ctx) {
  if (!ctx.analyzer) return null;
  return async ({ name, amount, context }) => {
    const a = await ctx.analyzer.estimateText({ description: name, amount, context });
    if (!a.items.length) throw new Error(`could not estimate "${name}"`);
    const combined = a.items.length === 1 ? a.items[0] : { ...a.items[0], name, nutrients: a.items.reduce((acc, i) => { for (const [k, v] of Object.entries(i.nutrients)) acc[k] = (acc[k] || 0) + v; return acc; }, {}) };
    return { ...combined, name, source: "estimate" };
  };
}

async function resolveItems(ctx, items) {
  const out = [];
  for (const it of items) {
    if (it.nutrients && it.nutrients.energy_kcal != null) {
      out.push({ name: it.name, grams: it.grams ?? null, preparation: it.preparation, nutrients: it.nutrients, source: "chat_estimate", confidence: 0.7 });
    } else if (it.amount && referenceItem(it.name, it.amount)) {
      out.push(referenceItem(it.name, it.amount));
    } else {
      const est = estimatorFor(ctx);
      if (!est) throw new Error(`no nutrients given for "${it.name}" and no analyzer configured; include nutrients`);
      out.push(await est({ name: it.name, amount: it.amount ?? (it.grams ? { value: it.grams, unit: "g" } : null), context: null }));
    }
  }
  return out;
}

export const TOOLS = [
  {
    name: "get_daily_totals",
    title: "Daily nutrition totals",
    description: "Totals for one local day (default today): energy, protein, carbs, fat, fiber and more, with an energy uncertainty range, remaining amounts against targets, and counts of logged vs provisional meals.",
    annotations: READ,
    inputSchema: { type: "object", properties: { date: dateSchema } },
    handler: (ctx, a) => dailyTotals(ctx.store, a.date || today(ctx.store)),
  },
  {
    name: "get_meals",
    title: "List meals",
    description: "Meals between two local dates (inclusive; default today), newest last. Use to answer 'what did I eat yesterday' or to find a meal id before correcting it.",
    annotations: READ,
    inputSchema: { type: "object", properties: { from: dateSchema, to: dateSchema, include_deleted: { type: "boolean" }, status: { type: "string", enum: ["logged", "provisional", "deleted"] } } },
    handler: (ctx, a) => {
      const t = today(ctx.store);
      const from = a.from || a.to || t;
      const to = a.to || a.from || t;
      let meals = ctx.store.mealsByDate(from, to, { includeDeleted: !!a.include_deleted || a.status === "deleted" });
      if (a.status) meals = meals.filter((m) => m.status === a.status);
      const policy = getPolicy(ctx.store);
      return { from, to, count: meals.length, meals: meals.map((m) => presentMeal(m, { policy })) };
    },
  },
  {
    name: "find_meals",
    title: "Search meals",
    description: "Find meals whose name or items match a phrase (e.g. 'steak', 'lunch salad') within the last N days (default 7). Use to resolve 'that steak' to a meal id.",
    annotations: READ,
    inputSchema: { type: "object", properties: { query: { type: "string" }, days: { type: "integer", minimum: 1, maximum: 365 } }, required: ["query"] },
    handler: (ctx, a) => {
      const t = today(ctx.store);
      const q = String(a.query).toLowerCase();
      const meals = ctx.store.mealsByDate(addDays(t, -((a.days || 7) - 1)), t).filter((m) => m.name.toLowerCase().includes(q) || m.items.some((i) => i.name.toLowerCase().includes(q)));
      const policy = getPolicy(ctx.store);
      return { query: a.query, count: meals.length, meals: meals.reverse().map((m) => presentMeal(m, { policy })) };
    },
  },
  {
    name: "get_meal",
    title: "Get one meal",
    description: "One meal with its items, totals, Apple Health sync state and full correction history.",
    annotations: READ,
    inputSchema: { type: "object", properties: { meal_id: { type: "string" } }, required: ["meal_id"] },
    handler: (ctx, a) => {
      const m = ctx.store.meal(a.meal_id);
      if (!m) throw new Error(`no meal ${a.meal_id}`);
      return { ...presentMeal(m, { withVersions: ctx.store.mealVersions(m.id), policy: getPolicy(ctx.store) }), photos: ctx.store.photosForMeal(m.id).map(presentPhoto) };
    },
  },
  {
    name: "log_meal",
    title: "Log a meal",
    description: "Create a meal from a description (no photo). For each item give either nutrients you estimated, or an amount for a staple the server knows (olive oil, butter, egg, egg white, cooked chicken breast, cooked white rice), or just a name/amount for the server's analyzer to estimate.",
    annotations: WRITE,
    inputSchema: {
      type: "object",
      properties: { name: { type: "string" }, eaten_at: { type: "string", description: "ISO-8601; default now" }, items: { type: "array", items: itemSchema, minItems: 1 }, provisional: { type: "boolean" } },
      required: ["items"],
    },
    handler: async (ctx, a) => {
      const items = await resolveItems(ctx, a.items);
      const m = createMeal(ctx.store, { name: a.name, eaten_at: a.eaten_at, items, status: a.provisional ? "provisional" : "logged", origin: "chat", actor: "chat", reason: "logged in chat" });
      return presentMeal(m, { policy: getPolicy(ctx.store) });
    },
  },
  {
    name: "update_meal",
    title: "Correct a meal",
    description:
      "Apply corrections to a meal; each call creates a new version, keeps history, and queues the change for Apple Health. Operations: scale {factor} (0.5 = ate half; optional item), set_amount {item, amount} ('the steak was 12 oz'), add_item {name, amount?, nutrients?} ('add three eggs', 'two tablespoons of olive oil'), remove_item {item}, set_item_nutrients {item, nutrients, source?}, rename {name}, set_time {eaten_at}, set_status {status: logged|provisional}. `item` is an item id or a name fragment.",
    annotations: WRITE,
    inputSchema: {
      type: "object",
      properties: {
        meal_id: { type: "string" },
        reason: { type: "string", description: "What the person said, for the audit history" },
        operations: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            properties: {
              op: { type: "string", enum: ["scale", "set_amount", "add_item", "remove_item", "set_item_nutrients", "rename", "set_time", "set_status"] },
              item: { type: "string" },
              factor: { type: "number" },
              amount: amountSchema,
              name: { type: "string" },
              nutrients: nutrientsSchema,
              source: { type: "string", enum: ["user", "label"] },
              eaten_at: { type: "string" },
              status: { type: "string", enum: ["logged", "provisional"] },
            },
            required: ["op"],
          },
        },
      },
      required: ["meal_id", "operations"],
    },
    handler: async (ctx, a) => {
      const m = await correctMeal(ctx.store, a.meal_id, a.operations, { actor: "chat", reason: a.reason || null, estimateItem: estimatorFor(ctx) });
      return presentMeal(m, { policy: getPolicy(ctx.store) });
    },
  },
  {
    name: "delete_meal",
    title: "Delete a meal",
    description: "Soft-delete a meal (kept in history, removed from totals and from Apple Health). Use reason 'not_consumed' for 'that was someone else's food'. Reversible with restore_meal.",
    annotations: DESTRUCTIVE,
    inputSchema: { type: "object", properties: { meal_id: { type: "string" }, reason: { type: "string" } }, required: ["meal_id"] },
    handler: (ctx, a) => presentMeal(deleteMeal(ctx.store, a.meal_id, { actor: "chat", reason: a.reason || "deleted in chat" }), { policy: getPolicy(ctx.store) }),
  },
  {
    name: "restore_meal",
    title: "Restore a deleted meal",
    description: "Undo delete_meal.",
    annotations: WRITE,
    inputSchema: { type: "object", properties: { meal_id: { type: "string" } }, required: ["meal_id"] },
    handler: (ctx, a) => presentMeal(restoreMeal(ctx.store, a.meal_id, { actor: "chat" }), { policy: getPolicy(ctx.store) }),
  },
  {
    name: "reanalyze_meal",
    title: "Reanalyze a meal",
    description: "Run the vision/nutrition model again, from the retained photo when there is one (else from the item list), optionally with a hint ('it was cooked in butter'). Replaces items; history keeps the old version.",
    annotations: WRITE,
    inputSchema: { type: "object", properties: { meal_id: { type: "string" }, note: { type: "string" } }, required: ["meal_id"] },
    handler: async (ctx, a) => {
      const r = await reanalyzeMeal(ctx, a.meal_id, { note: a.note || null });
      return { basis: r.basis, meal: presentMeal(r.meal, { policy: getPolicy(ctx.store) }) };
    },
  },
  {
    name: "get_pending_reviews",
    title: "Meals and photos needing a look",
    description: "Provisional (low-confidence) meals, plus recent photos that were ignored or failed, so the person can confirm, fix or dismiss them. Only bring these up when relevant; don't nag.",
    annotations: READ,
    inputSchema: { type: "object", properties: { days: { type: "integer", minimum: 1, maximum: 90 } } },
    handler: (ctx, a) => {
      const since = addDays(today(ctx.store), -((a.days || 7) - 1));
      const policy = getPolicy(ctx.store);
      const provisional = ctx.store.mealsWithStatus("provisional").filter((m) => m.local_date >= since);
      const photos = [...ctx.store.photosInState("ignored", 200), ...ctx.store.photosInState("failed", 200), ...ctx.store.photosInState("label_pending", 200)].filter((p) => p.local_date >= since && p.analysis);
      return { provisional_meals: provisional.map((m) => presentMeal(m, { policy })), photos_not_logged: photos.map(presentPhoto) };
    },
  },
  {
    name: "resolve_pending_review",
    title: "Resolve a pending review",
    description: "confirm (provisional meal -> logged), dismiss (delete it as not eaten), or log_photo (an ignored photo was in fact eaten: create a meal from its estimate).",
    annotations: WRITE,
    inputSchema: { type: "object", properties: { action: { type: "string", enum: ["confirm", "dismiss", "log_photo"] }, meal_id: { type: "string" }, photo_id: { type: "string" } }, required: ["action"] },
    handler: async (ctx, a) => {
      const policy = getPolicy(ctx.store);
      if (a.action === "log_photo") {
        if (!a.photo_id) throw new Error("photo_id is required for log_photo");
        return presentMeal(promotePhoto(ctx, a.photo_id), { policy });
      }
      if (!a.meal_id) throw new Error("meal_id is required");
      if (a.action === "confirm") return presentMeal(await correctMeal(ctx.store, a.meal_id, [{ op: "set_status", status: "logged" }], { actor: "chat", reason: "confirmed" }), { policy });
      return presentMeal(deleteMeal(ctx.store, a.meal_id, { actor: "chat", reason: "not_consumed" }), { policy });
    },
  },
  {
    name: "get_nutrition_history",
    title: "Nutrition history",
    description: "Daily series, weekly means, mean/SD per macro, and adherence to protein and calorie targets between two dates (default last 7 days).",
    annotations: READ,
    inputSchema: { type: "object", properties: { from: dateSchema, to: dateSchema } },
    handler: (ctx, a) => {
      const to = a.to || today(ctx.store);
      return nutritionHistory(ctx.store, a.from || addDays(to, -6), to);
    },
  },
  {
    name: "get_nutrition_targets",
    title: "Targets and profile",
    description: "Current daily targets, weight-change goal, profile fields and logging policy.",
    annotations: READ,
    inputSchema: { type: "object", properties: {} },
    handler: (ctx) => {
      const t = getTargets(ctx.store);
      return { targets: t, targets_lb: { weekly_weight_change_lb: t.weekly_weight_change_kg == null ? null : Math.round((t.weekly_weight_change_kg / LB) * 100) / 100, goal_weight_lb: t.goal_weight_kg == null ? null : Math.round((t.goal_weight_kg / LB) * 10) / 10 }, profile: getProfile(ctx.store), policy: getPolicy(ctx.store), preferences: ctx.store.getSetting("preferences", null) };
    },
  },
  {
    name: "update_nutrition_targets",
    title: "Change targets",
    description: "Change daily targets (energy_kcal, protein_g, carbs_g, fat_g, fiber_g), the weight goal (goal_weight_kg|goal_weight_lb, weekly_weight_change_kg|weekly_weight_change_lb, negative = loss, goal_body_fat_pct), notes, profile fields (birth_year, height_cm, sex, activity_notes), free-text eating preferences the analyzer may use as a tie-breaker, and logging policy fields.",
    annotations: WRITE,
    inputSchema: {
      type: "object",
      properties: {
        targets: { type: "object", additionalProperties: true },
        profile: { type: "object", additionalProperties: true },
        preferences: { type: "string" },
        policy: { type: "object", additionalProperties: true },
      },
    },
    handler: (ctx, a) => {
      const out = {};
      if (a.targets) out.targets = updateTargets(ctx.store, a.targets);
      if (a.profile) out.profile = updateProfile(ctx.store, a.profile);
      if (a.policy) out.policy = updatePolicy(ctx.store, a.policy);
      if (a.preferences != null) {
        ctx.store.setSetting("preferences", String(a.preferences).slice(0, 1000));
        out.preferences = ctx.store.getSetting("preferences");
      }
      if (!Object.keys(out).length) throw new Error("nothing to update");
      return out;
    },
  },
  {
    name: "get_weight_history",
    title: "Weight history",
    description: "Weigh-ins from Apple Health (kg and lb), body fat % and lean mass samples, and a linear weight trend with a 95% interval (default last 28 days).",
    annotations: READ,
    inputSchema: { type: "object", properties: { from: dateSchema, to: dateSchema } },
    handler: (ctx, a) => {
      const to = a.to || today(ctx.store);
      return weightHistory(ctx.store, a.from || addDays(to, -27), to);
    },
  },
  {
    name: "get_energy_balance",
    title: "Estimated expenditure and deficit",
    description: "Estimate energy expenditure and the daily deficit from logged intake and the weight trend over the last N days (default 28), with a 95% interval and caveats; also the intake that would match the weekly weight-change target.",
    annotations: READ,
    inputSchema: { type: "object", properties: { days: { type: "integer", minimum: 7, maximum: 180 }, to: dateSchema } },
    handler: (ctx, a) => energyBalance(ctx.store, { to: a.to || today(ctx.store), days: a.days || 28 }),
  },
  {
    name: "get_body_composition_history",
    title: "DEXA history",
    description: "All recorded DEXA scans with changes between consecutive scans and notes on measurement precision.",
    annotations: READ,
    inputSchema: { type: "object", properties: {} },
    handler: (ctx) => bodyCompositionHistory(ctx.store),
  },
  {
    name: "log_dexa_scan",
    title: "Record a DEXA scan",
    description: "Store the results of a DEXA scan. If the person shares a report (PDF or photo) in chat, read the values from it and pass them here; ask before guessing any value that isn't printed. Masses in kg (convert lb x 0.4536).",
    annotations: WRITE,
    inputSchema: {
      type: "object",
      properties: {
        scan_date: dateSchema,
        total_mass_kg: { type: "number" },
        body_fat_pct: { type: "number" },
        fat_mass_kg: { type: "number" },
        lean_mass_kg: { type: "number", description: "lean soft tissue (excludes bone) if the report separates it" },
        fat_free_mass_kg: { type: "number" },
        bone_mineral_content_kg: { type: "number" },
        appendicular_lean_mass_kg: { type: "number" },
        vat_mass_g: { type: "number", description: "visceral adipose tissue mass" },
        bone_density_t_score: { type: "number" },
        bone_density_z_score: { type: "number" },
        regional: { type: "object", additionalProperties: true, description: "e.g. {arms: {fat_kg, lean_kg}, legs: {...}, trunk: {...}, android_gynoid_ratio}" },
        facility: { type: "string" },
        notes: { type: "string" },
      },
      required: ["scan_date"],
    },
    handler: (ctx, a) => {
      const { scan_date, ...data } = a;
      return ctx.store.upsertDexa(scan_date, data);
    },
  },
  {
    name: "get_sync_status",
    title: "Apple Health sync status",
    description: "Which meal versions are not yet written to (or removed from) Apple Health, any device-side errors, and when the iPhone last checked in.",
    annotations: READ,
    inputSchema: { type: "object", properties: {} },
    handler: (ctx) => {
      const backlog = healthKitBacklog(ctx.store);
      return {
        pending: backlog.length,
        backlog: backlog.slice(0, 50),
        device_last_seen: ctx.store.getSetting("device_last_seen", null),
        device_last_report: ctx.store.getSetting("device_last_report", null),
        note: "The iPhone applies changes the next time it wakes: after the Camera-closed automation, a background refresh, or when the app is opened.",
      };
    },
  },
  {
    name: "get_processing_status",
    title: "Photo processing status",
    description: "Counts of photos by state (queued, logged, ignored, duplicate, failed...), the most recent photos and processing events, whether processing is paused, and whether an analyzer is configured.",
    annotations: READ,
    inputSchema: { type: "object", properties: { limit: { type: "integer", minimum: 1, maximum: 100 } } },
    handler: (ctx, a) => {
      const recent = ctx.store.db.prepare("SELECT id FROM photos ORDER BY captured_at DESC LIMIT ?").all(a.limit || 10).map((r) => presentPhoto(ctx.store.photo(r.id)));
      return { counts: ctx.store.photoCounts(), paused: getPolicy(ctx.store).paused, analyzer: ctx.analyzer ? ctx.analyzer.name : null, recent_photos: recent, recent_events: ctx.store.recentEvents(a.limit || 10) };
    },
  },
];

export const TOOL_MAP = new Map(TOOLS.map((t) => [t.name, t]));

// Minimal JSON-schema check for the shapes above: required keys and primitive types.
export function checkArgs(schema, args, path = "arguments") {
  if (schema.type === "object") {
    if (args == null || typeof args !== "object" || Array.isArray(args)) throw new Error(`${path} must be an object`);
    for (const r of schema.required || []) if (args[r] === undefined) throw new Error(`${path}.${r} is required`);
    for (const [k, v] of Object.entries(args)) {
      const s = schema.properties?.[k];
      if (s && v !== undefined && v !== null) checkArgs(s, v, `${path}.${k}`);
    }
  } else if (schema.type === "array") {
    if (!Array.isArray(args)) throw new Error(`${path} must be an array`);
    if (schema.minItems && args.length < schema.minItems) throw new Error(`${path} needs at least ${schema.minItems} item(s)`);
    args.forEach((x, i) => schema.items && checkArgs(schema.items, x, `${path}[${i}]`));
  } else if (schema.type === "string") {
    if (typeof args !== "string") throw new Error(`${path} must be a string`);
    if (schema.enum && !schema.enum.includes(args)) throw new Error(`${path} must be one of ${schema.enum.join(", ")}`);
    if (schema.pattern && !new RegExp(schema.pattern).test(args)) throw new Error(`${path} has the wrong format`);
  } else if (schema.type === "number" || schema.type === "integer") {
    if (typeof args !== "number" || !Number.isFinite(args)) throw new Error(`${path} must be a number`);
    if (schema.type === "integer" && !Number.isInteger(args)) throw new Error(`${path} must be an integer`);
    if (schema.minimum != null && args < schema.minimum) throw new Error(`${path} must be >= ${schema.minimum}`);
    if (schema.maximum != null && args > schema.maximum) throw new Error(`${path} must be <= ${schema.maximum}`);
  } else if (schema.type === "boolean") {
    if (typeof args !== "boolean") throw new Error(`${path} must be true or false`);
  }
}

export async function callTool(ctx, name, args = {}) {
  const tool = TOOL_MAP.get(name);
  if (!tool) throw Object.assign(new Error(`unknown tool ${name}`), { status: 404 });
  checkArgs(tool.inputSchema, args ?? {});
  const result = await tool.handler(ctx, args ?? {});
  ctx.store.logEvent("tool.call", name, { write: !tool.annotations.readOnlyHint });
  return result;
}
