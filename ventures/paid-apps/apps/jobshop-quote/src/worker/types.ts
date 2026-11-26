import type { MemberRole } from "@shared/enums";
import type { AppContext } from "./context";
import type { Env } from "./env";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
}

/** Set by requireOrg(): the caller's verified membership in the org named by :orgId. */
export interface Tenant {
  orgId: string;
  userId: string;
  role: MemberRole;
}

export type AppEnv = {
  Bindings: Env;
  Variables: {
    ctx: AppContext;
    requestId: string;
    user: SessionUser | null;
    tenant: Tenant;
  };
};
