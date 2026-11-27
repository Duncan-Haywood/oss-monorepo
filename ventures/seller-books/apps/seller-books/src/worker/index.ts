import { createApp } from "./app";
import type { Env } from "./env";
import { createFetchHandler } from "./http";

const fetch = createFetchHandler(createApp());

export default {
  fetch: (request, env, ctx) => fetch(request, env, ctx),
} satisfies ExportedHandler<Env>;
