import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Download, FileText, Info, Map as MapIcon, RotateCw, Table } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";
import { api, type Region, type Run, type RunResult } from "../api/client";
import ResultMap from "../components/ResultMap";
import { useAuth } from "../components/Auth";
import { StatusBadge, StepList } from "../components/ui";
import { fmt, lang, period } from "../i18n";

const CLASS_COLORS: Record<number, string> = {
  10: "#006400", 20: "#ffbb22", 30: "#e6e645", 40: "#f096ff", 50: "#fa0000", 60: "#b4b4b4",
  70: "#f0f0f0", 80: "#0064c8", 90: "#0096a0", 95: "#00cf75", 100: "#fae6a0",
};

export default function RunPage() {
  const { t } = useTranslation();
  const id = Number(useParams().id);
  const qc = useQueryClient();
  const auth = useAuth();
  const run = useQuery({ queryKey: ["run", id], queryFn: () => api.run(id) });
  const region = useQuery({ queryKey: ["region", run.data?.region_id], queryFn: () => api.region(run.data!.region_id), enabled: !!run.data });
  const config = useQuery({ queryKey: ["config"], queryFn: api.config });

  const active = run.data && (run.data.status === "queued" || run.data.status === "running");
  useEffect(() => {
    if (!active) return;
    const es = new EventSource(`/api/runs/${id}/events`);
    es.onmessage = (e) => {
      const d = JSON.parse(e.data) as Pick<Run, "status" | "steps" | "error">;
      qc.setQueryData<Run>(["run", id], (old) => (old ? { ...old, ...d } : old));
      if (d.status === "done" || d.status === "failed") {
        es.close();
        qc.invalidateQueries({ queryKey: ["run", id] });
        qc.invalidateQueries({ queryKey: ["runs"] });
      }
    };
    es.onerror = () => { es.close(); setTimeout(() => qc.invalidateQueries({ queryKey: ["run", id] }), 3000); };
    return () => es.close();
  }, [active, id, qc]);

  if (run.isError) return <p className="text-sienna">{t("common.error")}</p>;
  if (!run.data || !region.data) return <p className="text-muted">{t("common.loading")}</p>;
  const r = run.data;

  return (
    <div className="space-y-8">
      <header className="rise flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link to={`/regions/${r.region_id}`} className="eyebrow inline-flex items-center gap-1 hover:text-ink"><ArrowLeft size={12} />{region.data.name}</Link>
          <h1 className="display mt-2 text-5xl capitalize sm:text-6xl">{period(r.year, r.month)}</h1>
          <div className="mt-3 flex items-center gap-2">
            <StatusBadge status={r.status} />
            <span className="text-sm text-ink-2">{t(`run.method_${r.method}`)}</span>
          </div>
        </div>
        {r.status === "done" && (
          <div className="flex flex-wrap gap-2">
            <a className="btn btn-primary text-sm" href={api.exportUrl(r.id, "pdf", lang())}><FileText size={15} />{t("run.pdf")}</a>
            <a className="btn btn-ghost text-sm" href={api.exportUrl(r.id, "csv", lang())}><Table size={15} />{t("run.csv")}</a>
            <a className="btn btn-ghost text-sm" href={api.exportUrl(r.id, "zip", lang())}><Download size={15} />{t("run.zip")}</a>
          </div>
        )}
      </header>

      {r.status !== "done" && (
        <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
          <section className="card p-6">
            <h2 className="display text-2xl">{r.status === "failed" ? t("run.failed") : t("run.progress")}</h2>
            {r.status !== "failed" && <p className="mt-2 text-sm text-ink-2">{t("run.progressLead")}</p>}
            {r.error && <p className="num mt-3 break-words rounded-lg bg-sienna/10 px-3 py-2 text-xs text-sienna">{r.error}</p>}
            {r.status === "failed" && (
              <button className="btn btn-primary mt-4 text-sm" onClick={async () => { if (await auth.ensure()) { await api.retryRun(r.id); qc.invalidateQueries({ queryKey: ["run", id] }); } }}>
                <RotateCw size={14} />{t("common.retry")}
              </button>
            )}
            <div className="mt-5"><StepList steps={r.steps} order={config.data?.steps ?? Object.keys(r.steps)} /></div>
          </section>
          {r.status !== "failed" && (
          <section className="card relative hidden overflow-hidden lg:block">
            <div className="absolute inset-0 grid place-items-center">
              <div className="relative size-64">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="breathe absolute inset-0 rounded-full border border-moss/40" style={{ animationDelay: `${i * 0.5}s`, inset: `${i * 28}px` }} />
                ))}
                <MapIcon className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-moss" size={40} />
              </div>
            </div>
          </section>
          )}
        </div>
      )}

      {r.status === "done" && r.result && <Results run={r} result={r.result} region={region.data} />}
    </div>
  );
}

