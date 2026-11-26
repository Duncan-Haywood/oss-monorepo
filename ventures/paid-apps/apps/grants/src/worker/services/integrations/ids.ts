// Prefixed ids for this module's tables. lib/ids.ts has a closed prefix union owned by the
// foundation; until "itg" | "dlv" | "slr" are added there, reuse its generator and swap the prefix.
import { newId } from "../../lib/ids";

export type IntegrationIdPrefix = "itg" | "dlv" | "slr";

export function integrationId(prefix: IntegrationIdPrefix): string {
  return `${prefix}_${newId("job").slice("job_".length)}`;
}
