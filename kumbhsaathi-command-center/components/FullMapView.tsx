"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import type { LiveCase, ZoneSummary } from "@/lib/types";
import type { LayerState } from "./LeafletFullMap";

const OLMap = dynamic(() => import("./LeafletFullMap"), {
  ssr: false,
  loading: () => (
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#f3f4f6" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 40 }}>🗺️</div>
        <div style={{ fontWeight: 900, fontSize: 13, color: "#6b7280" }}>Loading OpenStreetMap…</div>
      </div>
    </div>
  ),
});

interface FilterBtn { key: keyof LayerState; emoji: string; label: string; count: number | null; activeColor: string; }
const FILTER_BTNS: FilterBtn[] = [
  { key: "cctv",        emoji: "📷", label: "CCTV",        count: 1280, activeColor: "bg-blue-600 text-white border-blue-800" },
  { key: "police",      emoji: "🚔", label: "Police",      count: 14,   activeColor: "bg-green-600 text-white border-green-800" },
  { key: "chokepoints", emoji: "🚧", label: "Chokepoints", count: 85,   activeColor: "bg-orange-500 text-white border-orange-700" },
  { key: "liveCases",   emoji: "🚨", label: "Live Cases",  count: null, activeColor: "bg-red-600 text-white border-red-800" },
  { key: "zones",       emoji: "🔵", label: "Zones",       count: null, activeColor: "bg-purple-600 text-white border-purple-800" },
];

interface FullMapViewProps {
  liveCases: LiveCase[];
  zones: ZoneSummary[];
  onSelectCase: (c: LiveCase) => void;
}

export default function FullMapView({ liveCases, zones, onSelectCase }: FullMapViewProps) {
  const [layers, setLayers] = useState<LayerState>({ cctv: true, police: true, chokepoints: true, liveCases: true, zones: true });
  const [mapHeight, setMapHeight] = useState<number | null>(null);

  useEffect(() => {
    const compute = () => setMapHeight(Math.max(400, window.innerHeight - 220));
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, []);

  const toggle = (key: keyof LayerState) => setLayers((p) => ({ ...p, [key]: !p[key] }));
  const openLive = liveCases.filter((c) => c.status === "open");
  const countFor = (key: keyof LayerState, def: number | null) => {
    if (key === "liveCases") return openLive.length;
    if (key === "zones") return zones.length;
    return def ?? 0;
  };

  return (
    <div>
      {/* Header + filter buttons */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="text-xl font-black uppercase tracking-wide text-white">Command Map</h2>
          <p className="text-xs text-white/70">Nashik Kumbh Mela — OpenStreetMap · live spatial overview</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {FILTER_BTNS.map(({ key, emoji, label, count, activeColor }) => (
            <button
              key={key}
              onClick={() => toggle(key)}
              className={`neo-btn px-3 py-1.5 text-sm flex items-center gap-1.5 ${
                layers[key] ? activeColor : "bg-white text-gray-400 border-gray-300"
              }`}
            >
              <span>{emoji}</span>
              <span className="font-black">{label}</span>
              <span className={`text-xs font-black px-1.5 py-0.5 rounded-sm ${
                layers[key] ? "bg-black/20" : "bg-gray-100 text-gray-500"
              }`}>
                {countFor(key, count)}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Map — explicit height, only mount when measured */}
      <div
        style={{
          width: "100%",
          height: mapHeight ?? 520,
          border: "2px solid #0a0a0a",
          overflow: "hidden",
          position: "relative",
        }}
      >
        {mapHeight !== null && (
          <OLMap
            key={mapHeight}
            liveCases={openLive}
            zoneCentroids={zones.map((z) => ({
              zone_name: z.zone_name,
              centroid_lat: z.centroid_lat,
              centroid_lng: z.centroid_lng,
              live_case_count: z.live_case_count,
              critical_live_case_count: z.critical_live_case_count,
              open_task_count: z.open_task_count,
              camera_count: z.camera_count,
            }))}
            layers={layers}
            onSelectCase={onSelectCase}
          />
        )}
      </div>

    </div>
  );
}
