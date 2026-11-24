// OpenAPI 3.1 for a ChatGPT Custom GPT's Actions: the fallback that works on
// any paid ChatGPT plan, in the iOS app, without developer mode. Each tool is
// one POST operation at /api/tools/<name> whose body is the tool's arguments.
import { TOOLS } from "./tools.mjs";
import { SERVER_INFO } from "./mcp.mjs";

export function openApiDoc(baseUrl) {
  const paths = {};
  for (const t of TOOLS) {
    paths[`/api/tools/${t.name}`] = {
      post: {
        operationId: t.name,
        summary: t.title,
        // GPT Actions cap descriptions at 300 characters.
        description: t.description.length > 300 ? `${t.description.slice(0, 297)}...` : t.description,
        ...(t.annotations.readOnlyHint ? {} : { "x-openai-isConsequential": !!t.annotations.destructiveHint }),
        requestBody: { required: true, content: { "application/json": { schema: t.inputSchema } } },
        responses: {
          200: { description: "Result", content: { "application/json": { schema: { type: "object", additionalProperties: true } } } },
          400: { description: "Invalid arguments or a correction that can't apply; the message says why" },
          401: { description: "Missing or wrong bearer token" },
        },
      },
    };
  }
  return {
    openapi: "3.1.0",
    info: { title: SERVER_INFO.title, version: SERVER_INFO.version, description: "Read and correct personal nutrition records logged automatically from food photos." },
    servers: [{ url: baseUrl.replace(/\/$/, "") }],
    paths,
    components: { schemas: {}, securitySchemes: { bearer: { type: "http", scheme: "bearer" } } },
    security: [{ bearer: [] }],
  };
}
