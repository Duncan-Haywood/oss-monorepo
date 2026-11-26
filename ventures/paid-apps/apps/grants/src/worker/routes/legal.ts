// OWNER: privacy agent — public legal documents: GET /api/legal, GET /api/legal/:key
import { isLegalDocKey } from "@shared/legal";
import { Hono } from "hono";
import { notFound } from "../lib/errors";
import { getLegalDoc, listLegalDocs } from "../services/legal";
import type { AppEnv } from "../types";

const CACHE = "public, max-age=300";

const routes = new Hono<AppEnv>();

routes.get("/", (c) => {
  c.header("Cache-Control", CACHE);
  return c.json({ items: listLegalDocs() });
});

routes.get("/:key", (c) => {
  const key = c.req.param("key");
  if (!isLegalDocKey(key)) throw notFound("Legal document");
  c.header("Cache-Control", CACHE);
  return c.json(getLegalDoc(key));
});

export default routes;
