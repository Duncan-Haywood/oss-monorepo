// Worker entry: the early-access API (static pages are served by Workers static assets from dist/)
// and the daily purge of never-confirmed sign-ups.
import { createApp, stripBasePath } from "./app";
import { purgePending } from "./signups";

const app = createApp();

export default {
  fetch(request, env, ctx) {
    return app.fetch(stripBasePath(request, env.SITE_URL), env, ctx);
  },
  async scheduled(_controller, env) {
    const deleted = await purgePending(env.DB, new Date());
    console.log(JSON.stringify({ event: "early_access.purge", deleted }));
  },
} satisfies ExportedHandler<CloudflareBindings>;
