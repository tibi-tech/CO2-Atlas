import type { Geometry } from "geojson";

export type Region = {
  id: number;
  name: string;
  geometry: Geometry;
  area_km2: number;
  population: number | null;
  emissions_per_capita: number | null;
  reference: boolean;
  created_at: string;
  run_count: number;
  done_count: number;
};

export type StepState = { status: "pending" | "running" | "done" | "failed"; message: string | null };

export type LayerMeta = {
  name: string;
  unit: string;
  coordinates: [number, number][];
  min?: number;
  max?: number;
  palette?: string[];
  legend?: { code: number; name: string; color: string }[];
  stats: { min: number | null; max: number | null; mean: number | null };
};

export type LandcoverRow = { code: number; name: string; area_ha: number; c_t: number; co2_t: number };

export type RunResult = {
  method: "improved" | "legacy";
  year: number;
  month: number;
  area_ha: number;
  vegetated_area_ha: number;
  absorbed_c_t: number;
  absorbed_co2_t: number;
  emissions_co2_t: number;
  emissions_c_t: number;
  offset_pct: number | null;
  mean_npp_c_kg_ha: number;
  mean_npp_co2_kg_ha: number;
  by_landcover: LandcoverRow[];
  parameters: Record<string, number | null>;
  settings: Record<string, unknown>;
  notes: string[];
  layers: Record<string, LayerMeta>;
};

export type Run = {
  id: number;
  region_id: number;
  year: number;
  month: number;
  method: "improved" | "legacy";
  status: "queued" | "running" | "done" | "failed";
  params: Record<string, unknown>;
  steps: Record<string, StepState>;
  result: RunResult | null;
  error: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
};

export type TimePoint = {
  run_id: number;
  year: number;
  month: number;
  absorbed_co2_t: number;
  emissions_co2_t: number;
  offset_pct: number | null;
  mean_npp_c_kg_ha: number;
};

export type AppConfig = {
  password_required: boolean;
  copernicus_configured: boolean;
  max_region_km2: number;
  max_months_per_job: number;
  steps: string[];
  worldcover_classes: Record<string, string>;
  default_emax: Record<string, number>;
  default_ndvi_min: number;
  default_ndvi_max: number;
  queue_length: number;
};

export type RunRequest = {
  region_id: number;
  year: number;
  months: number[];
  method?: "improved" | "legacy";
  population?: number | null;
  emissions_per_capita?: number | null;
  emissions_total?: number | null;
  fpar_fixed?: boolean;
  ndvi_min?: number;
  ndvi_max?: number;
  emax_table?: Record<string, number>;
  t_opt?: number | null;
};

export type SettingsStatus = {
  copernicus: { configured: boolean; source: "env" | "settings" | null; client_id_hint: string | null; env_managed: boolean };
  editable: boolean;
};

const PW_KEY = "co2.password";

export const password = {
  get: () => localStorage.getItem(PW_KEY) ?? "",
  set: (v: string) => localStorage.setItem(PW_KEY, v),
  clear: () => localStorage.removeItem(PW_KEY),
};

export class ApiError extends Error {
  constructor(public status: number, public code: string) {
    super(code);
  }
}

type Listener = () => void;
const authListeners = new Set<Listener>();
export const onAuthRequired = (l: Listener) => {
  authListeners.add(l);
  return () => {
    authListeners.delete(l);
  };
};

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const pw = password.get();
  if (pw) headers.set("X-Demo-Password", pw);
  if (init.body && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
  const res = await fetch(path, { ...init, headers });
  if (!res.ok) {
    let code = res.statusText;
    try {
      const body = await res.json();
      code = typeof body.detail === "string" ? body.detail : (body.detail?.[0]?.msg ?? code);
      code = code.replace(/^Value error, /, "");
    } catch {
      /* not json */
    }
    if (res.status === 401) authListeners.forEach((l) => l());
    throw new ApiError(res.status, code);
  }
  return res.json() as Promise<T>;
}

export const api = {
  config: () => request<AppConfig>("/api/config"),
  checkPassword: () => request<{ ok: boolean }>("/api/auth/check", { method: "POST" }),
  regions: () => request<Region[]>("/api/regions"),
  region: (id: number) => request<Region>(`/api/regions/${id}`),
  createRegion: (body: { name: string; geometry: Geometry; population?: number | null; emissions_per_capita?: number | null }) =>
    request<Region>("/api/regions", { method: "POST", body: JSON.stringify(body) }),
  updateRegion: (id: number, body: Partial<Pick<Region, "name" | "population" | "emissions_per_capita">>) =>
    request<Region>(`/api/regions/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteRegion: (id: number) => request(`/api/regions/${id}`, { method: "DELETE" }),
  parseFile: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return request<{ geometry: Geometry; area_km2: number }>("/api/regions/parse", { method: "POST", body: fd });
  },
  timeseries: (id: number, method = "improved") =>
    request<TimePoint[]>(`/api/regions/${id}/timeseries?method=${method}`),
  runs: (regionId?: number) => request<Run[]>(`/api/runs${regionId ? `?region_id=${regionId}` : ""}`),
  run: (id: number) => request<Run>(`/api/runs/${id}`),
  createRuns: (body: RunRequest) => request<Run[]>("/api/runs", { method: "POST", body: JSON.stringify(body) }),
  retryRun: (id: number) => request<Run>(`/api/runs/${id}/retry`, { method: "POST" }),
  deleteRun: (id: number) => request(`/api/runs/${id}`, { method: "DELETE" }),
  sample: (id: number, lon: number, lat: number) =>
    request<Record<string, number | null>>(`/api/runs/${id}/sample?lon=${lon}&lat=${lat}`),
  layerUrl: (id: number, name: string) => `/api/runs/${id}/layers/${name}.png`,
  exportUrl: (id: number, fmt: "pdf" | "csv" | "zip", lang: string) => `/api/runs/${id}/export.${fmt}?lang=${lang}`,
  settings: () => request<SettingsStatus>("/api/settings"),
  saveCopernicus: (client_id: string, client_secret: string) =>
    request<SettingsStatus>("/api/settings/copernicus", { method: "PUT", body: JSON.stringify({ client_id, client_secret }) }),
  deleteCopernicus: () => request<SettingsStatus>("/api/settings/copernicus", { method: "DELETE" }),
  testCopernicus: () => request<{ ok: boolean }>("/api/settings/copernicus/test", { method: "POST" }),
  copernicusUsage: () => request<{ month: string; jobs: number; credits: number }>("/api/settings/copernicus/usage"),
};
