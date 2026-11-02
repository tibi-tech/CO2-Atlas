import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Pencil, RotateCw, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api, type Region, type Run } from "../api/client";
import { useAuth } from "../components/Auth";
import RunForm from "../components/RunForm";
import { RegionShape, StatusBadge } from "../components/ui";
import { fmt, monthName, period } from "../i18n";
import { showOutline, useMap } from "../map/useMap";

export default function RegionPage() {
  const { t } = useTranslation();
  const id = Number(useParams().id);
  const region = useQuery({ queryKey: ["region", id], queryFn: () => api.region(id) });
  const runs = useQuery({
    queryKey: ["runs", id], queryFn: () => api.runs(id),
    refetchInterval: (q) => (q.state.data?.some((r) => r.status === "queued" || r.status === "running") ? 3000 : false),
  });
  const series = useQuery({ queryKey: ["timeseries", id, runs.data?.filter((r) => r.status === "done").length], queryFn: () => api.timeseries(id) });

  if (region.isError) return <p className="text-sienna">{t("common.error")}</p>;
  if (!region.data) return <p className="text-muted">{t("common.loading")}</p>;
  const r = region.data;

  return (
    <div className="space-y-8">
      <header className="rise flex flex-wrap items-center gap-5">
        <RegionShape geometry={r.geometry} className="size-20" />
        <div>
          <p className="eyebrow">{t("nav.regions")}</p>
          <h1 className="display text-5xl">{r.name}</h1>
          <p className="num mt-1 text-sm text-muted">
            {fmt(r.area_km2, 1)} {t("common.km2")}
            {r.population ? ` · ${fmt(r.population)} hab.` : ""}
            {r.emissions_per_capita ? ` · ${fmt(r.emissions_per_capita, 2)} ${t("newRegion.perCapitaUnit")}` : ""}
          </p>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[400px_1fr]">
        <div className="space-y-6">
          <RunForm key={r.id} region={r} />
          <RegionSettings region={r} />
        </div>

        <div className="space-y-6">
          <OutlineMap region={r} />

          <section className="card p-6">
            <h2 className="display text-2xl">{t("region.timeline")}</h2>
            {series.data && series.data.length > 0 ? (
              <div className="mt-4 h-64">
                <ResponsiveContainer>
                  <ComposedChart data={series.data.map((p) => ({ ...p, label: `${monthName(p.month, "short")} ${String(p.year).slice(2)}` }))}>
                    <CartesianGrid stroke="#d9d1bd" strokeDasharray="2 4" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#7a8577" }} axisLine={false} tickLine={false} />
                    <YAxis yAxisId="t" tick={{ fontSize: 11, fill: "#7a8577" }} axisLine={false} tickLine={false} width={60} tickFormatter={(v) => fmt(v)} />
                    <YAxis yAxisId="p" orientation="right" tick={{ fontSize: 11, fill: "#c2562b" }} axisLine={false} tickLine={false} unit="%" width={44} />
                    <Tooltip
                      contentStyle={{ borderRadius: 10, border: "1px solid #d9d1bd", background: "#fbf9f3", fontSize: 12 }}
                      formatter={(v, name) => [name === "offset_pct" ? `${fmt(Number(v), 1)}%` : `${fmt(Number(v))} t CO₂`, t(name === "offset_pct" ? "region.offset" : "region.absorbed")]}
                    />
                    <Bar yAxisId="t" dataKey="absorbed_co2_t" fill="#4c7a3a" radius={[6, 6, 0, 0]} maxBarSize={36} />
                    <Line yAxisId="p" dataKey="offset_pct" stroke="#c2562b" strokeWidth={2} dot={{ r: 3, fill: "#c2562b" }} type="monotone" />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted">{t("region.noTimeline")}</p>
            )}
          </section>

          <section className="card overflow-hidden">
            <h2 className="display px-6 pt-6 text-2xl">{t("region.history")}</h2>
            <div className="mt-3 divide-y divide-line">
              {runs.data?.map((run) => <RunRow key={run.id} run={run} />)}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function RunRow({ run }: { run: Run }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const auth = useAuth();
  const retry = useMutation({
    mutationFn: async () => { if (await auth.ensure()) await api.retryRun(run.id); },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["runs"] }),
  });
  const del = useMutation({
    mutationFn: async () => { if (confirm(t("common.confirmDelete")) && (await auth.ensure())) await api.deleteRun(run.id); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["runs"] }); qc.invalidateQueries({ queryKey: ["timeseries"] }); },
  });
  return (
    <div className="group flex items-center gap-3 px-6 py-3 transition hover:bg-paper-2/50">
      <Link to={`/runs/${run.id}`} className="flex flex-1 items-center gap-3">
        <span className="font-semibold capitalize">{period(run.year, run.month)}</span>
        {run.method === "legacy" && <span className="rounded-full bg-leaf/40 px-2 py-0.5 text-[0.65rem] font-semibold">{t("run.method_legacy")}</span>}
        <span className="num ml-auto text-sm">
          {run.result ? <>{fmt(run.result.absorbed_co2_t)} <span className="text-muted">t CO₂</span>{run.result.offset_pct != null && <span className="ml-3 text-sienna">{fmt(run.result.offset_pct, 1)}%</span>}</> : null}
        </span>
        <StatusBadge status={run.status} />
      </Link>
      {run.status === "failed" && (
        <button onClick={() => retry.mutate()} title={t("common.retry")} className="text-muted hover:text-ink"><RotateCw size={15} /></button>
      )}
      {run.status !== "running" && (
        <button onClick={() => del.mutate()} title={t("common.delete")} className="text-muted opacity-0 transition hover:text-sienna group-hover:opacity-100"><Trash2 size={15} /></button>
      )}
      <ArrowRight size={15} className="text-muted" />
    </div>
  );
}

