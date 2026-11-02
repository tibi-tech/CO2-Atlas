import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, CircleAlert, ExternalLink, Eye, EyeOff, KeyRound, Loader2, ShieldCheck, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api, ApiError, type SettingsStatus } from "../api/client";
import { useAuth } from "../components/Auth";
import { errorText } from "../i18n";

const DASHBOARD = "https://shapps.dataspace.copernicus.eu/dashboard/";
const BALANCE = "https://openeo.dataspace.copernicus.eu/";

export default function Settings() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const auth = useAuth();
  const status = useQuery({ queryKey: ["settings"], queryFn: api.settings });
  const usage = useQuery({
    queryKey: ["copernicus-usage"], queryFn: api.copernicusUsage,
    enabled: !!status.data?.copernicus.configured, retry: false, staleTime: 300_000,
  });
  const [replacing, setReplacing] = useState(false);
  const [clientId, setClientId] = useState("");
  const [secret, setSecret] = useState("");
  const [show, setShow] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const fail = (e: unknown) => setMsg({ ok: false, text: errorText(e instanceof ApiError ? e.code : "", t) });
  const updated = (s: SettingsStatus, text: string) => {
    qc.setQueryData(["settings"], s);
    qc.invalidateQueries({ queryKey: ["config"] });
    setMsg({ ok: true, text });
  };
  const guard = async () => {
    if (!(await auth.ensure())) throw new ApiError(401, "invalid_password");
  };

  const save = useMutation({
    mutationFn: async () => { await guard(); return api.saveCopernicus(clientId, secret); },
    onSuccess: (s) => {
      setSecret(""); setClientId(""); setReplacing(false); setShow(false);
      updated(s, t("settings.saved"));
    },
    onError: fail,
  });
  const remove = useMutation({
    mutationFn: async () => { await guard(); return api.deleteCopernicus(); },
    onSuccess: (s) => updated(s, t("settings.removed")),
    onError: fail,
  });
  const test = useMutation({
    mutationFn: async () => { await guard(); return api.testCopernicus(); },
    onSuccess: () => setMsg({ ok: true, text: t("settings.testOk") }),
    onError: fail,
  });

  if (!status.data) return <p className="text-muted">{t("common.loading")}</p>;
  const c = status.data.copernicus;
  const editable = status.data.editable && !c.env_managed;
  const showForm = editable && (!c.configured || replacing);
  const steps = t("settings.steps", { returnObjects: true }) as string[];

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <header className="rise">
        <p className="eyebrow">{t("nav.settings")}</p>
        <h1 className="display mt-2 text-5xl">{t("settings.title")}</h1>
        <p className="mt-2 text-ink-2">{t("settings.lead")}</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <section className="card rise rise-1 space-y-5 p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="display text-2xl">{t("settings.copernicus")}</h2>
              <p className="mt-1.5 text-sm text-ink-2">{t("settings.copernicusLead")}</p>
            </div>
            <span className={`num inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.68rem] uppercase tracking-wider ${c.configured ? "bg-ink text-leaf" : "bg-sienna/15 text-sienna"}`}>
              {c.configured ? <CheckCircle2 size={12} /> : <CircleAlert size={12} />}
              {c.configured ? t("settings.configured") : t("settings.notConfigured")}
            </span>
          </div>

          {c.configured && (
            <div className="rounded-xl border border-line bg-paper/60 p-4">
              <div className="flex items-center gap-3">
                <KeyRound size={18} className="text-moss" />
                <div className="min-w-0">
                  <p className="text-xs text-muted">{t("settings.client")}</p>
                  <p className="num truncate text-sm">{c.client_id_hint}</p>
                </div>
                <span className="num ml-auto text-xs tracking-widest text-muted">••••••••</span>
              </div>
              <p className="mt-2 text-xs text-muted">{c.source === "env" ? t("settings.sourceEnv") : t("settings.sourceSettings")}</p>
              <div className="mt-4 flex items-end justify-between gap-3 border-t border-line pt-3">
                <div>
                  <p className="text-xs text-muted">{t("settings.creditsUsed")}</p>
                  <p className="num text-lg">
                    {usage.data ? usage.data.credits.toLocaleString(i18n.language) : usage.isError ? "—" : "…"}
                    {usage.data && <span className="ml-2 text-xs text-muted">{t("settings.creditsJobs", { count: usage.data.jobs })}</span>}
                  </p>
                </div>
                <a href={BALANCE} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs underline">
                  {t("settings.creditsBalance")}<ExternalLink size={12} />
                </a>
              </div>
              {status.data.editable && (
                <div className="mt-4 flex flex-wrap gap-2">
                  <button className="btn btn-ghost !py-1.5 text-xs" onClick={() => { setMsg(null); test.mutate(); }} disabled={test.isPending}>
                    {test.isPending ? <Loader2 size={13} className="animate-spin" /> : <ShieldCheck size={13} />}{t("settings.test")}
                  </button>
                  {editable && !replacing && (
                    <>
                      <button className="btn btn-ghost !py-1.5 text-xs" onClick={() => { setMsg(null); setReplacing(true); }}>{t("settings.replace")}</button>
                      <button
                        className="btn btn-ghost !py-1.5 text-xs text-sienna"
                        onClick={() => { setMsg(null); if (confirm(t("settings.confirmRemove"))) remove.mutate(); }}
                      >
                        <Trash2 size={13} />{t("settings.remove")}
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {showForm && (
            <form className="space-y-4" autoComplete="off" onSubmit={(e) => { e.preventDefault(); setMsg(null); save.mutate(); }}>
              <div>
                <label className="label" htmlFor="cdse-id">{t("settings.clientId")}</label>
                <input
                  id="cdse-id" className="field num" placeholder="sh-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" required
                  spellCheck={false} autoComplete="off" value={clientId} onChange={(e) => setClientId(e.target.value)}
                />
              </div>
              <div>
                <label className="label" htmlFor="cdse-secret">{t("settings.clientSecret")}</label>
                <div className="relative">
                  <input
                    id="cdse-secret" className="field num !pr-10" type={show ? "text" : "password"} required
                    spellCheck={false} autoComplete="new-password" value={secret} onChange={(e) => setSecret(e.target.value)}
                  />
                  <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink" aria-label="toggle">
                    {show ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button className="btn btn-primary text-sm" disabled={!clientId.trim() || !secret.trim() || save.isPending}>
                  {save.isPending ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
                  {save.isPending ? t("settings.verifying") : t("settings.save")}
                </button>
                {replacing && <button type="button" className="btn btn-ghost text-sm" onClick={() => { setReplacing(false); setSecret(""); setClientId(""); }}>{t("common.cancel")}</button>}
              </div>
            </form>
          )}

          {!status.data.editable && <p className="rounded-lg bg-paper-2 px-3 py-2 text-xs text-ink-2">{t("settings.localOnly")}</p>}

          {msg && (
            <p className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-leaf/25 text-ink" : "bg-sienna/10 text-sienna"}`}>{msg.text}</p>
          )}

          <p className="flex gap-2 border-t border-line pt-4 text-xs text-muted">
            <ShieldCheck size={14} className="mt-0.5 shrink-0" />{t("settings.security")}
          </p>
        </section>

        <aside className="card rise rise-2 p-6">
          <h2 className="display text-xl">{t("settings.howTo")}</h2>
          <ol className="mt-4 space-y-3">
            {steps.map((s, i) => (
              <li key={i} className="flex gap-3 text-sm text-ink-2">
                <span className="num grid size-6 shrink-0 place-items-center rounded-full bg-leaf/40 text-xs font-medium text-ink">{i + 1}</span>
                <span className="pt-0.5">{s}</span>
              </li>
            ))}
          </ol>
          <a href={DASHBOARD} target="_blank" rel="noreferrer" className="btn btn-leaf mt-5 w-full justify-center text-sm">
            {t("settings.openDashboard")}<ExternalLink size={14} />
          </a>
          <p className="mt-3 text-center text-xs text-muted">
            <a href="https://dataspace.copernicus.eu/" target="_blank" rel="noreferrer" className="underline">{t("settings.noAccount")}</a>
          </p>
        </aside>
      </div>
    </div>
  );
}
