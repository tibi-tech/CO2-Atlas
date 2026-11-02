import maplibregl from "maplibre-gl";
import { Layers, Satellite } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, type Region, type RunResult } from "../api/client";
import { fmt } from "../i18n";
import { setSatellite, showOutline, useMap } from "../map/useMap";

const ORDER = ["co2", "npp", "ndvi", "fpar", "wsc", "emax", "landcover", "t_mean", "sol"];

export default function ResultMap({ runId, result, region }: { runId: number; result: RunResult; region: Region }) {
  const { t } = useTranslation();
  const { ref, map } = useMap();
  const layers = ORDER.filter((l) => result.layers[l]);
  const [active, setActive] = useState(layers[0]);
  const [opacity, setOpacity] = useState(0.9);
  const [sat, setSat] = useState(false);
  const popup = useRef<maplibregl.Popup | null>(null);

  useEffect(() => {
    if (!map) return;
    showOutline(map, "region", region.geometry, { fill: false });
  }, [map, region.geometry]);

  useEffect(() => {
    if (!map || !active) return;
    const meta = result.layers[active];
    const src = map.getSource("overlay") as maplibregl.ImageSource | undefined;
    const url = api.layerUrl(runId, active);
    const coordinates = meta.coordinates as [[number, number], [number, number], [number, number], [number, number]];
    if (src) src.updateImage({ url, coordinates });
    else {
      map.addSource("overlay", { type: "image", url, coordinates });
      map.addLayer({ id: "overlay", type: "raster", source: "overlay", paint: { "raster-opacity": opacity, "raster-resampling": "nearest" } }, "region-halo");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, active, runId]);

  useEffect(() => {
    if (map?.getLayer("overlay")) map.setPaintProperty("overlay", "raster-opacity", opacity);
  }, [map, opacity]);

  useEffect(() => {
    if (map) setSatellite(map, sat);
  }, [map, sat]);

  useEffect(() => {
    if (!map) return;
    const onClick = async (e: maplibregl.MapMouseEvent) => {
      const v = await api.sample(runId, e.lngLat.lng, e.lngLat.lat).catch(() => null);
      if (!v || Object.values(v).every((x) => x == null)) return;
      const rows = ORDER.filter((k) => k in v && v[k] != null)
        .map((k) => {
          const val = k === "landcover" ? t(`classes.${result.layers.landcover?.legend?.find((c) => c.code === v[k])?.name ?? ""}`) : fmt(v[k]!, Math.abs(v[k]!) < 10 ? 3 : 1);
          return `<tr><td style="color:#7a8577;padding-right:10px">${t(`layers.${k}`)}</td><td class="num" style="text-align:right">${val} <span style="color:#7a8577">${result.layers[k]?.unit ?? ""}</span></td></tr>`;
        })
        .join("");
      popup.current?.remove();
      popup.current = new maplibregl.Popup({ maxWidth: "280px" }).setLngLat(e.lngLat).setHTML(`<table style="font-size:12px">${rows}</table>`).addTo(map);
    };
    map.on("click", onClick);
    map.getCanvas().style.cursor = "crosshair";
    return () => { map.off("click", onClick); };
  }, [map, runId, result, t]);

  const meta = active ? result.layers[active] : undefined;

  return (
    <div className="card grid overflow-hidden p-0 lg:grid-cols-[220px_1fr]">
      <aside className="border-b border-line p-4 lg:border-b-0 lg:border-r">
        <p className="eyebrow mb-3 flex items-center gap-1.5"><Layers size={12} />{t("run.map")}</p>
        <div className="flex flex-wrap gap-1 lg:flex-col">
          {layers.map((l) => (
            <button
              key={l} onClick={() => setActive(l)}
              className={`rounded-lg px-3 py-2 text-left text-sm font-medium transition ${active === l ? "bg-ink text-paper" : "hover:bg-paper-2"}`}
            >
              {t(`layers.${l}`)}
            </button>
          ))}
        </div>
        <div className="mt-5 space-y-4">
          <div>
            <label className="label">{t("run.opacity")}</label>
            <input type="range" min={0} max={1} step={0.05} value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} className="w-full accent-[#1d3527]" />
          </div>
          <button onClick={() => setSat((s) => !s)} className={`btn w-full justify-center !py-1.5 text-xs ${sat ? "btn-primary" : "btn-ghost"}`}>
            <Satellite size={14} />{t("run.satellite")}
          </button>
        </div>
      </aside>
      <div className="relative h-[560px]">
        <div ref={ref} className="h-full w-full" />
        {meta && (
          <div className="absolute bottom-3 left-3 z-10 max-w-[calc(100%-1.5rem)] rounded-xl border border-line bg-card/95 p-3 shadow-lg backdrop-blur">
            <p className="text-xs font-semibold">{t(`layers.${active}`)} {meta.unit && <span className="num font-normal text-muted">({meta.unit})</span>}</p>
            {meta.legend ? (
              <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
                {meta.legend.filter((c) => result.by_landcover.some((b) => b.code === c.code)).map((c) => (
                  <span key={c.code} className="flex items-center gap-1.5 text-[0.7rem]">
                    <span className="size-2.5 rounded-sm" style={{ background: c.color }} />{t(`classes.${c.name}`)}
                  </span>
                ))}
              </div>
            ) : (
              <div className="mt-2 w-56">
                <div className="h-2.5 rounded-full" style={{ background: `linear-gradient(90deg, ${meta.palette?.join(",")})` }} />
                <div className="num mt-1 flex justify-between text-[0.68rem] text-muted">
                  <span>{fmt(meta.min, Math.abs(meta.max ?? 0) < 10 ? 2 : 0)}</span>
                  <span>{fmt(meta.max, Math.abs(meta.max ?? 0) < 10 ? 2 : 0)}</span>
                </div>
              </div>
            )}
          </div>
        )}
        <p className="pointer-events-none absolute left-3 top-3 z-10 rounded-full bg-card/90 px-3 py-1 text-[0.68rem] text-muted shadow">{t("run.clickHint")}</p>
      </div>
    </div>
  );
}
