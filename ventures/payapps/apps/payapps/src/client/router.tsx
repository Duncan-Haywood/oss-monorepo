import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
} from "@tanstack/react-router";
import { Layout } from "./components/layout";
import { ForgotPasswordPage, ResetPasswordPage, VerifyEmailPage } from "./pages/account";
import { HomePage } from "./pages/home";
import { LegalPage } from "./pages/legal";
import { UnsubscribePage } from "./pages/unsubscribe";

// The sign-in page (home), the account-email links, legal and unsubscribe load with the app; every
// signed-in page loads on first visit (lazyRouteComponent), so a visitor signing up downloads the
// shell and the home page, not all of the app's pages (docs/history/payapps-app-first-load-perf-2026-11-27.md).
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
  component: lazyRouteComponent(() => import("./pages/org"), "OrgPage"),
});
const cashRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/orgs/$orgId/cash",
  component: lazyRouteComponent(() => import("./pages/cash"), "CashPage"),
});
const billingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/orgs/$orgId/billing",
  component: lazyRouteComponent(() => import("./pages/billing"), "BillingPage"),
});
const quickbooksRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/orgs/$orgId/quickbooks",
  component: lazyRouteComponent(() => import("./pages/quickbooks"), "QuickBooksPage"),
});
const insuranceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/orgs/$orgId/insurance",
  component: lazyRouteComponent(() => import("./pages/insurance"), "InsurancePage"),
});
const documentsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/orgs/$orgId/documents",
  component: lazyRouteComponent(() => import("./pages/documents"), "DocumentsPage"),
});
const teamRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/orgs/$orgId/team",
  component: lazyRouteComponent(() => import("./pages/team"), "TeamPage"),
});
const projectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/orgs/$orgId/projects/$projectId",
  component: lazyRouteComponent(() => import("./pages/project"), "ProjectPage"),
});
const jobCostRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/orgs/$orgId/projects/$projectId/job-cost",
  component: lazyRouteComponent(() => import("./pages/job-cost"), "JobCostPage"),
});
const certifiedPayrollRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/orgs/$orgId/projects/$projectId/certified-payroll",
  component: lazyRouteComponent(() => import("./pages/certified-payroll"), "CertifiedPayrollPage"),
});
const swornStatementRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/orgs/$orgId/projects/$projectId/sworn-statement",
  component: lazyRouteComponent(() => import("./pages/sworn-statement"), "SwornStatementPage"),
});
const submittalsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/orgs/$orgId/projects/$projectId/submittals",
  component: lazyRouteComponent(() => import("./pages/submittals"), "SubmittalsPage"),
});
const estimatesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/orgs/$orgId/estimates",
  component: lazyRouteComponent(() => import("./pages/estimates"), "EstimatesPage"),
});
const priceListRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/orgs/$orgId/price-list",
  component: lazyRouteComponent(() => import("./pages/price-list"), "PriceListPage"),
});
const estimateRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/orgs/$orgId/estimates/$estimateId",
  component: lazyRouteComponent(() => import("./pages/estimates"), "EstimatePage"),
});
const dailyReportsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/orgs/$orgId/projects/$projectId/daily-reports",
  component: lazyRouteComponent(() => import("./pages/daily-reports"), "DailyReportsPage"),
});
const tmTicketsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/orgs/$orgId/projects/$projectId/tm-tickets",
  component: lazyRouteComponent(() => import("./pages/tm-tickets"), "TmTicketsPage"),
});
const crewsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/orgs/$orgId/crews",
  component: lazyRouteComponent(() => import("./pages/crews"), "CrewsPage"),
});
const timesheetsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/orgs/$orgId/timesheets",
  component: lazyRouteComponent(() => import("./pages/timesheets"), "TimesheetsPage"),
});
const wipRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/orgs/$orgId/wip",
  component: lazyRouteComponent(() => import("./pages/wip"), "WipPage"),
});
const payAppRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/orgs/$orgId/projects/$projectId/pay-apps/$payAppId",
  component: lazyRouteComponent(() => import("./pages/pay-app"), "PayAppPage"),
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
    insuranceRoute,
    documentsRoute,
    quickbooksRoute,
    projectRoute,
    jobCostRoute,
    certifiedPayrollRoute,
    swornStatementRoute,
    submittalsRoute,
    estimatesRoute,
    estimateRoute,
    priceListRoute,
    dailyReportsRoute,
    tmTicketsRoute,
    wipRoute,
    crewsRoute,
    timesheetsRoute,
    payAppRoute,
  ]),
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
