"use client";
import { fetchMap } from "@/lib/supabase";

// OpenLayers — the library that powers openstreetmap.org itself.
// Loaded only via next/dynamic({ ssr: false }).
import { useEffect, useRef, useState } from "react";
import Map from "ol/Map";
import View from "ol/View";
import TileLayer from "ol/layer/Tile";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import OSM from "ol/source/OSM";
import GeoJSON from "ol/format/GeoJSON";
import Feature from "ol/Feature";
import Point from "ol/geom/Point";
import { fromLonLat } from "ol/proj";
import { Style, Fill, Stroke, Circle as CircleStyle, Text } from "ol/style";
import Overlay from "ol/Overlay";
import type { LiveCase } from "@/lib/types";

function escapeHtml(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

export interface ZoneCentroid {
  zone_name: string;
  centroid_lat: number;
  centroid_lng: number;
  live_case_count: number;
  critical_live_case_count: number;
  open_task_count: number;
  camera_count: number;
}

export interface LayerState {
  cctv: boolean;
  police: boolean;
  chokepoints: boolean;
  liveCases: boolean;
  zones: boolean;
}

interface Props {
  liveCases: LiveCase[];
  zoneCentroids: ZoneCentroid[];
  layers: LayerState;
  onSelectCase?: (c: LiveCase) => void;
}

const RISK_COLOR: Record<string, string> = {
  high: "#ef4444",
  medium: "#f97316",
  low: "#22c55e",
};

function emojiStyle(emoji: string, size = 22) {
  return new Style({
    text: new Text({
      text: emoji,
      font: `${size}px serif`,
      fill: new Fill({ color: "#000" }),
    }),
  });
}

function cctvStyle() {
  return new Style({
    image: new CircleStyle({
      radius: 4,
      fill: new Fill({ color: "rgba(96,165,250,0.8)" }),
      stroke: new Stroke({ color: "#1d4ed8", width: 0.5 }),
    }),
  });
}

function chopStyle(risk: string) {
  const color = RISK_COLOR[risk] ?? "#f97316";
  return new Style({
    image: new CircleStyle({
      radius: 6,
      fill: new Fill({ color }),
      stroke: new Stroke({ color: "#000", width: 1 }),
    }),
    text: new Text({
      text: risk === "high" ? "⛔" : risk === "medium" ? "⚠️" : "🚧",
      font: "16px serif",
      offsetY: -14,
    }),
  });
}

export default function LeafletFullMap({ liveCases, zoneCentroids, layers, onSelectCase }: Props) {
  const [mapError, setMapError] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<Overlay | null>(null);
  const layerRefs = useRef<Record<string, VectorLayer<VectorSource>>>({});
  const onSelectRef = useRef(onSelectCase);
  onSelectRef.current = onSelectCase;

  const zoneLookup = useRef<Record<string, ZoneCentroid>>({});
  for (const z of zoneCentroids) zoneLookup.current[z.zone_name] = z;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    // Popup overlay
    const popup = new Overlay({
      element: popupRef.current!,
      positioning: "bottom-center",
      stopEvent: false,
      offset: [0, -8],
    });
    overlayRef.current = popup;

    // ── Layers ────────────────────────────────────────────────────────────────
    const cctvSource = new VectorSource();
    const policeSource = new VectorSource();
    const chopSource = new VectorSource();
    const caseSource = new VectorSource();
    const zoneSource = new VectorSource();

    const cctvLayer = new VectorLayer({ source: cctvSource, style: cctvStyle(), visible: layers.cctv });
    const policeLayer = new VectorLayer({ source: policeSource, style: emojiStyle("🚔", 22), visible: layers.police });
    const chopLayer = new VectorLayer({ source: chopSource, visible: layers.chokepoints });
    const zoneLayer = new VectorLayer({ source: zoneSource, visible: layers.zones, zIndex: 5 });
    const caseLayer = new VectorLayer({ source: caseSource, visible: layers.liveCases, zIndex: 10 });

    layerRefs.current = { cctv: cctvLayer, police: policeLayer, chokepoints: chopLayer, liveCases: caseLayer, zones: zoneLayer };

    // ── Map ──────────────────────────────────────────────────────────────────
    // ── Zone features ─────────────────────────────────────────────────────────
    function syncZones() {
      zoneSource.clear();
      zoneCentroids.forEach((z) => {
        const hasLive = z.live_case_count > 0;
        const hasCritical = z.critical_live_case_count > 0;
        const fillColor = hasCritical
          ? "rgba(239,68,68,0.55)"
          : hasLive
          ? "rgba(249,115,22,0.55)"
          : "rgba(107,114,128,0.35)";
        const strokeColor = hasCritical ? "#ef4444" : hasLive ? "#f97316" : "#9ca3af";
        const feat = new Feature({ geometry: new Point(fromLonLat([z.centroid_lng, z.centroid_lat])) });
        feat.set("_type", "zone");
        feat.set("_zone", z);
        feat.setStyle(
          new Style({
            image: new CircleStyle({
              radius: 22,
              fill: new Fill({ color: fillColor }),
              stroke: new Stroke({ color: strokeColor, width: 2 }),
            }),
            text: new Text({
              text: z.zone_name.replace("Zone Area ", "Z"),
              font: "bold 10px sans-serif",
              fill: new Fill({ color: "#fff" }),
            }),
          })
        );
        zoneSource.addFeature(feat);
      });
    }
    syncZones();

    const map = new Map({
      target: containerRef.current,
      layers: [
        new TileLayer({ source: new OSM() }),
        cctvLayer,
        policeLayer,
        chopLayer,
        zoneLayer,
        caseLayer,
      ],
      overlays: [popup],
      view: new View({
        center: fromLonLat([73.7898, 19.9975]),
        zoom: 13,
      }),
    });
    mapRef.current = map;

    // ── Load GeoJSON data ────────────────────────────────────────────────────
    const fmt = new GeoJSON({ featureProjection: "EPSG:3857" });

    fetchMap("cctv-official.geojson")
      .then((r) => r.json())
      .then((g) => {
        const feats = fmt.readFeatures(g);
        feats.forEach((f) => f.setStyle(cctvStyle()));
        cctvSource.addFeatures(feats);
      }).catch(() => setMapError("CCTV layer unavailable. Reload to retry."));

    fetchMap("police-official.geojson")
      .then((r) => r.json())
      .then((g) => {
        const feats = fmt.readFeatures(g);
        feats.forEach((f) => {
          (f as Feature).set("_type", "police");
          f.setStyle(emojiStyle("🚔", 22));
        });
        policeSource.addFeatures(feats);
      }).catch(() => setMapError("Police layer unavailable. Reload to retry."));

    fetchMap("chokepoints-official.geojson")
      .then((r) => r.json())
      .then((g) => {
        const feats = fmt.readFeatures(g);
        feats.forEach((f) => {
          const risk = String(f.get("risk_level") ?? "");
          (f as Feature).set("_type", "chokepoint");
          f.setStyle(chopStyle(risk));
        });
        chopSource.addFeatures(feats);
      }).catch(() => setMapError("Chokepoint layer unavailable. Reload to retry."));

    // ── Live cases ───────────────────────────────────────────────────────────
    function syncCases() {
      caseSource.clear();
      liveCases.forEach((c) => {
        const zone = c.zone_name ? zoneLookup.current[c.zone_name] : null;
        if (!zone?.centroid_lat || !zone?.centroid_lng) return;
        const emoji = c.priority === "critical" ? "🚨" : c.priority === "high" ? "🔴" : "🟠";
        const size = c.priority === "critical" ? 30 : 24;
        const feat = new Feature({ geometry: new Point(fromLonLat([zone.centroid_lng, zone.centroid_lat])) });
        feat.set("_type", "livecase");
        feat.set("_case", c);
        feat.setStyle(emojiStyle(emoji, size));
        caseSource.addFeature(feat);
      });
    }
    syncCases();

    // ── Click handler ─────────────────────────────────────────────────────────
    map.on("click", (e) => {
      const feat = map.forEachFeatureAtPixel(e.pixel, (f) => f, { hitTolerance: 6 });
      if (!feat) { popup.setPosition(undefined); return; }

      const type = feat.get("_type");
      const coord = e.coordinate;

      if (type === "livecase") {
        const c: LiveCase = feat.get("_case");
        popupRef.current!.innerHTML =
          `<div class="font-black text-sm">${escapeHtml(c.missing_person_name || "(No Name)")}</div>` +
          `<div class="text-xs text-gray-600">Priority: ${c.priority ?? "—"} · ${c.zone_name ?? "—"}</div>` +
          `<button id="ol-case-btn" class="mt-1 text-xs bg-black text-white px-2 py-0.5 rounded">Open detail →</button>`;
        popup.setPosition(coord);
        setTimeout(() => {
          document.getElementById("ol-case-btn")?.addEventListener("click", () => {
            onSelectRef.current?.(c);
            popup.setPosition(undefined);
          });
        }, 0);
        return;
      }

      if (type === "zone") {
        const z: ZoneCentroid = feat.get("_zone");
        popupRef.current!.innerHTML =
          `<div class="font-black text-sm">${escapeHtml(z.zone_name)}</div>` +
          `<div class="text-xs text-gray-600 mt-1">📷 ${escapeHtml(z.camera_count)} cameras</div>` +
          `<div class="text-xs ${z.critical_live_case_count > 0 ? "text-red-600 font-bold" : "text-gray-600"}">🚨 ${escapeHtml(z.live_case_count)} live cases${z.critical_live_case_count > 0 ? ` (${escapeHtml(z.critical_live_case_count)} critical)` : ""}</div>` +
          `<div class="text-xs text-gray-600">📋 ${escapeHtml(z.open_task_count)} open tasks</div>`;
        popup.setPosition(coord);
        map.getView().animate({ center: fromLonLat([z.centroid_lng, z.centroid_lat]), zoom: 14, duration: 500 });
        return;
      }

      if (type === "police") {
        const name = feat.get("station_name") ?? feat.get("name") ?? "Police Station";
        popupRef.current!.innerHTML = `<div class="font-black text-sm">🚔 ${escapeHtml(name)}</div>`;
        popup.setPosition(coord);
        return;
      }

      if (type === "chokepoint") {
        const risk = feat.get("risk_level") ?? "—";
        const color = RISK_COLOR[risk] ?? "#f97316";
        popupRef.current!.innerHTML =
          `<div class="font-black text-sm">${escapeHtml(feat.get("location_name") ?? "Chokepoint")}</div>` +
          `<div class="text-xs" style="color:${color}">Risk: ${escapeHtml(risk)}</div>` +
          (feat.get("category") ? `<div class="text-xs text-gray-500">${escapeHtml(feat.get("category"))}</div>` : "") +
          (feat.get("note") ? `<div class="text-xs italic text-gray-500">${escapeHtml(feat.get("note"))}</div>` : "");
        popup.setPosition(coord);
        return;
      }

      // CCTV
      popupRef.current!.innerHTML =
        `<div class="font-black text-sm">📷 CCTV Camera</div>` +
        `<div class="text-xs text-gray-500">ID: ${feat.get("camera_id") ?? "—"}</div>` +
        `<div class="text-[10px] text-gray-400 italic">Location only — no footage analysis</div>`;
      popup.setPosition(coord);
    });

    map.on("pointermove", (e) => {
      const hit = map.hasFeatureAtPixel(e.pixel, { hitTolerance: 6 });
      map.getTargetElement().style.cursor = hit ? "pointer" : "";
    });

    return () => {
      map.setTarget(undefined);
      mapRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync live cases when data changes
  useEffect(() => {
    const src = layerRefs.current.liveCases?.getSource();
    if (!src) return;
    src.clear();
    liveCases.forEach((c) => {
      const zone = c.zone_name ? zoneLookup.current[c.zone_name] : null;
      if (!zone?.centroid_lat || !zone?.centroid_lng) return;
      const emoji = c.priority === "critical" ? "🚨" : c.priority === "high" ? "🔴" : "🟠";
      const feat = new Feature({ geometry: new Point(fromLonLat([zone.centroid_lng, zone.centroid_lat])) });
      feat.set("_type", "livecase");
      feat.set("_case", c);
      feat.setStyle(emojiStyle(emoji, c.priority === "critical" ? 30 : 24));
      src.addFeature(feat);
    });
  }, [liveCases, zoneCentroids]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync zones when data changes
  useEffect(() => {
    const src = layerRefs.current.zones?.getSource();
    if (!src) return;
    src.clear();
    zoneCentroids.forEach((z) => {
      const hasLive = z.live_case_count > 0;
      const hasCritical = z.critical_live_case_count > 0;
      const fillColor = hasCritical ? "rgba(239,68,68,0.55)" : hasLive ? "rgba(249,115,22,0.55)" : "rgba(107,114,128,0.35)";
      const strokeColor = hasCritical ? "#ef4444" : hasLive ? "#f97316" : "#9ca3af";
      const feat = new Feature({ geometry: new Point(fromLonLat([z.centroid_lng, z.centroid_lat])) });
      feat.set("_type", "zone");
      feat.set("_zone", z);
      feat.setStyle(new Style({
        image: new CircleStyle({ radius: 22, fill: new Fill({ color: fillColor }), stroke: new Stroke({ color: strokeColor, width: 2 }) }),
        text: new Text({ text: z.zone_name.replace("Zone Area ", "Z"), font: "bold 10px sans-serif", fill: new Fill({ color: "#fff" }) }),
      }));
      src.addFeature(feat);
    });
  }, [zoneCentroids]); // eslint-disable-line react-hooks/exhaustive-deps

  // Layer visibility
  useEffect(() => {
    layerRefs.current.cctv?.setVisible(layers.cctv);
    layerRefs.current.police?.setVisible(layers.police);
    layerRefs.current.chokepoints?.setVisible(layers.chokepoints);
    layerRefs.current.liveCases?.setVisible(layers.liveCases);
    layerRefs.current.zones?.setVisible(layers.zones);
  }, [layers]);

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      {mapError && <div role="alert" className="absolute top-2 left-12 z-10 bg-red-50 text-red-800 p-2">{mapError}</div>}
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
      {/* Popup */}
      <div
        ref={popupRef}
        style={{
          background: "#fff",
          border: "2px solid #0a0a0a",
          padding: "8px 10px",
          borderRadius: 2,
          boxShadow: "3px 3px 0 #0a0a0a",
          maxWidth: 220,
          fontSize: 12,
          pointerEvents: "auto",
          zIndex: 9999,
        }}
      />
    </div>
  );
}
