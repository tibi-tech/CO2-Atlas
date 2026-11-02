import { useQuery } from "@tanstack/react-query";
import { Lock, LockOpen, Settings2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, NavLink, Outlet } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "./Auth";

export function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="8" fill="#1d3527" />
      <path d="M9 23c0-8 5-13 15-14-1 9-6 14-14 14" fill="#b9d531" />
      <path d="M9 23l8-8" stroke="#1d3527" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function NotFound() {
  const { t } = useTranslation();
  return (
    <div className="py-24 text-center">
      <p className="num text-sm text-muted">404</p>
      <h1 className="display mt-2 text-5xl">{t("common.notFound")}</h1>
      <Link to="/" className="btn btn-primary mt-8">{t("common.back")}</Link>
    </div>
  );
}

export default function Layout({ children }: { children?: React.ReactNode }) {
  const { t, i18n } = useTranslation();
  const auth = useAuth();
  const config = useQuery({ queryKey: ["config"], queryFn: api.config });
  const isPt = i18n.resolvedLanguage?.startsWith("pt");
  const navCls = ({ isActive }: { isActive: boolean }) =>
    `rounded-full px-3 py-1.5 text-sm font-medium transition ${isActive ? "bg-ink text-paper" : "text-ink-2 hover:bg-paper-2"}`;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b border-line/70 bg-paper/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-5 py-3">
          <Link to="/" className="flex items-center gap-2.5">
            <Logo />
            <span className="display text-lg font-semibold leading-none">{t("app.short")}</span>
          </Link>
          <nav className="ml-4 hidden items-center gap-1 sm:flex">
            <NavLink to="/" end className={navCls}>{t("nav.regions")}</NavLink>
            <NavLink to="/regions/new" className={navCls}>{t("nav.newRegion")}</NavLink>
            <NavLink to="/about" className={navCls}>{t("nav.about")}</NavLink>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <NavLink
              to="/settings" title={t("nav.settings")}
              className={({ isActive }) => `relative grid size-8 place-items-center rounded-full border border-line transition ${isActive ? "bg-ink text-paper" : "text-ink-2 hover:bg-paper-2"}`}
            >
              <Settings2 size={15} />
              {config.data && !config.data.copernicus_configured && (
                <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full border-2 border-paper bg-sienna" />
              )}
            </NavLink>
            {auth.required && (
              <button
                onClick={() => (auth.unlocked ? auth.lock() : auth.ensure())}
                className="btn btn-ghost !px-3 !py-1.5 text-xs"
                title={auth.unlocked ? t("auth.lock") : t("auth.submit")}
              >
                {auth.unlocked ? <LockOpen size={14} /> : <Lock size={14} />}
                <span className="hidden sm:inline">{auth.unlocked ? t("auth.unlocked") : t("auth.locked")}</span>
              </button>
            )}
            <div className="num flex rounded-full border border-line p-0.5 text-xs">
              {(["pt", "en"] as const).map((l) => (
                <button
                  key={l}
                  onClick={() => i18n.changeLanguage(l)}
                  className={`rounded-full px-2.5 py-1 uppercase transition ${(l === "pt") === !!isPt ? "bg-ink text-paper" : "text-ink-2"}`}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-4 pb-2 sm:hidden">
          <NavLink to="/" end className={navCls}>{t("nav.regions")}</NavLink>
          <NavLink to="/regions/new" className={navCls}>{t("nav.newRegion")}</NavLink>
          <NavLink to="/about" className={navCls}>{t("nav.about")}</NavLink>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-5 py-8">
        {children ?? <Outlet />}
      </main>
      <footer className="border-t border-line/70 py-6 text-center text-xs text-muted">
        <span className="num">Sentinel-2 · ESA WorldCover · NASA POWER · CASA</span>
        <span className="mx-2">·</span>
        <span>ISEL PFC</span>
      </footer>
    </div>
  );
}
