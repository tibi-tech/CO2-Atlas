import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Geometry } from "geojson";
import { Hexagon, Loader2, Search, Square, Trash2, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { TerraDraw, TerraDrawPolygonMode, TerraDrawRectangleMode } from "terra-draw";
import { TerraDrawMapLibreGLAdapter } from "terra-draw-maplibre-gl-adapter";
import { api, ApiError } from "../api/client";
import { useAuth } from "../components/Auth";
import { errorText, fmt } from "../i18n";
import { geometryBounds, showOutline, useMap } from "../map/useMap";

const DRAW_STYLE = {
  fillColor: "#b9d531",
  fillOpacity: 0.25,
  outlineColor: "#1d3527",
  outlineWidth: 2,
  closingPointColor: "#1d3527",
  closingPointWidth: 5,
  closingPointOutlineColor: "#fbf9f3",
  closingPointOutlineWidth: 2,
} as const;

/** Geodesic polygon area in km² (spherical excess approximation). */
function areaKm2(g: Geometry): number {
  const R = 6371.0088;
  const ring = (c: number[][]) => {
    let s = 0;
    for (let i = 0; i < c.length - 1; i++) {
      const [x1, y1] = c[i], [x2, y2] = c[i + 1];
      s += ((x2 - x1) * Math.PI / 180) * (2 + Math.sin(y1 * Math.PI / 180) + Math.sin(y2 * Math.PI / 180));
    }
    return Math.abs(s * R * R / 2);
  };
  const poly = (p: number[][][]) => ring(p[0]) - p.slice(1).reduce((a, h) => a + ring(h), 0);
  if (g.type === "Polygon") return poly(g.coordinates);
  if (g.type === "MultiPolygon") return g.coordinates.reduce((a, p) => a + poly(p), 0);
  return 0;
}

type Place = { display_name: string; geojson?: Geometry; boundingbox: string[] };

export default function NewRegion() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const qc = useQueryClient();
  const auth = useAuth();
  const config = useQuery({ queryKey: ["config"], queryFn: api.config });
  const { ref, map } = useMap();
  const draw = useRef<TerraDraw | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const [geometry, setGeometry] = useState<Geometry | null>(null);
  const [mode, setMode] = useState<"polygon" | "rectangle" | null>(null);
  const [name, setName] = useState("");
  const [population, setPopulation] = useState("");
  const [perCapita, setPerCapita] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [places, setPlaces] = useState<Place[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!map) return;
    const td = new TerraDraw({
      adapter: new TerraDrawMapLibreGLAdapter({ map }),
      modes: [
        new TerraDrawPolygonMode({ styles: DRAW_STYLE }),
        new TerraDrawRectangleMode({ styles: { fillColor: DRAW_STYLE.fillColor, fillOpacity: DRAW_STYLE.fillOpacity, outlineColor: DRAW_STYLE.outlineColor, outlineWidth: 2 } }),
      ],
    });
    td.start();
    td.on("finish", (id) => {
      const snap = td.getSnapshot();
      snap.filter((f) => f.id !== id).forEach((f) => td.removeFeatures([f.id!]));
      const f = snap.find((x) => x.id === id);
      if (f) {
        setGeometry(f.geometry as Geometry);
        hideOutline();
      }
    });
    draw.current = td;
    return () => {
      try { td.stop(); } catch { /* map already removed */ }
      draw.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  const hideOutline = () => {
    if (map?.getSource("region")) showOutline(map, "region", { type: "Polygon", coordinates: [] }, { fit: false });
  };

  const startMode = (m: "polygon" | "rectangle") => {
    draw.current?.clear();
    setGeometry(null);
    hideOutline();
    draw.current?.setMode(m);
    setMode(m);
  };

  const clear = () => {
    draw.current?.clear();
    draw.current?.setMode("static");
    setMode(null);
    setGeometry(null);
    hideOutline();
  };

  const useGeometry = (g: Geometry) => {
    draw.current?.clear();
    draw.current?.setMode("static");
    setMode(null);
    setGeometry(g);
    if (map) showOutline(map, "region", g);
  };

  const upload = async (file: File) => {
    setError(null);
    if (!(await auth.ensure())) return;
    try {
      const res = await api.parseFile(file);
      useGeometry(res.geometry);
      if (!name) setName(file.name.replace(/\.(geo)?json$|\.zip$/i, ""));
    } catch (e) {
      setError(errorText(e instanceof ApiError ? e.code : "", t));
    }
  };

  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&polygon_geojson=1&polygon_threshold=0.0005&limit=6&q=${encodeURIComponent(query)}`;
      setPlaces(await (await fetch(url, { headers: { "Accept-Language": navigator.language } })).json());
    } finally {
      setSearching(false);
    }
  };

  const pickPlace = (p: Place) => {
    setPlaces([]);
    if (p.geojson && (p.geojson.type === "Polygon" || p.geojson.type === "MultiPolygon")) {
      useGeometry(p.geojson);
      if (!name) setName(p.display_name.split(",")[0]);
    } else if (map) {
      const [s, n, w, e] = p.boundingbox.map(Number);
      map.fitBounds([[w, s], [e, n]], { padding: 40 });
    }
  };

  const create = useMutation({
    mutationFn: async () => {
      if (!(await auth.ensure())) throw new ApiError(401, "invalid_password");
      return api.createRegion({
        name: name.trim(),
        geometry: geometry!,
        population: population ? Number(population) : null,
        emissions_per_capita: perCapita ? Number(perCapita.replace(",", ".")) : null,
      });
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["regions"] });
      nav(`/regions/${r.id}`);
    },
    onError: (e) => setError(errorText(e instanceof ApiError ? e.code : "", t)),
  });

  const area = geometry ? areaKm2(geometry) : 0;
  const tooBig = !!config.data && area > config.data.max_region_km2;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <div className="card relative h-[70vh] min-h-[480px] overflow-hidden p-0">
        <div ref={ref} className="h-full w-full" />
        <div className="absolute left-3 top-3 z-10 flex flex-wrap gap-2">
          <form onSubmit={search} className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              className="field !w-64 !rounded-full !bg-card/95 !pl-9 shadow-sm"
              placeholder={t("newRegion.search")} value={query} onChange={(e) => setQuery(e.target.value)}
            />
            {searching && <Loader2 size={15} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-muted" />}
            {places.length > 0 && (
              <ul className="card absolute mt-2 max-h-72 w-80 overflow-auto p-1 text-sm">
                {places.map((p, i) => (
                  <li key={i}>
                    <button type="button" onClick={() => pickPlace(p)} className="w-full rounded-lg px-3 py-2 text-left hover:bg-paper-2">
                      {p.display_name}
                      {p.geojson && /Polygon/.test(p.geojson.type) && <Hexagon size={12} className="ml-1.5 inline text-moss" />}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </form>
        </div>
        <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 gap-1 rounded-full border border-line bg-card/95 p-1 shadow-lg backdrop-blur">
          <ToolButton active={mode === "polygon"} onClick={() => startMode("polygon")} icon={<Hexagon size={15} />} label={t("newRegion.polygon")} />
          <ToolButton active={mode === "rectangle"} onClick={() => startMode("rectangle")} icon={<Square size={15} />} label={t("newRegion.rectangle")} />
          <ToolButton onClick={() => fileInput.current?.click()} icon={<Upload size={15} />} label={t("newRegion.upload")} />
          <ToolButton onClick={clear} icon={<Trash2 size={15} />} label={t("newRegion.clear")} />
          <input ref={fileInput} type="file" accept=".geojson,.json,.zip" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }} />
        </div>
      </div>

      <form
        className="card flex flex-col gap-5 p-6"
        onSubmit={(e) => { e.preventDefault(); setError(null); create.mutate(); }}
      >
        <div>
          <p className="eyebrow">{t("nav.newRegion")}</p>
          <h1 className="display mt-2 text-3xl">{t("newRegion.title")}</h1>
          <p className="mt-2 text-sm text-ink-2">{t("newRegion.lead")}</p>
          <p className="num mt-1 text-xs text-muted">{t("newRegion.uploadHint")}</p>
        </div>

        <div className={`rounded-xl border border-dashed p-4 ${geometry ? "border-moss bg-leaf/10" : "border-line"}`}>
          <p className="eyebrow">{t("newRegion.area")}</p>
          <p className={`display mt-1 text-3xl ${tooBig ? "text-sienna" : ""}`}>
            {geometry ? fmt(area, area < 10 ? 2 : 1) : "—"} <span className="num text-sm text-muted">{t("common.km2")}</span>
          </p>
          {config.data && <p className="num mt-1 text-xs text-muted">max {fmt(config.data.max_region_km2)} {t("common.km2")}</p>}
          {geometry && map && (
            <button type="button" className="mt-2 text-xs font-semibold text-moss underline" onClick={() => map.fitBounds(geometryBounds(geometry), { padding: 40 })}>
              ⌖ zoom
            </button>
          )}
        </div>

        <div>
          <label className="label" htmlFor="region-name">{t("newRegion.name")}</label>
          <input id="region-name" className="field" required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="region-pop">{t("newRegion.population")}</label>
            <input id="region-pop" className="field num" inputMode="numeric" value={population} onChange={(e) => setPopulation(e.target.value.replace(/\D/g, ""))} />
          </div>
          <div>
            <label className="label" htmlFor="region-pc">{t("newRegion.perCapita")}</label>
            <input id="region-pc" className="field num" inputMode="decimal" value={perCapita} placeholder="0.40" onChange={(e) => setPerCapita(e.target.value)} />
          </div>
        </div>
        <p className="-mt-3 text-xs text-muted">{t("newRegion.perCapitaUnit")} · {t("newRegion.perCapitaHint")}</p>

        {error && <p className="rounded-lg bg-sienna/10 px-3 py-2 text-sm text-sienna">{error}</p>}
        <button className="btn btn-primary mt-auto justify-center" disabled={!geometry || !name.trim() || tooBig || create.isPending}>
          {create.isPending && <Loader2 size={15} className="animate-spin" />}
          {geometry ? t("newRegion.create") : t("newRegion.drawFirst")}
        </button>
      </form>
    </div>
  );
}

function ToolButton({ icon, label, onClick, active }: { icon: React.ReactNode; label: string; onClick: () => void; active?: boolean }) {
  return (
    <button
      type="button" onClick={onClick} title={label}
      className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition ${active ? "bg-ink text-leaf" : "text-ink hover:bg-paper-2"}`}
    >
      {icon}<span className="hidden md:inline">{label}</span>
    </button>
  );
}
