import maplibregl, { type Map as MLMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Geometry } from "geojson";
import { useEffect, useRef, useState } from "react";

export const BASE_STYLE = "https://tiles.openfreemap.org/styles/positron";

const SATELLITE = {
  type: "raster" as const,
  tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
  tileSize: 256,
  maxzoom: 19,
  attribution: "Imagery © Esri, Maxar, Earthstar Geographics",
};

export function useMap(options: Partial<maplibregl.MapOptions> = {}) {
  const ref = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<MLMap | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const m = new maplibregl.Map({
      container: ref.current,
      style: BASE_STYLE,
      center: [-9.27, 38.71],
      zoom: 10,
      attributionControl: { compact: true },
      ...options,
    });
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    m.on("load", () => {
      m.addSource("satellite", SATELLITE);
      const firstSymbol = m.getStyle().layers.find((l) => l.type === "symbol")?.id;
      m.addLayer({ id: "satellite", type: "raster", source: "satellite", layout: { visibility: "none" } }, firstSymbol);
      setMap(m);
    });
    return () => {
      setMap(null);
      m.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { ref, map };
}

export function setSatellite(map: MLMap, on: boolean) {
  if (map.getLayer("satellite")) map.setLayoutProperty("satellite", "visibility", on ? "visible" : "none");
}

export function geometryBounds(g: Geometry): [[number, number], [number, number]] {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const walk = (c: unknown): void => {
    if (Array.isArray(c) && typeof c[0] === "number") {
      const [x, y] = c as number[];
      minX = Math.min(minX, x); minY = Math.min(minY, y);
      maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    } else if (Array.isArray(c)) c.forEach(walk);
  };
  if ("coordinates" in g) walk(g.coordinates);
  return [[minX, minY], [maxX, maxY]];
}

export function showOutline(map: MLMap, id: string, geometry: Geometry, opts: { fill?: boolean; fit?: boolean } = {}) {
  const data = { type: "Feature" as const, properties: {}, geometry };
  const src = map.getSource(id) as maplibregl.GeoJSONSource | undefined;
  if (src) src.setData(data);
  else {
    map.addSource(id, { type: "geojson", data });
    if (opts.fill !== false)
      map.addLayer({ id: `${id}-fill`, type: "fill", source: id, paint: { "fill-color": "#b9d531", "fill-opacity": 0.12 } });
    map.addLayer({
      id: `${id}-halo`, type: "line", source: id,
      paint: { "line-color": "#fbf9f3", "line-width": 5, "line-opacity": 0.8 },
    });
    map.addLayer({
      id: `${id}-line`, type: "line", source: id,
      paint: { "line-color": "#1d3527", "line-width": 2, "line-dasharray": [3, 1.5] },
    });
  }
  if (opts.fit !== false) map.fitBounds(geometryBounds(geometry), { padding: 40, duration: 0 });
}
