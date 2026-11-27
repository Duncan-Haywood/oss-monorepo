// Public reference data: the supported reports, where fees come from, and Form 1099-K threshold notes.
import { MAPPED_PLATFORMS } from "@shared/column-mapping";
import { PLATFORM_LABELS } from "@shared/enums";
import { FEE_SOURCES } from "@shared/reference/fee-sources";
import { FEDERAL_1099K, OMITTED_STATES, STATE_1099K } from "@shared/reference/form-1099k";
import { Hono } from "hono";
import { REPORTS } from "../services/importers";
import type { AppEnv } from "../types";

const routes = new Hono<AppEnv>();

routes.get("/reports", (c) =>
  c.json({
    items: Object.entries(REPORTS).map(([key, r]) => ({
      key,
      platform: r.platform,
      platformLabel: PLATFORM_LABELS[r.platform],
      label: r.label,
    })),
    // Imported through the column-mapped CSV: the seller says which column is which.
    mapped: MAPPED_PLATFORMS.map((p) => ({ platform: p, platformLabel: PLATFORM_LABELS[p] })),
  }),
);
routes.get("/fee-sources", (c) => c.json({ items: FEE_SOURCES }));
routes.get("/1099k", (c) =>
  c.json({ federal: FEDERAL_1099K, states: STATE_1099K, omitted: OMITTED_STATES }),
);

export default routes;
