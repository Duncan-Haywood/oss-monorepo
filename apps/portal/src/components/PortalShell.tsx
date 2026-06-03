import type { ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { clearSession, readSession } from "../auth/demoAuth";
import { DemoTour } from "./DemoTour";
import { storeProfile } from "../data/demoStore";

const nav = [
  { to: "/", label: "Overview", end: true },
  { to: "/funnel", label: "Funnel" },
  { to: "/products", label: "Products" },
  { to: "/experiments", label: "Experiments" },
  { to: "/value", label: "Business value" },
  { to: "/trust", label: "Privacy & trust" },
] as const;

export function PortalShell({
  children,
  title,
  subtitle,
}: {
  children: ReactNode;
  title: string;
  subtitle?: string;
}) {
  const navigate = useNavigate();
  const session = readSession();

  function signOut() {
    clearSession();
    navigate("/login", { replace: true });
  }

  return (
    <div className="portal-layout">
      <aside className="portal-sidebar">
        <div className="brand">
          <span className="brand-mark">RPI</span>
          <div>
            <strong>{storeProfile.name}</strong>
            <span>{storeProfile.location}</span>
          </div>
        </div>

        <nav aria-label="Portal sections">
          {nav.map(({ to, label, ...rest }) => (
            <NavLink
              key={to}
              to={to}
              end={"end" in rest ? rest.end : false}
              className={({ isActive }) =>
                isActive ? "nav-link active" : "nav-link"
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-meta">
          <span className="pill pill-demo">Illustrative data</span>
          <p>{storeProfile.pilotWeek}</p>
          <p className="muted">{storeProfile.lastSync}</p>
          <p className="role-tag">
            Signed in as <strong>{session?.role ?? "operator"}</strong>
          </p>
          <button type="button" className="btn-ghost" onClick={signOut}>
            Sign out
          </button>
        </div>
      </aside>

      <div className="portal-main">
        <header className="portal-header">
          <div>
            <h1>{title}</h1>
            {subtitle ? <p className="header-sub">{subtitle}</p> : null}
          </div>
          <div className="header-badges">
            <span className="pill pill-ok">Edge online</span>
            <span className="pill pill-secure">LAN-only demo</span>
          </div>
        </header>
        <main className="portal-content">{children}</main>
        <DemoTour />
      </div>
    </div>
  );
}
