"use client";

import { useEffect, useRef } from "react";
import Map from "ol/Map";
import View from "ol/View";
import TileLayer from "ol/layer/Tile";
import OSM from "ol/source/OSM";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import Feature from "ol/Feature";
import Point from "ol/geom/Point";
import { fromLonLat } from "ol/proj";
import { Style, Text, Fill } from "ol/style";

const NASHIK: [number, number] = [73.7898, 19.9975];

interface LocationMiniMapProps {
  locationText: string | null;
  structuredData?: Record<string, unknown> | null;
  height?: number;
}

function parseCoords(
  locationText: string | null,
  structuredData?: Record<string, unknown> | null
): [number, number] | null {
  if (structuredData) {
    const d = structuredData as Record<string, unknown>;
    // Top-level latitude/longitude (WhatsApp bot format)
    if (typeof d.latitude === "number" && typeof d.longitude === "number")
      return [d.longitude, d.latitude];
    // Nested gps object (mobile app format)
    const gps = d.gps as { latitude?: number; longitude?: number } | undefined;
    if (gps?.latitude && gps?.longitude) return [gps.longitude, gps.latitude];
  }

  // Parse "lat, lon" string
  if (locationText) {
    const parts = locationText.split(",").map((s) => parseFloat(s.trim()));
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      return [parts[1], parts[0]];
    }
  }

  return null;
}

export default function LocationMiniMap({ locationText, structuredData, height = 220 }: LocationMiniMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const coords = parseCoords(locationText, structuredData);

  useEffect(() => {
    if (!containerRef.current || !coords) return;

    const center = fromLonLat(coords);

    const markerSource = new VectorSource({
      features: [new Feature({ geometry: new Point(center) })],
    });

    const map = new Map({
      target: containerRef.current,
      layers: [
        new TileLayer({ source: new OSM() }),
        new VectorLayer({
          source: markerSource,
          style: new Style({
            text: new Text({
              text: "📍",
              font: "bold 24px sans-serif",
              fill: new Fill({ color: "#f97316" }),
              offsetY: -14,
            }),
          }),
        }),
      ],
      view: new View({ center, zoom: 16 }),
      controls: [],
    });

    mapRef.current = map;

    return () => {
      map.setTarget(undefined);
      mapRef.current = null;
    };
  }, [locationText, structuredData]);

  if (!coords) {
    return (
      <div className="text-xs text-white/50 font-mono py-2">
        No GPS coordinates available for this location.
      </div>
    );
  }

  return (
    <div>
      <div
        ref={containerRef}
        style={{ height, width: "100%", border: "2px solid #0a0a0a", borderRadius: 8, overflow: "hidden" }}
      />
      <div className="text-[10px] text-gray-400 mt-1 font-mono">
        {coords[1].toFixed(6)}, {coords[0].toFixed(6)}
      </div>
    </div>
  );
}
