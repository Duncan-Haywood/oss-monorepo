// Code-based routes. Route components live in src/client/routes/*; this file only wires paths.
import { createRootRoute, createRoute, createRouter, Outlet } from "@tanstack/react-router";
import { ForgotPasswordPage, ResetPasswordPage, VerifyEmailPage } from "./routes/account";
import { BillingPage } from "./routes/billing";
import { OrgLayout } from "./routes/layout";
import { LegalPage } from "./routes/legal";
import { AuthPage, HomePage, InvitePage, OnboardingPage } from "./routes/public";
import { QuoteDetailPage } from "./routes/quote-detail";
import { QuoteLogPage } from "./routes/quote-log";
import { RateCardPage } from "./routes/rate-card";
import { RfqDetailPage } from "./routes/rfq-detail";
import { RfqsPage } from "./routes/rfqs";
import { RoutingsPage } from "./routes/routings";
import { TeamPage } from "./routes/team";
import { WinLossPage } from "./routes/win-loss";

const root = createRootRoute({
  component: Outlet,
  notFoundComponent: () => <p className="p-8 text-center">Page not found.</p>,
});
const home = createRoute({ getParentRoute: () => root, path: "/", component: HomePage });
const signIn = createRoute({
  getParentRoute: () => root,
  path: "/sign-in",
  component: () => <AuthPage mode="sign-in" />,
});
const signUp = createRoute({
  getParentRoute: () => root,
  path: "/sign-up",
  component: () => <AuthPage mode="sign-up" />,
});
// Account pages reached from email links (services/auth/emails.ts builds the links).
const forgotPassword = createRoute({
  getParentRoute: () => root,
  path: "/forgot-password",
  component: ForgotPasswordPage,
});
const resetPassword = createRoute({
  getParentRoute: () => root,
  path: "/reset-password",
  component: ResetPasswordPage,
});
const verifyEmail = createRoute({
  getParentRoute: () => root,
  path: "/verify-email",
  component: VerifyEmailPage,
});
// Public: the Terms, Privacy, Refund and Acceptable Use documents, readable before signing up.
const legal = createRoute({
  getParentRoute: () => root,
  path: "/legal/$key",
  component: LegalPage,
});
const onboarding = createRoute({
  getParentRoute: () => root,
  path: "/onboarding",
  component: OnboardingPage,
});
const invite = createRoute({
  getParentRoute: () => root,
  path: "/invite/$token",
  component: InvitePage,
});

const org = createRoute({ getParentRoute: () => root, path: "/app/$orgId", component: OrgLayout });
const quoteLog = createRoute({ getParentRoute: () => org, path: "/", component: QuoteLogPage });
const rateCard = createRoute({
  getParentRoute: () => org,
  path: "/rate-card",
  component: RateCardPage,
});
const routingsPage = createRoute({
  getParentRoute: () => org,
  path: "/routings",
  component: RoutingsPage,
});
const rfqs = createRoute({ getParentRoute: () => org, path: "/rfqs", component: RfqsPage });
const rfq = createRoute({
  getParentRoute: () => org,
  path: "/rfqs/$rfqId",
  component: RfqDetailPage,
});
const quote = createRoute({
  getParentRoute: () => org,
  path: "/quotes/$quoteId",
  component: QuoteDetailPage,
});
const winLoss = createRoute({
  getParentRoute: () => org,
  path: "/win-loss",
  component: WinLossPage,
});
const team = createRoute({ getParentRoute: () => org, path: "/team", component: TeamPage });
const billing = createRoute({
  getParentRoute: () => org,
  path: "/billing",
  component: BillingPage,
});

const routeTree = root.addChildren([
  home,
  signIn,
  signUp,
  forgotPassword,
  resetPassword,
  verifyEmail,
  legal,
  onboarding,
  invite,
  org.addChildren([quoteLog, winLoss, rateCard, routingsPage, rfqs, rfq, quote, team, billing]),
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
