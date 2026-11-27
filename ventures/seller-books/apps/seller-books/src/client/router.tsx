// Code-based routes: paths -> components.
import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  Navigate,
  Outlet,
} from "@tanstack/react-router";
import { BASE_PATH } from "./lib/base-path";
import { ForgotPasswordPage, ResetPasswordPage, VerifyEmailPage } from "./routes/account";
import { LegalPage } from "./routes/legal";
import { InvitePage, LoginPage, OrgsPage, SignupPage } from "./routes/public";
import { UnsubscribePage } from "./routes/unsubscribe";

// The signed-in pages (everything under /o/$orgId) load on demand: a visitor's first page is the
// sign-up or sign-in screen, which should not download the books, imports and tax views first
// (docs/history/seller-books-app-first-load-perf-2026-11-27.md). Public pages stay static.

const rootRoute = createRootRoute({
  component: Outlet,
  notFoundComponent: () => <p className="p-8">Page not found.</p>,
});

const index = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: () => <Navigate to="/orgs" />,
});
const login = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  component: LoginPage,
});
const signup = createRoute({
  getParentRoute: () => rootRoute,
  path: "/signup",
  component: SignupPage,
});
// Public: account pages opened from the emailed links (services/auth/emails.ts on the worker).
const forgotPassword = createRoute({
  getParentRoute: () => rootRoute,
  path: "/forgot-password",
  component: ForgotPasswordPage,
});
const resetPassword = createRoute({
  getParentRoute: () => rootRoute,
  path: "/reset-password",
  component: ResetPasswordPage,
});
const verifyEmail = createRoute({
  getParentRoute: () => rootRoute,
  path: "/verify-email",
  component: VerifyEmailPage,
});
// Public: the reminder email's signed stop link (routes/unsubscribe.tsx); no sign-in.
const unsubscribe = createRoute({
  getParentRoute: () => rootRoute,
  path: "/unsubscribe",
  component: UnsubscribePage,
});
// Public: the Terms, Privacy, Refund and Acceptable Use documents, readable before signing up.
const legal = createRoute({
  getParentRoute: () => rootRoute,
  path: "/legal/$key",
  component: LegalPage,
});
const orgs = createRoute({ getParentRoute: () => rootRoute, path: "/orgs", component: OrgsPage });
const invite = createRoute({
  getParentRoute: () => rootRoute,
  path: "/invite",
  component: InvitePage,
});

const org = createRoute({
  getParentRoute: () => rootRoute,
  path: "/o/$orgId",
  component: lazyRouteComponent(() => import("./routes/org"), "OrgLayout"),
});
const pnl = createRoute({
  getParentRoute: () => org,
  path: "/",
  component: lazyRouteComponent(() => import("./routes/org"), "PnlPage"),
});
const imports = createRoute({
  getParentRoute: () => org,
  path: "/imports",
  component: lazyRouteComponent(() => import("./routes/imports"), "ImportsPage"),
});
const sales = createRoute({
  getParentRoute: () => org,
  path: "/sales",
  component: lazyRouteComponent(() => import("./routes/imports"), "SalesPage"),
});
const inventory = createRoute({
  getParentRoute: () => org,
  path: "/inventory",
  component: lazyRouteComponent(() => import("./routes/inventory"), "InventoryPage"),
});
const stock = createRoute({
  getParentRoute: () => org,
  path: "/stock",
  component: lazyRouteComponent(() => import("./routes/stock"), "StockPage"),
});
const mileage = createRoute({
  getParentRoute: () => org,
  path: "/mileage",
  component: lazyRouteComponent(() => import("./routes/logs"), "MileagePage"),
});
const expenses = createRoute({
  getParentRoute: () => org,
  path: "/expenses",
  component: lazyRouteComponent(() => import("./routes/logs"), "ExpensesPage"),
});
const scheduleC = createRoute({
  getParentRoute: () => org,
  path: "/schedule-c",
  component: lazyRouteComponent(() => import("./routes/tax"), "ScheduleCPage"),
});
const estimatedTax = createRoute({
  getParentRoute: () => org,
  path: "/estimated-tax",
  component: lazyRouteComponent(() => import("./routes/estimated-tax"), "EstimatedTaxPage"),
});
const form1099k = createRoute({
  getParentRoute: () => org,
  path: "/1099k",
  component: lazyRouteComponent(() => import("./routes/tax"), "Form1099kPage"),
});
const members = createRoute({
  getParentRoute: () => org,
  path: "/members",
  component: lazyRouteComponent(() => import("./routes/tax"), "MembersPage"),
});

const settings = createRoute({
  getParentRoute: () => org,
  path: "/settings",
  component: lazyRouteComponent(() => import("./routes/settings"), "SettingsPage"),
});

const billing = createRoute({
  getParentRoute: () => org,
  path: "/billing",
  component: lazyRouteComponent(() => import("./routes/billing"), "BillingPage"),
});

const routeTree = rootRoute.addChildren([
  index,
  login,
  signup,
  forgotPassword,
  resetPassword,
  verifyEmail,
  unsubscribe,
  legal,
  orgs,
  invite,
  org.addChildren([
    pnl,
    imports,
    sales,
    inventory,
    stock,
    mileage,
    expenses,
    scheduleC,
    estimatedTax,
    form1099k,
    members,
    billing,
    settings,
  ]),
]);

// BASE_PATH ("" in dev and tests; a prefix like "/seller-books/app" in a prefixed build): links and
// history get the prefix, routes stay as written.
export const router = createRouter({ routeTree, basepath: BASE_PATH || "/" });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
