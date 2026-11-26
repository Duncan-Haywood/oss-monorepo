import { Hono } from "hono";
import type { AppEnv } from "../types";

const routes = new Hono<AppEnv>();
// `billing` says whether checkout is on (false until the owner sets the Paddle secrets); `email`
// whether account mail actually leaves the Worker (false until EMAIL_FROM and the binding are set).
routes.get("/", (c) =>
  c.json({
    ok: true,
    app: "seller-books",
    billing: c.var.ctx.billing !== null,
    email: c.var.ctx.email.delivers,
  }),
);
export default routes;
