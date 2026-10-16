// Turns a CRM's own webhook payload into a Deal Keeper deal, so the pipeline stays current with no glue code.
// Pure functions: no network, no state. server.mjs calls them from POST /v1/webhooks/<crm>.
//   Pipedrive: Tools > Webhooks, event "*.deal", URL https://you/v1/webhooks/pipedrive, HTTP auth password = API_KEY.
//   HubSpot:   Workflow action "Send a webhook" (POST, JSON), URL https://you/v1/webhooks/hubspot?key=<API_KEY>.

const num = (v) => (v == null || v === "" || !Number.isFinite(Number(v)) ? undefined : Number(v));
const str = (v) => (v == null || v === "" ? undefined : String(v));
/** Pipedrive sends "2026-01-02 10:00:00" in UTC; HubSpot sends ISO strings or epoch milliseconds. */
export function toIso(v) {
  if (v == null || v === "") return undefined;
  if (typeof v === "number" || /^\d{12,}$/.test(String(v))) return new Date(Number(v)).toISOString();
  const s = String(v).trim();
  return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s) ? `${s.replace(" ", "T")}Z` : s;
}
const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
/** A map like {"12":"qualified"} from a JSON env var; keys are the CRM's stage ids or names, lowercased. */
const lookup = (map, key) => (key == null ? undefined : (map || {})[String(key)] ?? (map || {})[String(key).toLowerCase()]);

/**
 * Pipedrive webhooks, v1 (`current`/`previous`, `event: "updated.deal"`) and v2 (`data`/`meta.action`).
 * Returns {deal} to upsert, {remove: id} to delete, or {skip: reason}. `stages` maps Pipedrive stage ids to your stage names.
 */
export function fromPipedrive(body, stages = {}) {
  const b = body || {};
  const action = String(b.event || (b.meta?.object ? `${{ create: "added", change: "updated", delete: "deleted" }[b.meta.action] || b.meta.action}.${b.meta.object}` : "")).toLowerCase();
  if (!action.endsWith(".deal")) return { skip: "not a deal event" };
  const d = (action.startsWith("deleted") ? b.previous || b.current || b.data : b.current || b.data);
  if (!d || d.id == null) return { skip: "no deal in payload" };
  const id = `pd-${d.id}`;
  if (action.startsWith("deleted")) return { remove: id };
  const status = ["open", "won", "lost"].includes(d.status) ? d.status : d.status === "deleted" ? "deleted" : undefined;
  if (status === "deleted") return { remove: id };
  const stage = lookup(stages, d.stage_id);
  return {
    deal: clean({ id, name: str(d.title), amount: num(d.value), stage, status,
      createdAt: toIso(d.add_time), stageAt: toIso(d.stage_change_time), closeDate: d.expected_close_date ? toIso(d.expected_close_date) : d.expected_close_date === null ? null : undefined,
      closedAt: status && status !== "open" ? toIso(d.close_time || d.won_time || d.lost_time) : undefined,
      lastActivityAt: toIso(d.last_activity_date), nextStep: str(d.next_activity_subject) }),
    warning: d.stage_id != null && !stage ? `stage ${d.stage_id} is not in PIPEDRIVE_STAGES; fields updated, stage left alone` : undefined,
  };
}

/**
 * HubSpot "Send a webhook" workflow action. Accepts flat properties ({dealname, amount, dealstage, ...}),
 * `{properties: {dealname: {value}}}` (the older shape) and `{fields: {...}}`. `stages` maps HubSpot dealstage ids to your names.
 */
export function fromHubspot(body, stages = {}) {
  const raw = body?.properties || body?.fields || body || {};
  const p = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, v && typeof v === "object" && "value" in v ? v.value : v]));
  const hsId = p.hs_object_id ?? p.dealId ?? p.objectId ?? body?.objectId ?? body?.dealId;
  if (hsId == null || hsId === "") return { skip: "no hs_object_id in payload" };
  const id = `hs-${hsId}`;
  const won = String(p.hs_is_closed_won) === "true", closed = String(p.hs_is_closed) === "true" || won;
  const stage = lookup(stages, p.dealstage);
  return {
    deal: clean({ id, name: str(p.dealname), amount: num(p.amount), stage, status: closed ? (won ? "won" : "lost") : undefined,
      createdAt: toIso(p.createdate), closeDate: p.closedate ? toIso(p.closedate) : undefined,
      closedAt: closed ? toIso(p.closedate) : undefined, lastActivityAt: toIso(p.notes_last_contacted || p.hs_lastmodifieddate), nextStep: str(p.hs_next_step) }),
    warning: p.dealstage != null && !stage ? `dealstage ${p.dealstage} is not in HUBSPOT_STAGES; fields updated, stage left alone` : undefined,
  };
}

export const CONNECTORS = { pipedrive: { map: fromPipedrive, env: "PIPEDRIVE_STAGES" }, hubspot: { map: fromHubspot, env: "HUBSPOT_STAGES" } };

/** Reads a stage map from an env var holding JSON. Bad JSON is an error at boot, not a silent empty map. */
export function stageMapFromEnv(env, name) {
  if (!env[name]) return {};
  let m; try { m = JSON.parse(env[name]); } catch { throw new Error(`${name} must be JSON like {"12":"qualified"}`); }
  if (!m || typeof m !== "object" || Array.isArray(m)) throw new Error(`${name} must be a JSON object`);
  return Object.fromEntries(Object.entries(m).map(([k, v]) => [String(k).toLowerCase(), String(v).toLowerCase()]));
}