function OutlineMap({ region }: { region: Region }) {
  const { ref, map } = useMap({ interactive: true });
  useEffect(() => {
    if (map) showOutline(map, "region", region.geometry);
  }, [map, region.geometry]);
  return <div className="card h-72 overflow-hidden p-0"><div ref={ref} className="h-full w-full" /></div>;
}

function RegionSettings({ region }: { region: Region }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const nav = useNavigate();
  const auth = useAuth();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(region.name);
  const [population, setPopulation] = useState(region.population?.toString() ?? "");
  const [perCapita, setPerCapita] = useState(region.emissions_per_capita?.toString() ?? "");

  const save = useMutation({
    mutationFn: async () => {
      if (!(await auth.ensure())) return;
      await api.updateRegion(region.id, {
        name, population: population ? Number(population) : null,
        emissions_per_capita: perCapita ? Number(perCapita.replace(",", ".")) : null,
      });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["region", region.id] }); qc.invalidateQueries({ queryKey: ["regions"] }); setEditing(false); },
  });
  const del = useMutation({
    mutationFn: async () => {
      if (!confirm(t("common.confirmDelete")) || !(await auth.ensure())) return false;
      await api.deleteRegion(region.id);
      return true;
    },
    onSuccess: (ok) => { if (ok) { qc.invalidateQueries({ queryKey: ["regions"] }); nav("/"); } },
  });

  if (!editing)
    return (
      <div className="flex gap-2">
        <button className="btn btn-ghost flex-1 justify-center text-sm" onClick={() => setEditing(true)}><Pencil size={14} />{t("region.settings")}</button>
        <button className="btn btn-ghost text-sm text-sienna" onClick={() => del.mutate()} title={t("region.deleteRegion")}><Trash2 size={14} /></button>
      </div>
    );

  return (
    <form className="card space-y-3 p-5" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
      <h3 className="display text-lg">{t("region.settings")}</h3>
      <input className="field" value={name} onChange={(e) => setName(e.target.value)} required />
      <div className="grid grid-cols-2 gap-2">
        <input className="field num" placeholder={t("newRegion.population")} value={population} onChange={(e) => setPopulation(e.target.value.replace(/\D/g, ""))} />
        <input className="field num" placeholder={t("newRegion.perCapitaUnit")} value={perCapita} onChange={(e) => setPerCapita(e.target.value)} />
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" className="btn btn-ghost text-sm" onClick={() => setEditing(false)}>{t("common.cancel")}</button>
        <button className="btn btn-primary text-sm" disabled={save.isPending}>{t("common.save")}</button>
      </div>
    </form>
  );
}
