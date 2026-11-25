// MCP over Streamable HTTP, stateless: every POST /mcp carries one JSON-RPC
// message (or a batch) and gets a plain application/json reply. No SSE stream
// is needed because the server never initiates messages.
import { TOOLS, callTool } from "./tools.mjs";

export const SUPPORTED_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26"];
export const SERVER_INFO = { name: "photo-nutrition-agent", title: "Photo Nutrition Agent", version: "0.1.0" };

const INSTRUCTIONS = [
  "Personal nutrition records built from the user's food photos, plus Apple Health weight and DEXA data.",
  "Values marked source=estimate are visual estimates with ranges; say so instead of quoting them as exact.",
  "To correct a meal, find it (find_meals or get_meals), then call update_meal with operations; corrections are versioned and flow to Apple Health on the phone's next wake.",
  "Don't raise pending reviews unless the user asks about accuracy or a total looks wrong.",
].join(" ");

export function toolList() {
  return TOOLS.map((t) => ({ name: t.name, title: t.title, description: t.description, inputSchema: t.inputSchema, annotations: { title: t.title, ...t.annotations } }));
}

function rpcError(id, code, message, data) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message, ...(data ? { data } : {}) } };
}

async function handleOne(ctx, msg) {
  if (!msg || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") return rpcError(msg?.id, -32600, "Invalid Request");
  const isNotification = msg.id === undefined;
  const reply = (result) => (isNotification ? null : { jsonrpc: "2.0", id: msg.id, result });
  switch (msg.method) {
    case "initialize": {
      const asked = msg.params?.protocolVersion;
      const protocolVersion = SUPPORTED_VERSIONS.includes(asked) ? asked : SUPPORTED_VERSIONS[0];
      return reply({ protocolVersion, capabilities: { tools: { listChanged: false } }, serverInfo: SERVER_INFO, instructions: INSTRUCTIONS });
    }
    case "notifications/initialized":
    case "notifications/cancelled":
      return null;
    case "ping":
      return reply({});
    case "tools/list":
      return reply({ tools: toolList() });
    case "tools/call": {
      const name = msg.params?.name;
      try {
        const result = await callTool(ctx, name, msg.params?.arguments ?? {});
        return reply({ content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result, isError: false });
      } catch (e) {
        if (e.status === 404) return rpcError(msg.id, -32602, e.message);
        // Tool errors go back as results so the model can read them and recover.
        return reply({ content: [{ type: "text", text: `Error: ${e.message}` }], isError: true });
      }
    }
    case "resources/list":
      return reply({ resources: [] });
    case "prompts/list":
      return reply({ prompts: [] });
    default:
      return isNotification ? null : rpcError(msg.id, -32601, `Method not found: ${msg.method}`);
  }
}

/** Returns { status, body } where body is null for notification-only input (HTTP 202). */
export async function handleMcp(ctx, payload) {
  if (Array.isArray(payload)) {
    if (!payload.length) return { status: 400, body: rpcError(null, -32600, "Empty batch") };
    const out = (await Promise.all(payload.map((m) => handleOne(ctx, m)))).filter(Boolean);
    return out.length ? { status: 200, body: out } : { status: 202, body: null };
  }
  const r = await handleOne(ctx, payload);
  return r ? { status: 200, body: r } : { status: 202, body: null };
}
