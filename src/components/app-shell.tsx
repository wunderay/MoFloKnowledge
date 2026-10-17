"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { UnsavedNavigationProvider } from "./unsaved-navigation";
import { CloudBrand, Icon, type IconName } from "./icons";

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const search = useSearchParams();
  const companyId = path.startsWith("/knowledge") ? search.get("companyId") : null;
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState("");
  const links: { href: string; label: string; icon: IconName; active: boolean }[] = [
    { href: "/dashboard", label: "Companies", icon: "companies", active: path === "/dashboard" },
    ...(companyId ? [
      { href: `/knowledge?companyId=${encodeURIComponent(companyId)}`, label: "Company workspace", icon: "workspace" as const, active: path === "/knowledge" },
      { href: `/knowledge/view?companyId=${encodeURIComponent(companyId)}`, label: "Company profile", icon: "profile" as const, active: path === "/knowledge/view" },
    ] : []),
  ];
  return (
    <UnsavedNavigationProvider>
      <div className="app-shell">
        <header className="app-shell__topbar">
          <Link href="/dashboard" aria-label="MoFlo Cloud home"><CloudBrand /></Link>
          <div className="app-shell__account">
            <span className="app-shell__privacy"><Icon name="lock" size={14} /> Private workspace</span>
            <span className="app-shell__account-divider" aria-hidden="true" />
            <span className="avatar" title="Company workspace"><Icon name="workspace" size={17} /></span>
            <button
              type="button"
              className="button button--quiet app-shell__sign-out"
              data-leave-workspace
              disabled={signingOut}
              onClick={async () => {
                setSigningOut(true);
                setSignOutError("");
                try {
                  const response = await fetch("/api/auth/sign-out", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: "{}",
                  });
                  if (!response.ok) throw new Error("Unable to sign out. Please retry.");
                  window.location.assign("/sign-in");
                } catch {
                  setSignOutError("Unable to sign out. Please retry.");
                  setSigningOut(false);
                }
              }}
            >
              <Icon name="sign-out" size={16} />
              <span>{signingOut ? "Signing out…" : "Sign out"}</span>
            </button>
          </div>
        </header>
        <aside className="app-shell__sidebar">
          <nav aria-label="Main navigation" className="app-shell__navigation">
            {links.map((link) => (
              <Link key={link.href} href={link.href} title={link.label}
                aria-current={link.active ? "page" : undefined}
                className={`app-shell__link${link.active ? " app-shell__link--active" : ""}`}>
                <Icon name={link.icon} size={22} />
                <span className="sr-only">{link.label}</span>
              </Link>
            ))}
          </nav>
          <span className="app-shell__rail-note" title="Private to your workspace members">
            <Icon name="lock" size={19} />
            <span className="sr-only">Private to workspace members</span>
          </span>
        </aside>
        <div className="app-shell__body">
          <main id="main-content" className="app-shell__main">
            {signOutError && <p className="notice notice--error" role="alert">{signOutError}</p>}
            {children}
          </main>
        </div>
      </div>
    </UnsavedNavigationProvider>
  );
}
