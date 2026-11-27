// Code-based routes. Route components live in src/client/routes/*; this file only wires paths.
// The pages a signed-out visitor reaches (home, sign-in/up, account-email, legal, onboarding,
// invite) are static. Every signed-in page, the org layout and the customer quote page load on
// first visit (lazyRouteComponent), so a shop signing up downloads the sign-up page, not the
// whole app (docs/history/jobshop-quote-app-first-load-perf-2026-11-27.md).
import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  Outlet,
} from "@tanstack/react-router";
import { ForgotPasswordPage, ResetPasswordPage, VerifyEmailPage } from "./routes/account";
import { LegalPage } from "./routes/legal";
import { AuthPage, HomePage, InvitePage, OnboardingPage } from "./routes/public";

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

// Public: a customer link to one sent quote (services/quotes/customer-link.ts builds the links).
const customerQuote = createRoute({
  getParentRoute: () => root,
  path: "/q/$token",
  component: lazyRouteComponent(() => import("./routes/customer-quote"), "CustomerQuotePage"),
});

const org = createRoute({
  getParentRoute: () => root,
  path: "/app/$orgId",
  component: lazyRouteComponent(() => import("./routes/layout"), "OrgLayout"),
});
const quoteLog = createRoute({
  getParentRoute: () => org,
  path: "/",
  component: lazyRouteComponent(() => import("./routes/quote-log"), "QuoteLogPage"),
});
const rateCard = createRoute({
  getParentRoute: () => org,
  path: "/rate-card",
  component: lazyRouteComponent(() => import("./routes/rate-card"), "RateCardPage"),
});
const routingsPage = createRoute({
  getParentRoute: () => org,
  path: "/routings",
  component: lazyRouteComponent(() => import("./routes/routings"), "RoutingsPage"),
});
const rfqs = createRoute({
  getParentRoute: () => org,
  path: "/rfqs",
  component: lazyRouteComponent(() => import("./routes/rfqs"), "RfqsPage"),
});
const rfq = createRoute({
  getParentRoute: () => org,
  path: "/rfqs/$rfqId",
  component: lazyRouteComponent(() => import("./routes/rfq-detail"), "RfqDetailPage"),
});
const quote = createRoute({
  getParentRoute: () => org,
  path: "/quotes/$quoteId",
  component: lazyRouteComponent(() => import("./routes/quote-detail"), "QuoteDetailPage"),
});
const winLoss = createRoute({
  getParentRoute: () => org,
  path: "/win-loss",
  component: lazyRouteComponent(() => import("./routes/win-loss"), "WinLossPage"),
});
const team = createRoute({
  getParentRoute: () => org,
  path: "/team",
  component: lazyRouteComponent(() => import("./routes/team"), "TeamPage"),
});
const billing = createRoute({
  getParentRoute: () => org,
  path: "/billing",
  component: lazyRouteComponent(() => import("./routes/billing"), "BillingPage"),
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
  customerQuote,
  org.addChildren([quoteLog, winLoss, rateCard, routingsPage, rfqs, rfq, quote, team, billing]),
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