function Results({ run, result, region }: { run: Run; result: RunResult; region: Region }) {
  const { t } = useTranslation();
  const offset = result.offset_pct;
  const totalCo2 = result.by_landcover.reduce((a, b) => a + b.co2_t, 0) || 1;
  const params = result.parameters;
  const units: Record<string, string> = { t_mean: "°C", t_opt: "°C", sol: "MJ/m²", sol_daily: "MJ/m²/d", s2_coverage: "%" };

  return (
    <div className="space-y-6">
      <section className="grid gap-4 lg:grid-cols-[1.4fr_1fr_1fr]">
        <div className="rise rise-1 relative overflow-hidden rounded-[14px] bg-ink p-7 text-paper">
          <div className="absolute -bottom-20 -right-16 size-64 rounded-full bg-leaf/20 blur-3xl" />
          <p className="eyebrow !text-paper/60">{t("run.absorbed")}</p>
          <p className="display mt-3 text-6xl text-leaf sm:text-7xl">{fmt(result.absorbed_co2_t)}</p>
          <p className="num mt-1 text-sm text-paper/70">{t("common.tCO2")} {t("common.perMonth")}</p>
          <p className="mt-5 text-sm text-paper/70">{t("run.absorbedC", { value: fmt(result.absorbed_c_t) })}</p>
        </div>

        <div className="card rise rise-2 flex flex-col p-6">
          <p className="eyebrow">{t("run.emissions")}</p>
          {result.emissions_co2_t > 0 ? (
            <>
              <p className="display mt-3 text-4xl text-sienna">{fmt(result.emissions_co2_t)}</p>
              <p className="num text-xs text-muted">{t("common.tCO2")} {t("common.perMonth")}</p>
              <div className="mt-auto pt-5">
                <div className="flex items-baseline justify-between">
                  <span className="display text-3xl">{fmt(offset, 1)}%</span>
                  <span className="text-xs text-muted">{t("run.offset")}</span>
                </div>
                <div className="mt-2 h-3 overflow-hidden rounded-full bg-sienna/20">
                  <div className="h-full rounded-full bg-moss transition-all duration-1000" style={{ width: `${Math.min(100, offset ?? 0)}%` }} />
                </div>
              </div>
            </>
          ) : (
            <p className="mt-3 text-sm text-muted">{t("run.offsetNone")}</p>
          )}
        </div>

        <div className="card rise rise-3 flex flex-col p-6">
          <p className="eyebrow">{t("run.meanNpp")}</p>
          <p className="display mt-3 text-4xl">{fmt(result.mean_npp_co2_kg_ha)}</p>
          <p className="num text-xs text-muted">{t("run.perHa")}</p>
          <p className="mt-auto pt-5 text-sm text-ink-2">
            {t("run.vegetated", { veg: fmt(result.vegetated_area_ha), area: fmt(result.area_ha) })}
          </p>
        </div>
      </section>

      <ResultMap runId={run.id} result={result} region={region} />

      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <section className="card p-6">
          <h2 className="display text-2xl">{t("run.landcover")}</h2>
          <div className="mt-5 space-y-3">
            {[...result.by_landcover].sort((a, b) => b.co2_t - a.co2_t).map((c) => (
              <div key={c.code}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="flex items-center gap-2 font-medium">
                    <span className="size-3 rounded-sm" style={{ background: CLASS_COLORS[c.code] }} />
                    {t(`classes.${c.name}`)}
                    <span className="num text-xs text-muted">{fmt(c.area_ha)} ha</span>
                  </span>
                  <span className="num">{fmt(c.co2_t)} <span className="text-muted">t</span></span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-paper-2">
                  <div className="h-full rounded-full bg-moss" style={{ width: `${(c.co2_t / totalCo2) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className="space-y-6">
          <section className="card p-6">
            <h2 className="display text-2xl">{t("run.parameters")}</h2>
            <dl className="mt-4 divide-y divide-line text-sm">
              {Object.entries(params).filter(([, v]) => v != null).map(([k, v]) => (
                <div key={k} className="flex justify-between py-2">
                  <dt className="text-ink-2">{t(`params.${k}`)}</dt>
                  <dd className="num">
                    {k === "s2_coverage" ? fmt(v! * 100, 0) : fmt(v, k.startsWith("t") && !k.startsWith("t_") ? 4 : 1)}
                    <span className="ml-1 text-muted">{units[k] ?? ""}</span>
                  </dd>
                </div>
              ))}
            </dl>
          </section>
          {result.notes.length > 0 && (
            <section className="card space-y-2 p-6">
              <h2 className="display flex items-center gap-2 text-xl"><Info size={18} />{t("run.notes")}</h2>
              {result.notes.map((n) => <p key={n} className="text-sm text-ink-2">{t(`notes.${n}`)}</p>)}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
