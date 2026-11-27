import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { Layout } from "./components/layout";
import { ForgotPasswordPage, ResetPasswordPage, VerifyEmailPage } from "./pages/account";
import { BillingPage } from "./pages/billing";
import { CashPage } from "./pages/cash";
import { HomePage } from "./pages/home";
import { LegalPage } from "./pages/legal";
import { OrgPage } from "./pages/org";
import { PayAppPage } from "./pages/pay-app";
import { ProjectPage } from "./pages/project";
import { QuickBooksPage } from "./pages/quickbooks";
import { TeamPage } from "./pages/team";
import { UnsubscribePage } from "./pages/unsubscribe";

const rootRoute = createRootRoute({ component: Layout });
const homeRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: HomePage });
const forgotPasswordRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/forgot-password",
  component: ForgotPasswordPage,
});
const resetPasswordRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/reset-password",
  component: ResetPasswordPage,
});
const verifyEmailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/verify-email",
  component: VerifyEmailPage,
});
// The link in an invitation email: the home page, which lists invitations once signed in.
const invitationsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/invitations",
  component: HomePage,
});
// The weekly email's and the getting-started reminders' signed "stop" links: work signed out
// (pages/unsubscribe.tsx).
const unsubscribeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/unsubscribe",
  component: UnsubscribePage,
});
const legalRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/legal/$key",
  component: LegalPage,
});
const orgRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/orgs/$orgId",
  component: OrgPage,
});
const cashRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/orgs/$orgId/cash",
  component: CashPage,
});
const billingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/orgs/$orgId/billing",
  component: BillingPage,
});
const quickbooksRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/orgs/$orgId/quickbooks",
  component: QuickBooksPage,
});
const teamRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/orgs/$orgId/team",
  component: TeamPage,
});
const projectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/orgs/$orgId/projects/$projectId",
  component: ProjectPage,
});
const payAppRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/orgs/$orgId/projects/$projectId/pay-apps/$payAppId",
  component: PayAppPage,
});

export const router = createRouter({
  routeTree: rootRoute.addChildren([
    homeRoute,
    forgotPasswordRoute,
    resetPasswordRoute,
    verifyEmailRoute,
    invitationsRoute,
    unsubscribeRoute,
    legalRoute,
    orgRoute,
    billingRoute,
    cashRoute,
    teamRoute,
    quickbooksRoute,
    projectRoute,
    payAppRoute,
  ]),
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
