import { useQuery } from "@tanstack/react-query";
import { ArrowRight, ArrowUpRight, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { RegionShape, StatusBadge } from "../components/ui";
import { fmt, period } from "../i18n";

export default function Home() {
  const { t } = useTranslation();
  const regions = useQuery({ queryKey: ["regions"], queryFn: api.regions });
  const runs = useQuery({ queryKey: ["runs"], queryFn: () => api.runs(), refetchInterval: 5000 });
  const config = useQuery({ queryKey: ["config"], queryFn: api.config });
  const regionName = (id: number) => regions.data?.find((r) => r.id === id)?.name ?? `#${id}`;
  const highlight = runs.data?.find((r) => r.status === "done" && r.result);
  const steps = t("home.steps", { returnObjects: true, max: fmt(config.data?.max_region_km2) }) as string[][];

  return (
    <div className="space-y-16">
      <section className="grid items-end gap-10 pt-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,1fr)]">
        <div className="min-w-0">
          <p className="eyebrow rise">{t("app.name")}</p>
          <h1 className="display rise rise-1 mt-4 text-5xl leading-[1.05] sm:text-6xl xl:text-7xl">
            {t("home.hero1")}{" "}
            <em className="relative font-medium text-moss not-italic [text-decoration:none]">
              {t("home.hero2")}
              <svg className="absolute -bottom-2 left-0 w-full" viewBox="0 0 300 12" preserveAspectRatio="none" aria-hidden>
                <path d="M2 8 C 60 2, 140 12, 298 4" stroke="#b9d531" strokeWidth="5" fill="none" strokeLinecap="round" />
              </svg>
            </em>
            <br />
            <span className="italic text-ink-2">{t("home.hero3")}</span>
          </h1>
          <p className="rise rise-2 mt-7 max-w-xl text-lg leading-relaxed text-ink-2">{t("home.lead")}</p>
          <div className="rise rise-3 mt-8 flex flex-wrap gap-3">
            <Link to="/regions/new" className="btn btn-primary">
              <Plus size={16} /> {t("home.start")}
            </Link>
            <Link to="/about" className="btn btn-ghost">{t("nav.about")}</Link>
          </div>
        </div>

        {highlight?.result && (
          <Link to={`/runs/${highlight.id}`} className="card rise rise-4 group relative block min-w-0 overflow-hidden p-6">
            <div className="absolute -right-10 -top-10 size-44 rounded-full bg-leaf/25 blur-2xl" />
            <div className="relative flex items-start justify-between">
              <div>
                <p className="eyebrow">{regionName(highlight.region_id)} · {period(highlight.year, highlight.month)}</p>
                <p className="mt-3 text-sm text-ink-2">{t("run.absorbed")}</p>
              </div>
              <ArrowUpRight className="text-muted transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-ink" />
            </div>
            <p className="display relative mt-1 text-6xl">
              {fmt(highlight.result.absorbed_co2_t)}
              <span className="num ml-2 text-base text-muted">{t("common.tCO2")}</span>
            </p>
            {highlight.result.offset_pct != null && (
              <div className="relative mt-6">
                <div className="flex justify-between text-xs">
                  <span className="num font-medium">{fmt(highlight.result.offset_pct, 1)}%</span>
                  <span className="text-muted">{t("run.offset")}</span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-sienna/20">
                  <div className="h-full rounded-full bg-moss" style={{ width: `${Math.min(100, highlight.result.offset_pct)}%` }} />
                </div>
              </div>
            )}
          </Link>
        )}
      </section>

      <section className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-3">
        {steps.map(([title, body], i) => (
          <div key={title} className="bg-card/80 p-6">
            <span className="num text-xs text-muted">0{i + 1}</span>
            <h3 className="display mt-2 text-xl">{title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{body}</p>
          </div>
        ))}
      </section>

      <section>
        <div className="mb-5 flex items-end justify-between">
          <h2 className="display text-3xl">{t("home.yourRegions")}</h2>
          <Link to="/regions/new" className="btn btn-ghost !py-1.5 text-sm"><Plus size={15} />{t("nav.newRegion")}</Link>
        </div>
        {regions.data?.length === 0 && (
          <div className="card p-10 text-center">
            <h3 className="display text-2xl">{t("home.emptyTitle")}</h3>
            <p className="mt-2 text-ink-2">{t("home.emptyBody")}</p>
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {regions.data?.map((r) => (
            <Link key={r.id} to={`/regions/${r.id}`} className="card group flex items-center gap-5 p-5 transition hover:-translate-y-0.5">
              <RegionShape geometry={r.geometry} className="size-20 shrink-0 transition group-hover:scale-105" />
              <div className="min-w-0">
                <h3 className="display truncate text-xl">{r.name}</h3>
                <p className="num mt-1 text-xs text-muted">{fmt(r.area_km2, 1)} {t("common.km2")} · {t("home.runs", { count: r.run_count })}</p>
                {r.reference && <span className="mt-2 inline-block rounded-full bg-leaf/40 px-2 py-0.5 text-[0.68rem] font-semibold">{t("home.reference")}</span>}
              </div>
              <ArrowRight size={18} className="ml-auto shrink-0 text-muted transition group-hover:translate-x-1 group-hover:text-ink" />
            </Link>
          ))}
        </div>
      </section>

      <section>
        <h2 className="display mb-5 text-3xl">{t("home.recent")}</h2>
        <div className="card divide-y divide-line overflow-hidden">
          {runs.data?.length === 0 && <p className="p-6 text-sm text-muted">{t("home.noRuns")}</p>}
          {runs.data?.slice(0, 8).map((r) => (
            <Link key={r.id} to={`/runs/${r.id}`} className="flex items-center gap-4 px-5 py-3.5 transition hover:bg-paper-2/60">
              <span className="num w-10 text-xs text-muted">#{r.id}</span>
              <span className="font-semibold">{regionName(r.region_id)}</span>
              <span className="text-sm capitalize text-ink-2">{period(r.year, r.month)}</span>
              <span className="ml-auto num hidden text-sm sm:inline">
                {r.result ? `${fmt(r.result.absorbed_co2_t)} ${t("common.tCO2")}` : ""}
              </span>
              <StatusBadge status={r.status} />
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
