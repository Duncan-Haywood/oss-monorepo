// Code-based routes: paths -> components.
import {
  createRootRoute,
  createRoute,
  createRouter,
  Navigate,
  Outlet,
} from "@tanstack/react-router";
import { BASE_PATH } from "./lib/base-path";
import { ForgotPasswordPage, ResetPasswordPage, VerifyEmailPage } from "./routes/account";
import { BillingPage } from "./routes/billing";
import { EstimatedTaxPage } from "./routes/estimated-tax";
import { ImportsPage, SalesPage } from "./routes/imports";
import { InventoryPage } from "./routes/inventory";
import { LegalPage } from "./routes/legal";
import { ExpensesPage, MileagePage } from "./routes/logs";
import { OrgLayout, PnlPage } from "./routes/org";
import { InvitePage, LoginPage, OrgsPage, SignupPage } from "./routes/public";
import { SettingsPage } from "./routes/settings";
import { StockPage } from "./routes/stock";
import { Form1099kPage, MembersPage, ScheduleCPage } from "./routes/tax";
import { UnsubscribePage } from "./routes/unsubscribe";

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
  component: OrgLayout,
});
const pnl = createRoute({ getParentRoute: () => org, path: "/", component: PnlPage });
const imports = createRoute({
  getParentRoute: () => org,
  path: "/imports",
  component: ImportsPage,
});
const sales = createRoute({ getParentRoute: () => org, path: "/sales", component: SalesPage });
const inventory = createRoute({
  getParentRoute: () => org,
  path: "/inventory",
  component: InventoryPage,
});
const stock = createRoute({ getParentRoute: () => org, path: "/stock", component: StockPage });
const mileage = createRoute({
  getParentRoute: () => org,
  path: "/mileage",
  component: MileagePage,
});
const expenses = createRoute({
  getParentRoute: () => org,
  path: "/expenses",
  component: ExpensesPage,
});
const scheduleC = createRoute({
  getParentRoute: () => org,
  path: "/schedule-c",
  component: ScheduleCPage,
});
const estimatedTax = createRoute({
  getParentRoute: () => org,
  path: "/estimated-tax",
  component: EstimatedTaxPage,
});
const form1099k = createRoute({
  getParentRoute: () => org,
  path: "/1099k",
  component: Form1099kPage,
});
const members = createRoute({
  getParentRoute: () => org,
  path: "/members",
  component: MembersPage,
});

const settings = createRoute({
  getParentRoute: () => org,
  path: "/settings",
  component: SettingsPage,
});

const billing = createRoute({
  getParentRoute: () => org,
  path: "/billing",
  component: BillingPage,
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
