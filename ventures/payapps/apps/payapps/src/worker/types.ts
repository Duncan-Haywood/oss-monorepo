import type { MemberRole } from "@shared/enums";
import type { AppContext } from "./context";
import type { Env } from "./env";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  /** The address is confirmed (emailed link or password reset). Required to accept an invitation. */
  emailVerified: boolean;
}

export interface Tenant {
  orgId: string;
  userId: string;
  role: MemberRole;
}

export interface AppEnv {
  Bindings: Env;
  Variables: {
    ctx: AppContext;
    requestId: string;
    user: SessionUser | null;
    tenant: Tenant;
  };
}
