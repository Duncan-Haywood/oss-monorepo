// Code-based routes (no generated route tree, so modules can be built in parallel).
// Route components live in src/client/routes/**; this file only wires paths -> components.
import { createRootRoute, createRoute, createRouter, Outlet } from "@tanstack/react-router";
import { OrgLayout } from "./components/layout/org-layout";
import { PublicLayout } from "./components/layout/public-layout";
import { BASE_PATH } from "./lib/base-path";
import { AdminPage } from "./routes/admin/admin";
import { AboutPage } from "./routes/marketing/about";
import { ContactPage } from "./routes/marketing/contact";
import { DemoPage } from "./routes/marketing/demo";
import { FaqPage } from "./routes/marketing/faq";
import { HowItWorksPage } from "./routes/marketing/how-it-works";
import { NewsletterConfirmPage, UnsubscribePage } from "./routes/marketing/newsletter";
import { PricingPage } from "./routes/marketing/pricing";
import { ResourceArticlePage } from "./routes/marketing/resource-article";
import { ResourcesPage } from "./routes/marketing/resources";
import { TrustPage } from "./routes/marketing/trust";
import { WorkforcePage } from "./routes/marketing/workforce";
import { OnboardingPage } from "./routes/onboarding/onboarding";
import { ApplicationDetailPage } from "./routes/org/applications/application-detail";
import { ApplicationsPage } from "./routes/org/applications/applications";
import { AwardDetailPage } from "./routes/org/awards/award-detail";
import { AwardsPage } from "./routes/org/awards/awards";
import { DashboardPage } from "./routes/org/dashboard";
import { FunderDetailPage } from "./routes/org/funders/funder-detail";
import { FundersPage } from "./routes/org/funders/funders";
import { HelpCenterPage } from "./routes/org/help";
import { InterviewSessionPage } from "./routes/org/interviews/interview-session";
import { InterviewsPage } from "./routes/org/interviews/interviews";
import { DocumentDetailPage } from "./routes/org/knowledge/document-detail";
import { DocumentsPage } from "./routes/org/knowledge/documents";
import { FactsPage, validateFactsSearch } from "./routes/org/knowledge/facts";
import { SearchPage } from "./routes/org/knowledge/search";
import { OpportunityInboxPage } from "./routes/org/opportunities/inbox";
import { OpportunitiesPage } from "./routes/org/opportunities/opportunities";
import { OpportunityDetailPage } from "./routes/org/opportunities/opportunity-detail";
import { ProjectDetailPage } from "./routes/org/projects/project-detail";
import { ProjectsPage } from "./routes/org/projects/projects";
import { ReviewsPage } from "./routes/org/reviews/reviews";
import { AccountSettingsPage } from "./routes/org/settings/account";
import { ApprovalSettingsPage } from "./routes/org/settings/approvals";
import { AutopilotSettingsPage } from "./routes/org/settings/autopilot";
import { BillingSettingsPage } from "./routes/org/settings/billing";
import { CalendarSettingsPage } from "./routes/org/settings/calendar";
import { GeneralSettingsPage } from "./routes/org/settings/general";
import { IntegrationsSettingsPage } from "./routes/org/settings/integrations";
import { MembersSettingsPage } from "./routes/org/settings/members";
import { PrivacySettingsPage } from "./routes/org/settings/privacy";
import { SourcingPage } from "./routes/org/sourcing/sourcing";
import { SubmissionsPage } from "./routes/org/submissions/submissions";
import { AcceptInvitePage } from "./routes/public/accept-invite";
import { ForgotPasswordPage } from "./routes/public/forgot-password";
import { LandingPage } from "./routes/public/landing";
import { LegalPage } from "./routes/public/legal";
import { LetterUploadPage } from "./routes/public/letter-upload";
import { LoginPage } from "./routes/public/login";
import { NotFoundPage } from "./routes/public/not-found";
import { ResetPasswordPage } from "./routes/public/reset-password";
import { SignupPage } from "./routes/public/signup";
import { VerifyEmailPage } from "./routes/public/verify-email";

const rootRoute = createRootRoute({ component: Outlet });

const publicLayout = createRoute({
  getParentRoute: () => rootRoute,
  id: "public",
  component: PublicLayout,
});
const landing = createRoute({
  getParentRoute: () => publicLayout,
  path: "/",
  component: LandingPage,
});
const login = createRoute({
  getParentRoute: () => publicLayout,
  path: "/login",
  component: LoginPage,
});
const signup = createRoute({
  getParentRoute: () => publicLayout,
  path: "/signup",
  component: SignupPage,
});
/** $doc: terms | privacy | refunds | data-use */
const legal = createRoute({
  getParentRoute: () => publicLayout,
  path: "/legal/$doc",
  component: LegalPage,
});
const acceptInvite = createRoute({
  getParentRoute: () => publicLayout,
  path: "/invite/$invitationId",
  component: AcceptInvitePage,
});
/** Links from account emails: ?token=… */
const verifyEmail = createRoute({
  getParentRoute: () => publicLayout,
  path: "/verify-email",
  component: VerifyEmailPage,
});
const forgotPassword = createRoute({
  getParentRoute: () => publicLayout,
  path: "/forgot-password",
  component: ForgotPasswordPage,
});
const resetPassword = createRoute({
  getParentRoute: () => publicLayout,
  path: "/reset-password",
  component: ResetPasswordPage,
});

