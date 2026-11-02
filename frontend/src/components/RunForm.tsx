import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Loader2, Play } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { api, ApiError, type Region, type RunRequest } from "../api/client";
import { useAuth } from "./Auth";
import { errorText, fmt, monthName } from "../i18n";

export default function RunForm({ region }: { region: Region }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const nav = useNavigate();
  const auth = useAuth();
  const config = useQuery({ queryKey: ["config"], queryFn: api.config });

  const now = new Date();
  const lastYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const [year, setYear] = useState(lastYear);
  const [months, setMonths] = useState<number[]>([]);
  const [method, setMethod] = useState<"improved" | "legacy">("improved");
  const [emMode, setEmMode] = useState<"perCapita" | "total">("perCapita");
  const [population, setPopulation] = useState(region.population?.toString() ?? "");
  const [perCapita, setPerCapita] = useState(region.emissions_per_capita?.toString() ?? "");
  const [total, setTotal] = useState("");
  const [advanced, setAdvanced] = useState(false);
  const [fparFixed, setFparFixed] = useState(true);
  const [ndviMin, setNdviMin] = useState("");
  const [ndviMax, setNdviMax] = useState("");
  const [tOpt, setTOpt] = useState("");
  const [emax, setEmax] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const available = (m: number) => {
    if (method === "legacy") return year === 2024 && m === 6;
    if (year === 2017 && m < 4) return false;
    return year < now.getFullYear() || m < now.getMonth() + 1;
  };
  const years = useMemo(() => {
    const ys = [];
    for (let y = lastYear; y >= 2017; y--) ys.push(y);
    return ys;
  }, [lastYear]);

  const toggle = (m: number) => setMonths((ms) => (ms.includes(m) ? ms.filter((x) => x !== m) : [...ms, m]));
  const max = config.data?.max_months_per_job ?? 12;
  const valid = months.filter(available);

  const submit = useMutation({
    mutationFn: async () => {
      if (!(await auth.ensure())) throw new ApiError(401, "invalid_password");
      const num = (s: string) => (s.trim() === "" ? null : Number(s.replace(",", ".")));
      const body: RunRequest = { region_id: region.id, year, months: valid, method };
      if (emMode === "total") body.emissions_total = num(total);
      else {
        body.population = num(population);
        body.emissions_per_capita = num(perCapita);
      }
      if (method === "improved") {
        body.fpar_fixed = fparFixed;
        if (num(ndviMin) != null) body.ndvi_min = num(ndviMin)!;
        if (num(ndviMax) != null) body.ndvi_max = num(ndviMax)!;
        body.t_opt = num(tOpt);
        const table = Object.fromEntries(Object.entries(emax).filter(([, v]) => v.trim() !== "").map(([k, v]) => [k, Number(v.replace(",", "."))]));
        if (Object.keys(table).length) body.emax_table = { ...config.data!.default_emax, ...table };
      } else {
        body.fpar_fixed = false;
      }
      return api.createRuns(body);
    },
    onSuccess: (runs) => {
      qc.invalidateQueries({ queryKey: ["runs"] });
      qc.invalidateQueries({ queryKey: ["regions"] });
      if (runs.length === 1) nav(`/runs/${runs[0].id}`);
      else setMonths([]);
    },
    onError: (e) => setError(errorText(e instanceof ApiError ? e.code : "", t)),
  });

  return (
    <form className="card space-y-5 p-6" onSubmit={(e) => { e.preventDefault(); setError(null); submit.mutate(); }}>
      <h2 className="display text-2xl">{t("region.newRun")}</h2>

      {config.data && !config.data.copernicus_configured && method === "improved" && (
        <p className="rounded-lg border border-sienna/30 bg-sienna/10 px-3 py-2 text-xs text-sienna">
          {t("region.copernicusMissing")}{" "}
          <Link to="/settings" className="font-semibold underline">{t("settings.goSettings")} →</Link>
        </p>
      )}

      {region.reference && (
        <div>
          <label className="label">{t("region.method")}</label>
          <div className="grid grid-cols-2 gap-2">
            {(["improved", "legacy"] as const).map((m) => (
              <button
                key={m} type="button"
                onClick={() => { setMethod(m); if (m === "legacy") { setYear(2024); setMonths([6]); } }}
                className={`rounded-xl border px-3 py-2 text-left text-xs font-semibold transition ${method === m ? "border-ink bg-ink text-paper" : "border-line hover:bg-paper-2"}`}
              >
                {t(`region.${m}`)}
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="mb-2 flex items-end justify-between">
          <label className="label !mb-0">{t("region.months")}</label>
          <div className="flex items-center gap-2">
            <select className="field num !w-auto !py-1 text-sm" value={year} onChange={(e) => { setYear(Number(e.target.value)); setMonths([]); }}>
              {years.map((y) => <option key={y}>{y}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6">
          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
            const on = months.includes(m);
            const ok = available(m);
            return (
              <button
                key={m} type="button" disabled={!ok} onClick={() => toggle(m)}
                className={`rounded-lg border py-2 text-xs font-semibold capitalize transition ${
                  on && ok ? "border-ink bg-leaf text-ink shadow-[inset_0_-2px_0_#1d3527]" : "border-line bg-card hover:bg-paper-2"
                } disabled:cursor-not-allowed disabled:opacity-30`}
              >
                {monthName(m, "short").replace(".", "")}
              </button>
            );
          })}
        </div>
        <div className="mt-2 flex gap-3 text-xs">
          {method === "improved" && (
            <button type="button" className="font-semibold text-moss underline" onClick={() => setMonths(Array.from({ length: 12 }, (_, i) => i + 1).filter(available).slice(0, max))}>
              {t("region.allYear")}
            </button>
          )}
          <button type="button" className="text-muted underline" onClick={() => setMonths([])}>{t("region.clearMonths")}</button>
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className="label !mb-0">{t("region.emissions")}</label>
          <div className="flex rounded-full border border-line p-0.5 text-[0.68rem]">
            {(["perCapita", "total"] as const).map((m) => (
              <button key={m} type="button" onClick={() => setEmMode(m)} className={`rounded-full px-2 py-0.5 font-semibold ${emMode === m ? "bg-ink text-paper" : "text-ink-2"}`}>
                {t(`region.emissionsMode.${m}`)}
              </button>
            ))}
          </div>
        </div>
        {emMode === "perCapita" ? (
          <div className="grid grid-cols-2 gap-2">
            <input className="field num" placeholder={t("newRegion.population")} inputMode="numeric" value={population} onChange={(e) => setPopulation(e.target.value.replace(/\D/g, ""))} />
            <input className="field num" placeholder={t("newRegion.perCapitaUnit")} inputMode="decimal" value={perCapita} onChange={(e) => setPerCapita(e.target.value)} />
          </div>
        ) : (
          <input className="field num" placeholder={t("region.emissionsTotal")} inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} />
        )}
      </div>

      {method === "improved" && config.data && (
        <div className="rounded-xl border border-line">
          <button type="button" onClick={() => setAdvanced((a) => !a)} className="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold">
            {t("region.advanced")}
            <ChevronDown size={16} className={`transition ${advanced ? "rotate-180" : ""}`} />
          </button>
          {advanced && (
            <div className="space-y-4 border-t border-line px-4 py-4 text-sm">
              <label className="flex items-start gap-2">
                <input type="checkbox" className="mt-1 accent-[#1d3527]" checked={fparFixed} onChange={(e) => setFparFixed(e.target.checked)} />
                <span>{t("region.fparFixed")}</span>
              </label>
              {fparFixed && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="label">{t("region.ndviMin")}</label>
                    <input className="field num" placeholder={String(config.data.default_ndvi_min)} value={ndviMin} onChange={(e) => setNdviMin(e.target.value)} />
                  </div>
                  <div>
                    <label className="label">{t("region.ndviMax")}</label>
                    <input className="field num" placeholder={String(config.data.default_ndvi_max)} value={ndviMax} onChange={(e) => setNdviMax(e.target.value)} />
                  </div>
                </div>
              )}
              <div>
                <label className="label">{t("region.tOpt")}</label>
                <input className="field num" placeholder={t("region.tOptHint")} value={tOpt} onChange={(e) => setTOpt(e.target.value)} />
              </div>
              <div>
                <label className="label">{t("region.emax")}</label>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                  {Object.entries(config.data.worldcover_classes).map(([code, name]) => (
                    <div key={code} className="flex items-center gap-2">
                      <span className="flex-1 truncate text-xs text-ink-2">{t(`classes.${name}`)}</span>
                      <input
                        className="field num !w-16 !px-2 !py-1 text-xs" placeholder={String(config.data!.default_emax[code])}
                        value={emax[code] ?? ""} onChange={(e) => setEmax((x) => ({ ...x, [code]: e.target.value }))}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {error && <p className="rounded-lg bg-sienna/10 px-3 py-2 text-sm text-sienna">{error}</p>}
      {valid.length > max && <p className="text-xs text-sienna">max {max}</p>}
      <button className="btn btn-leaf w-full justify-center" disabled={!valid.length || valid.length > max || submit.isPending}>
        {submit.isPending ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />}
        {t("region.submit", { count: valid.length || 1 })}
      </button>
      {config.data && config.data.queue_length > 0 && (
        <p className="num text-center text-xs text-muted">queue: {fmt(config.data.queue_length)}</p>
      )}
    </form>
  );
}
