import type { Geometry, Position } from "geojson";
import { Check, CircleDashed, Loader2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Run, StepState } from "../api/client";

export function StatusBadge({ status }: { status: Run["status"] }) {
  const { t } = useTranslation();
  const cls = {
    queued: "bg-paper-2 text-ink-2",
    running: "bg-leaf/40 text-ink",
    done: "bg-ink text-paper",
    failed: "bg-sienna/15 text-sienna",
  }[status];
  return (
    <span className={`num inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[0.68rem] uppercase tracking-wider ${cls}`}>
      {status === "running" && <span className="breathe size-1.5 rounded-full bg-leaf-2" />}
      {t(`status.${status}`)}
    </span>
  );
}

/** Small SVG silhouette of a region, drawn in an equirectangular projection. */
export function RegionShape({ geometry, className = "" }: { geometry: Geometry; className?: string }) {
  const rings: Position[][] = [];
  if (geometry.type === "Polygon") rings.push(...geometry.coordinates);
  if (geometry.type === "MultiPolygon") geometry.coordinates.forEach((p) => rings.push(...p));
  const pts = rings.flat();
  if (!pts.length) return null;
  const lat0 = (pts.reduce((s, p) => s + p[1], 0) / pts.length) * (Math.PI / 180);
  const xs = pts.map((p) => p[0] * Math.cos(lat0));
  const ys = pts.map((p) => -p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const w = maxX - minX || 1, h = maxY - minY || 1;
  const s = 100 / Math.max(w, h);
  const ox = (100 - w * s) / 2, oy = (100 - h * s) / 2;
  const d = rings
    .map((r) => r.map((p, i) => `${i ? "L" : "M"}${(ox + (p[0] * Math.cos(lat0) - minX) * s).toFixed(2)},${(oy + (-p[1] - minY) * s).toFixed(2)}`).join("") + "Z")
    .join("");
  return (
    <svg viewBox="-6 -6 112 112" className={className} aria-hidden>
      <path d={d} fill="#b9d531" fillOpacity={0.35} stroke="#1d3527" strokeWidth={1.4} strokeLinejoin="round" fillRule="evenodd" />
    </svg>
  );
}

/** Turns machine status messages ("openeo:queued:845") into readable text. */
function stepMessage(msg: string, t: (k: string, o?: Record<string, unknown>) => string) {
  const m = /^openeo:(\w+):(\d+)$/.exec(msg);
  if (!m) return msg;
  const secs = Number(m[2]);
  const time = secs >= 60 ? `${Math.floor(secs / 60)} min` : `${secs} s`;
  const key = ["created", "queued", "running", "finished"].includes(m[1]) ? m[1] : "other";
  return t(`openeo.${key}`, { time, status: m[1] });
}

export function StepList({ steps, order }: { steps: Record<string, StepState>; order: string[] }) {
  const { t } = useTranslation();
  return (
    <ol className="relative space-y-1">
      {order.map((key, i) => {
        const s = steps[key] ?? { status: "pending", message: null };
        return (
          <li key={key} className="relative flex items-start gap-4 py-2.5">
            {i < order.length - 1 && (
              <span className={`absolute left-[13px] top-9 h-[calc(100%-18px)] w-px ${s.status === "done" ? "bg-ink" : "bg-line"}`} />
            )}
            <span
              className={`relative z-10 grid size-7 shrink-0 place-items-center rounded-full border transition ${
                s.status === "done" ? "border-ink bg-ink text-leaf"
                : s.status === "running" ? "border-leaf-2 bg-leaf/30 text-ink"
                : s.status === "failed" ? "border-sienna bg-sienna/10 text-sienna"
                : "border-line bg-card text-muted"
              }`}
            >
              {s.status === "done" ? <Check size={14} strokeWidth={3} />
                : s.status === "running" ? <Loader2 size={14} className="animate-spin" />
                : s.status === "failed" ? <X size={14} strokeWidth={3} />
                : <CircleDashed size={14} />}
            </span>
            <div className="min-w-0 pt-0.5">
              <div className={`text-sm font-semibold ${s.status === "pending" ? "text-muted" : "text-ink"}`}>{t(`steps.${key}`)}</div>
              {s.message && <div className={`num mt-0.5 break-words text-xs ${s.status === "failed" ? "text-sienna" : "text-muted"}`}>{stepMessage(s.message, t)}</div>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
