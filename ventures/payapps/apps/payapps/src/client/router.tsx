import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { Layout } from "./components/layout";
import { ForgotPasswordPage, ResetPasswordPage, VerifyEmailPage } from "./pages/account";
import { BillingPage } from "./pages/billing";
import { CashPage } from "./pages/cash";
import { CertifiedPayrollPage } from "./pages/certified-payroll";
import { CrewsPage } from "./pages/crews";
import { DailyReportsPage } from "./pages/daily-reports";
import { DocumentsPage } from "./pages/documents";
import { EstimatePage, EstimatesPage } from "./pages/estimates";
import { HomePage } from "./pages/home";
import { InsurancePage } from "./pages/insurance";
import { JobCostPage } from "./pages/job-cost";
import { LegalPage } from "./pages/legal";
import { OrgPage } from "./pages/org";
import { PayAppPage } from "./pages/pay-app";
import { PriceListPage } from "./pages/price-list";
import { ProjectPage } from "./pages/project";
import { QuickBooksPage } from "./pages/quickbooks";
import { SubmittalsPage } from "./pages/submittals";
import { SwornStatementPage } from "./pages/sworn-statement";
import { TeamPage } from "./pages/team";
import { TimesheetsPage } from "./pages/timesheets";
import { TmTicketsPage } from "./pages/tm-tickets";
import { UnsubscribePage } from "./pages/unsubscribe";
import { WipPage } from "./pages/wip";

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
const insuranceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/orgs/$orgId/insurance",
  component: InsurancePage,
});
const documentsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/orgs/$orgId/documents",
  component: DocumentsPage,
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
const jobCostRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/orgs/$orgId/projects/$projectId/job-cost",
  component: JobCostPage,
});
const certifiedPayrollRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/orgs/$orgId/projects/$projectId/certified-payroll",
  component: CertifiedPayrollPage,
});
const swornStatementRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/orgs/$orgId/projects/$projectId/sworn-statement",
  component: SwornStatementPage,
});
const submittalsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/orgs/$orgId/projects/$projectId/submittals",
  component: SubmittalsPage,
});
const estimatesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/orgs/$orgId/estimates",
  component: EstimatesPage,
});
const priceListRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/orgs/$orgId/price-list",
  component: PriceListPage,
});
const estimateRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/orgs/$orgId/estimates/$estimateId",
  component: EstimatePage,
});
const dailyReportsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/orgs/$orgId/projects/$projectId/daily-reports",
  component: DailyReportsPage,
});
const tmTicketsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/orgs/$orgId/projects/$projectId/tm-tickets",
  component: TmTicketsPage,
});
const crewsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/orgs/$orgId/crews",
  component: CrewsPage,
});
const timesheetsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/orgs/$orgId/timesheets",
  component: TimesheetsPage,
});
const wipRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/orgs/$orgId/wip",
  component: WipPage,
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
