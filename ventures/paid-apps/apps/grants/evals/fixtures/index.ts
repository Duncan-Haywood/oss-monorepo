// Registry of eval fixtures. Add a new org by creating a file next to this one and listing it here.
import { exampleValleyTrades } from "./example-valley-trades";
import { mesaLiteracy } from "./mesa-literacy";
import type { EvalOrg } from "./types";

export const EVAL_ORGS: EvalOrg[] = [exampleValleyTrades, mesaLiteracy];

export type { EvalFact, EvalOpportunity, EvalOrg, Fabrication, FabricationKind } from "./types";