/** Newsletter double opt-in and one-click unsubscribe pages (links from emails; not prerendered). */
const newsletterConfirm = createRoute({
  getParentRoute: () => publicLayout,
  path: "/newsletter/confirm",
  component: NewsletterConfirmPage,
});
const unsubscribe = createRoute({
  getParentRoute: () => publicLayout,
  path: "/unsubscribe",
  component: UnsubscribePage,
});

/** Partner letter-of-support upload link from the request email (no login). */
const letterUpload = createRoute({
  getParentRoute: () => publicLayout,
  path: "/letters/$token",
  component: LetterUploadPage,
});
const onboarding = createRoute({
  getParentRoute: () => publicLayout,
  path: "/onboarding",
  component: OnboardingPage,
});

/** Platform admin console; the API enforces access (non-admins see "Not authorized"). */
const admin = createRoute({
  getParentRoute: () => publicLayout,
  path: "/admin",
  component: AdminPage,
});

/** Public marketing pages (prerendered at build; see src/client/marketing-routes.ts). */
const marketing = <TPath extends string>(path: TPath, component: () => React.JSX.Element) =>
  createRoute({ getParentRoute: () => publicLayout, path, component });
const marketingRoutes = [
  marketing("/how-it-works", HowItWorksPage),
  marketing("/pricing", () => PricingPage()),
  marketing("/trust", TrustPage),
  marketing("/faq", () => FaqPage()),
  marketing("/about", AboutPage),
  marketing("/contact", ContactPage),
  marketing("/for-workforce-programs", WorkforcePage),
  marketing("/resources", ResourcesPage),
  marketing("/resources/$slug", ResourceArticlePage),
  marketing("/demo", DemoPage),
] as const;

const orgLayout = createRoute({
  getParentRoute: () => rootRoute,
  path: "/orgs/$orgId",
  component: OrgLayout,
});
const r = <TPath extends string>(path: TPath, component: () => React.JSX.Element) =>
  createRoute({ getParentRoute: () => orgLayout, path, component });
/** ?status=proposed|confirmed|rejected|superseded|all (or CSV) & ?factId= (deep link to one fact). */
const facts = createRoute({
  getParentRoute: () => orgLayout,
  path: "/knowledge/facts",
  component: FactsPage,
  validateSearch: validateFactsSearch,
});

const routeTree = rootRoute.addChildren([
  publicLayout.addChildren([
    landing,
    ...marketingRoutes,
    login,
    signup,
    legal,
    newsletterConfirm,
    unsubscribe,
    acceptInvite,
    onboarding,
    verifyEmail,
    forgotPassword,
    resetPassword,
    letterUpload,
    admin,
  ]),
  orgLayout.addChildren([
    r("/", DashboardPage),
    r("/knowledge/documents", DocumentsPage),
    r("/knowledge/documents/$documentId", DocumentDetailPage),
    facts,
    r("/knowledge/search", SearchPage),
    r("/projects", ProjectsPage),
    r("/projects/$projectId", ProjectDetailPage),
    r("/interviews", InterviewsPage),
    r("/interviews/$interviewId", InterviewSessionPage),
    r("/opportunities", OpportunitiesPage),
    r("/opportunities/inbox", OpportunityInboxPage),
    r("/opportunities/$opportunityId", OpportunityDetailPage),
    r("/sourcing", SourcingPage),
    r("/funders", () => FundersPage()),
    r("/funders/$funderId", () => FunderDetailPage()),
    r("/applications", ApplicationsPage),
    r("/applications/$applicationId", ApplicationDetailPage),
    r("/reviews", ReviewsPage),
    r("/submissions", SubmissionsPage),
    r("/awards", AwardsPage),
    r("/awards/$awardId", AwardDetailPage),
    r("/settings/general", GeneralSettingsPage),
    r("/settings/members", MembersSettingsPage),
    r("/settings/autopilot", AutopilotSettingsPage),
    r("/settings/approvals", ApprovalSettingsPage),
    r("/settings/privacy", PrivacySettingsPage),
    r("/settings/integrations", IntegrationsSettingsPage),
    r("/settings/billing", BillingSettingsPage),
    r("/settings/calendar", CalendarSettingsPage),
    r("/settings/account", AccountSettingsPage),
    r("/help", HelpCenterPage),
  ]),
]);

export const router = createRouter({
  routeTree,
  // "/grants" in production (BASE_PATH at build time); links and history get the prefix.
  basepath: BASE_PATH || "/",
  defaultPreload: "intent",
  defaultNotFoundComponent: NotFoundPage,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
